import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js"

// ══════════════════════════════════════════════════════════════════════════════
// STYLE INJECTION — Inter font + global CSS + animation classes
// Font Awesome is loaded via index.html (no npm needed)
// ══════════════════════════════════════════════════════════════════════════════
const injectStyles = () => {
  if (document.getElementById("pf-styles")) return;

  const gf = document.createElement("link");
  gf.rel = "stylesheet";
  gf.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap";
  document.head.appendChild(gf);

  const s = document.createElement("style");
  s.id = "pf-styles";
  s.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #060d1f; font-family: 'Inter', -apple-system, sans-serif; color: #f1f5f9; }
    a { text-decoration: none; color: inherit; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: #060d1f; }
    ::-webkit-scrollbar-thumb { background: #1a2d50; border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: #3b82f6; }

    /* ── Scroll fade-in ── */
    .pf-fade { opacity: 0; transform: translateY(32px); transition: opacity .7s cubic-bezier(.4,0,.2,1), transform .7s cubic-bezier(.4,0,.2,1); }
    .pf-fade.pf-vis { opacity: 1; transform: translateY(0); }

    /* ── Interactive hovers ── */
    .pf-navlink:hover  { color: #93c5fd !important; }
    .pf-menulink:hover { color: #93c5fd !important; background: rgba(59,130,246,.08) !important; border-color: rgba(59,130,246,.2) !important; }
    .pf-social:hover   { border-color: #3b82f6 !important; color: #93c5fd !important; background: rgba(59,130,246,.1) !important; }
    .pf-chip:hover     { background: rgba(59,130,246,.22) !important; border-color: rgba(59,130,246,.45) !important; color: #93c5fd !important; }
    .pf-projcard:hover { transform: translateY(-5px) !important; border-color: rgba(59,130,246,.4) !important; box-shadow: 0 20px 50px rgba(0,0,0,.4) !important; }
    .pf-btnprimary:hover  { background: #2563eb !important; }
    .pf-btnoutline:hover  { background: rgba(59,130,246,.1) !important; }
    .pf-adminnav:hover    { background: rgba(59,130,246,.1) !important; color: #93c5fd !important; }
    .pf-uploadzone:hover  { border-color: #3b82f6 !important; background: rgba(59,130,246,.05) !important; }
  `;
  document.head.appendChild(s);
};

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════════════════
const sha256 = async str => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
};
const esc = v =>
  typeof v !== "string" ? v :
  v.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_USER  = import.meta.env.VITE_ADMIN_USER;
const ADMIN_PASS  = import.meta.env.VITE_ADMIN_PASS;
const MAX_TRIES   = 5;
const LOCK_MS     = 15 * 60 * 1000;

// Secret admin access — values loaded from environment variables only
// Method 1: URL query param  →  yoursite.com?portal=TOKEN  (TOKEN set in VITE_ADMIN_TOKEN)
// Method 2: Logo click       →  click the "J." logo 5 times rapidly
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

const SK = "pf_v5_sess";
const LK = "pf_v5_lock";

// ══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:    "#060d1f",   // near-black navy
  bgS:   "#090f22",   // section alt bg
  bgC:   "#0d1730",   // card bg
  bgH:   "#132040",   // hover / elevated
  ac:    "#3b82f6",   // blue accent
  acL:   "#93c5fd",   // lighter blue
  acG:   "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  txt:   "#f1f5f9",   // primary text
  muted: "#94a3b8",   // secondary text
  bdr:   "#182844",   // border
  f:     "'Inter', -apple-system, sans-serif",
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// ── useData — reads and writes go directly to Supabase ──────────────────────
function useData() {
  const [data,    setData]    = useState(null);  // null = not yet loaded
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Load from Supabase once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: rows, error: err } = await supabase
          .from("portfolio_data")
          .select("data")
          .eq("id", 1)
          .single();

        if (err) throw err;
        if (!cancelled) setData(rows?.data ?? {});
      } catch (err) {
        console.error("[useData] Failed to load from Supabase:", err.message);
        if (!cancelled) setError("Could not load portfolio data. Please check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save a section to Supabase — optimistic update so UI feels instant
  const update = (key, val) => {
    const next = { ...data, [key]: val };
    setData(next);

    (async () => {
      try {
        const { error: err } = await supabase
          .from("portfolio_data")
          .update({ data: next, updated_at: new Date().toISOString() })
          .eq("id", 1);
        if (err) throw err;
      } catch (err) {
        console.error("[useData] Failed to save to Supabase:", err.message);
      }
    })();
  };

  return [data, update, loading, error];
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ══════════════════════════════════════════════════════════════════════════════
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("pf-fade");
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("pf-vis"); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════
function Btn({ children, variant = "primary", style: s = {}, ...rest }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "11px 24px", borderRadius: 9, fontSize: 14, fontWeight: 600,
    fontFamily: C.f, border: "none", cursor: "pointer", transition: "all .18s",
    letterSpacing: .1, ...s,
  };
  const variants = {
    primary: { background: C.ac,                     color: "#fff",   className: "pf-btnprimary" },
    outline: { background: "transparent",             color: C.ac,     border: `1.5px solid ${C.ac}`, className: "pf-btnoutline" },
    ghost:   { background: "transparent",             color: C.muted,  border: "none" },
    danger:  { background: "rgba(239,68,68,.12)",     color: "#f87171", border: "1px solid rgba(239,68,68,.28)" },
    subtle:  { background: C.bgH,                    color: C.txt,    border: `1px solid ${C.bdr}` },
  };
  const { className: cn, ...vs } = variants[variant];
  return <button className={cn || ""} style={{ ...base, ...vs }} {...rest}>{children}</button>;
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
      letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 7, fontFamily: C.f }}>
      {label}
    </label>
    {children}
  </div>
);

const iSt = {
  width: "100%", padding: "10px 14px", border: `1.5px solid ${C.bdr}`,
  borderRadius: 8, fontSize: 14, outline: "none", fontFamily: C.f,
  color: C.txt, background: C.bgS, transition: "border-color .18s",
};
const Inp = p => (
  <input style={iSt}
    onFocus={e => e.target.style.borderColor = C.ac}
    onBlur={e => e.target.style.borderColor = C.bdr} {...p} />
);
const TA = p => (
  <textarea style={{ ...iSt, resize: "vertical", minHeight: 120 }}
    onFocus={e => e.target.style.borderColor = C.ac}
    onBlur={e => e.target.style.borderColor = C.bdr} {...p} />
);
const Card = ({ children, style: s = {} }) => (
  <div style={{ background: C.bgC, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: 24, ...s }}>
    {children}
  </div>
);

const SHead = ({ eyebrow, title }) => (
  <div style={{ marginBottom: 56 }}>
    <span style={{ fontSize: 12, fontWeight: 700, color: C.ac, letterSpacing: 2,
      textTransform: "uppercase", fontFamily: C.f, display: "block", marginBottom: 14 }}>
      {eyebrow}
    </span>
    <h2 style={{ fontFamily: C.f, fontSize: "clamp(28px,4vw,44px)", fontWeight: 800,
      color: C.txt, margin: 0, letterSpacing: -.8, lineHeight: 1.1 }}>
      {title}
    </h2>
    <div style={{ marginTop: 18, display: "flex", gap: 6 }}>
      <div style={{ width: 38, height: 3, background: C.ac, borderRadius: 99 }} />
      <div style={{ width: 14, height: 3, background: `${C.ac}55`, borderRadius: 99 }} />
    </div>
  </div>
);

const Toast = ({ msg }) => msg ? (
  <div style={{ position: "fixed", bottom: 28, right: 28, background: C.ac, color: "#fff",
    padding: "13px 22px", borderRadius: 10, fontSize: 14, fontWeight: 600,
    boxShadow: `0 8px 32px ${C.ac}55`, zIndex: 9999, fontFamily: C.f,
    display: "flex", alignItems: "center", gap: 9 }}>
    <i className="fas fa-check" /> {msg}
  </div>
) : null;

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION — fully responsive with hamburger menu
// ══════════════════════════════════════════════════════════════════════════════
function Nav({ onLogoClick }) {
  const [open, setOpen]     = useState(false);
  const [clicks, setClicks] = useState(0);
  const timerRef            = useRef(null);
  const width               = useWindowWidth();
  const isMobile            = width < 768;
  const links               = ["About", "Skills", "Experience", "Projects", "Education", "Contact"];

  useEffect(() => { if (!isMobile) setOpen(false); }, [isMobile]);

  // 5-click sequence on logo — resets if 2 seconds pass between clicks
  const handleLogoClick = e => {
    e.preventDefault();
    clearTimeout(timerRef.current);
    const next = clicks + 1;
    if (next >= 5) {
      setClicks(0);
      onLogoClick?.();
    } else {
      setClicks(next);
      timerRef.current = setTimeout(() => setClicks(0), 2000);
    }
  };

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 200,
      background: "rgba(6,13,31,.93)", backdropFilter: "blur(18px)",
      borderBottom: `1px solid ${C.bdr}` }}>

      {/* Top bar */}
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>

        {/* Logo — click 5 times rapidly to open admin login */}
        <a href="#" onClick={handleLogoClick}
          style={{ fontFamily: C.f, fontSize: 20, fontWeight: 900, color: C.txt,
            letterSpacing: -.5, userSelect: "none" }}>
          J<span style={{ color: C.ac }}>.</span>
        </a>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 2 }}>
            {links.map(l => (
              <a key={l} href={`#${l.toLowerCase()}`} className="pf-navlink"
                style={{ padding: "6px 15px", fontSize: 13, color: C.muted, borderRadius: 7,
                  fontWeight: 500, fontFamily: C.f, transition: "color .18s" }}>
                {l}
              </a>
            ))}
          </div>
        )}

        {/* Hamburger button */}
        {isMobile && (
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            style={{ background: "none", border: `1px solid ${C.bdr}`, borderRadius: 9,
              padding: "8px 12px", color: C.txt, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", transition: "border-color .18s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.ac}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.bdr}>
            <i className={`fas ${open ? "fa-times" : "fa-bars"}`}
              style={{ fontSize: 17, color: open ? C.ac : C.txt, transition: "color .18s" }} />
          </button>
        )}
      </div>

      {/* Mobile dropdown */}
      {isMobile && open && (
        <div style={{ background: "rgba(6,13,31,.98)", borderTop: `1px solid ${C.bdr}`,
          padding: "8px 16px 16px" }}>
          {links.map((l, i) => (
            <a key={l} href={`#${l.toLowerCase()}`} className="pf-menulink"
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 16px", borderRadius: 9, marginBottom: i < links.length - 1 ? 4 : 0,
                fontSize: 15, color: C.muted, fontWeight: 500, fontFamily: C.f,
                border: "1px solid transparent", transition: "all .15s" }}>
              <span>{l}</span>
              <i className="fas fa-chevron-right" style={{ fontSize: 11, opacity: .35 }} />
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO — split layout: text left, visual right
// ══════════════════════════════════════════════════════════════════════════════
function Hero({ data }) {
  const h = data.hero;
  const width = useWindowWidth();
  const isNarrow = width < 900;

  return (
    <section style={{ background: C.bg, padding: isNarrow ? "80px 0 72px" : "108px 0 100px",
      borderBottom: `1px solid ${C.bdr}`, position: "relative", overflow: "hidden" }}>
      {/* Ambient background glow */}
      <div style={{ position: "absolute", top: "-30%", left: "-5%", width: "55%", height: "160%",
        background: `radial-gradient(ellipse, ${C.ac}09 0%, transparent 65%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-20%", right: "5%", width: "40%", height: "100%",
        background: `radial-gradient(ellipse, #1d4ed808 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isNarrow ? 0 : 72,
          flexDirection: isNarrow ? "column" : "row" }}>

          {/* ── Left: Text ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Available badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
              background: `${C.ac}14`, border: `1px solid ${C.ac}28`,
              borderRadius: 99, padding: "6px 18px", marginBottom: 30 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e",
                boxShadow: "0 0 8px #22c55e" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acL, fontFamily: C.f,
                letterSpacing: 1, textTransform: "uppercase" }}>
                Available for Work
              </span>
            </div>

            <h1 style={{ fontFamily: C.f, fontSize: "clamp(38px,5.5vw,70px)", fontWeight: 900,
              color: C.txt, margin: "0 0 12px", letterSpacing: -2.5, lineHeight: 1.03 }}>
              {h.name}
            </h1>
            <h2 style={{ fontFamily: C.f, fontSize: "clamp(16px,2.2vw,24px)", fontWeight: 500,
              color: C.ac, margin: "0 0 24px", letterSpacing: -.2, fontStyle: "normal" }}>
              {h.title}
            </h2>
            <p style={{ fontFamily: C.f, fontSize: 16, color: C.muted, margin: "0 0 38px",
              maxWidth: 500, lineHeight: 1.85, fontWeight: 400 }}>
              {h.tagline}
            </p>

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 36 }}>
              <a href="#contact"
                style={{ display: "inline-flex", alignItems: "center", gap: 9,
                  padding: "13px 30px", borderRadius: 9, fontSize: 14, fontWeight: 700,
                  background: C.ac, color: "#fff", fontFamily: C.f, letterSpacing: .1,
                  transition: "background .18s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#2563eb"}
                onMouseLeave={e => e.currentTarget.style.background = C.ac}>
                <i className="fas fa-envelope" /> Get in Touch
              </a>
              {h.resumeUrl && (
                <a href={h.resumeUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 9,
                    padding: "13px 30px", borderRadius: 9, fontSize: 14, fontWeight: 700,
                    background: "transparent", color: C.ac, border: `1.5px solid ${C.ac}`,
                    fontFamily: C.f, letterSpacing: .1, transition: "background .18s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,.1)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <i className="fas fa-download" /> Download Resume
                </a>
              )}
            </div>

            {/* Meta info */}
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 28 }}>
              {[
                { icon: "fas fa-map-marker-alt", text: h.location },
                { icon: "fas fa-envelope",       text: h.email },
              ].map(({ icon, text }) => (
                <span key={text} style={{ display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, color: C.muted, fontFamily: C.f }}>
                  <i className={icon} style={{ color: C.ac, fontSize: 13 }} /> {text}
                </span>
              ))}
            </div>

            {/* Social icons — URLs managed from Admin > Hero */}
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { icon: "fab fa-github",   title: "GitHub",   url: h.githubUrl },
                { icon: "fab fa-linkedin", title: "LinkedIn", url: h.linkedinUrl },
                { icon: "fab fa-facebook", title: "Facebook", url: h.facebookUrl },
              ].map(({ icon, title, url }) => {
                const inner = (
                  <div className="pf-social" title={title}
                    style={{ width: 42, height: 42, borderRadius: 10, background: C.bgC,
                      border: `1px solid ${C.bdr}`, display: "flex", alignItems: "center",
                      justifyContent: "center", color: C.muted, fontSize: 17,
                      transition: "all .2s", cursor: url ? "pointer" : "default" }}>
                    <i className={icon} />
                  </div>
                );
                return url
                  ? <a key={title} href={url} target="_blank" rel="noreferrer"
                      style={{ textDecoration: "none" }}>{inner}</a>
                  : <div key={title}>{inner}</div>;
              })}
            </div>
          </div>

          {/* ── Right: Visual card ── */}
          {!isNarrow && (
            <div style={{ flexShrink: 0, position: "relative", marginTop: 0 }}>
              {/* Main avatar card */}
              <div style={{ width: 290, height: 290, borderRadius: 30,
                background: `linear-gradient(145deg, ${C.bgC} 0%, ${C.bgH} 100%)`,
                border: `1px solid ${C.bdr}`, position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 40px 80px rgba(0,0,0,.5), 0 0 0 1px ${C.bdr}, inset 0 1px 0 rgba(255,255,255,.04)` }}>
                {/* Inner glow */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 30,
                  background: `radial-gradient(ellipse at 30% 20%, ${C.ac}10 0%, transparent 60%)` }} />
                {/* Initials */}
                <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
                  <div style={{ fontFamily: C.f, fontSize: 76, fontWeight: 900, color: C.ac,
                    letterSpacing: -5, lineHeight: 1, marginBottom: 14,
                    textShadow: `0 0 50px ${C.ac}66` }}>
                    {h.name.split(" ").map(n => n[0]).join("").slice(0, 3)}
                  </div>
                  <div style={{ fontFamily: C.f, fontSize: 11, fontWeight: 700, color: C.muted,
                    letterSpacing: 2.5, textTransform: "uppercase" }}>
                    {h.title}
                  </div>
                </div>
              </div>

              {/* Floating badge — experience */}
              <div style={{ position: "absolute", top: -18, right: -22,
                background: C.bgC, border: `1px solid ${C.bdr}`,
                borderRadius: 14, padding: "12px 18px",
                boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
                <div style={{ fontFamily: C.f, fontSize: 26, fontWeight: 900, color: C.ac, lineHeight: 1 }}>
                  {h.years.replace(/<1/, "0").match(/\d+/)?.[0]}+
                </div>
                <div style={{ fontFamily: C.f, fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 4 }}>
                  Yrs Exp.
                </div>
              </div>

              {/* Floating badge — skills count */}
              <div style={{ position: "absolute", bottom: -18, left: -22,
                background: C.bgC, border: `1px solid ${C.bdr}`,
                borderRadius: 14, padding: "12px 18px",
                boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
                <div style={{ fontFamily: C.f, fontSize: 26, fontWeight: 900, color: C.ac, lineHeight: 1 }}>
                  {data.skills.length}
                </div>
                <div style={{ fontFamily: C.f, fontSize: 11, fontWeight: 600, color: C.muted, marginTop: 4 }}>
                  Skills
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABOUT
// ══════════════════════════════════════════════════════════════════════════════
function About({ data }) {
  const ref = useFadeIn();
  return (
    <section id="about" ref={ref} style={{ padding: "96px 0", background: C.bgS }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="Who I Am" title="About Me" />
        <div style={{ maxWidth: 700 }}>
          {data.about.bio
            ? <p style={{ fontFamily: C.f, fontSize: 17, color: C.muted, lineHeight: 1.9, margin: 0 }}>
                {data.about.bio}
              </p>
            : <p style={{ fontFamily: C.f, fontSize: 15, color: C.muted, fontStyle: "italic" }}>
                No bio added yet. Go to the admin panel to write one.
              </p>}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SKILLS
// ══════════════════════════════════════════════════════════════════════════════
function Skills({ data }) {
  const ref = useFadeIn();
  const grouped = data.skills.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <section id="skills" ref={ref} style={{ padding: "96px 0", background: C.bg }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="What I Know" title="Skills" />
        {!data.skills.length
          ? <p style={{ color: C.muted, fontStyle: "italic", fontFamily: C.f }}>No skills added yet.</p>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
              {Object.entries(grouped).map(([cat, skills]) => (
                <Card key={cat}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.ac,
                      boxShadow: `0 0 10px ${C.ac}` }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.ac, fontFamily: C.f,
                      letterSpacing: 1.5, textTransform: "uppercase" }}>{cat}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {skills.map(s => (
                      <span key={s.id} className="pf-chip"
                        style={{ fontSize: 13, fontWeight: 500, color: C.acL,
                          background: `${C.ac}18`, border: `1px solid ${C.ac}28`,
                          borderRadius: 7, padding: "7px 15px", fontFamily: C.f,
                          transition: "all .18s", cursor: "default" }}>
                        {s.name}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPERIENCE
// ══════════════════════════════════════════════════════════════════════════════
function Experience({ data }) {
  const ref = useFadeIn();
  return (
    <section id="experience" ref={ref} style={{ padding: "96px 0", background: C.bgS }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="My Journey" title="Work Experience" />
        {!data.experience.length
          ? <p style={{ color: C.muted, fontStyle: "italic", fontFamily: C.f }}>No experience added yet.</p>
          : <div style={{ maxWidth: 760, position: "relative" }}>
              {/* Timeline line */}
              <div style={{ position: "absolute", left: 0, top: 8, bottom: 0, width: 2,
                background: `linear-gradient(to bottom, ${C.ac}, ${C.ac}00)` }} />
              {data.experience.map((e, i) => (
                <div key={e.id} style={{ paddingLeft: 40,
                  paddingBottom: i < data.experience.length - 1 ? 44 : 0,
                  position: "relative" }}>
                  {/* Dot */}
                  <div style={{ position: "absolute", left: -7, top: 6, width: 16, height: 16,
                    borderRadius: "50%", background: C.ac, border: `3px solid ${C.bg}`,
                    boxShadow: `0 0 16px ${C.ac}88` }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.ac, fontFamily: C.f,
                    letterSpacing: .3, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
                    <i className="fas fa-calendar-alt" style={{ opacity: .7 }} />
                    {e.startDate} — {e.endDate || "Present"}
                  </div>
                  <h3 style={{ fontFamily: C.f, fontSize: 20, fontWeight: 700, color: C.txt,
                    margin: "0 0 5px", letterSpacing: -.3 }}>{e.position}</h3>
                  <p style={{ fontFamily: C.f, fontSize: 14, fontWeight: 600, color: C.ac,
                    margin: "0 0 12px" }}>{e.company}</p>
                  {e.description && (
                    <p style={{ fontFamily: C.f, fontSize: 14, color: C.muted, lineHeight: 1.8, margin: 0 }}>
                      {e.description}
                    </p>
                  )}
                </div>
              ))}
            </div>}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECTS — image on top, title + description below
// ══════════════════════════════════════════════════════════════════════════════
function Projects({ data }) {
  const ref = useFadeIn();
  return (
    <section id="projects" ref={ref} style={{ padding: "96px 0", background: C.bg }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="My Work" title="Projects" />
        {!data.projects.length
          ? <p style={{ color: C.muted, fontStyle: "italic", fontFamily: C.f }}>No projects added yet.</p>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
              {data.projects.map(p => (
                <div key={p.id} className="pf-projcard"
                  style={{ background: C.bgC, border: `1px solid ${C.bdr}`, borderRadius: 16,
                    overflow: "hidden", transition: "all .25s", boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}>
                  {/* Top accent line */}
                  <div style={{ height: 3, background: `linear-gradient(90deg, ${C.ac}, #1d4ed8)` }} />
                  {/* Image */}
                  {p.imageData
                    ? <img src={p.imageData} alt={p.title}
                        style={{ width: "100%", height: 210, objectFit: "cover", display: "block" }} />
                    : <div style={{ height: 210, background: C.bgH,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexDirection: "column", gap: 12, borderBottom: `1px solid ${C.bdr}` }}>
                        <i className="fas fa-chart-bar" style={{ fontSize: 40, color: C.bdr }} />
                        <span style={{ fontSize: 12, color: C.muted, fontFamily: C.f }}>No preview</span>
                      </div>}
                  {/* Content */}
                  <div style={{ padding: "22px 24px 26px" }}>
                    <h3 style={{ fontFamily: C.f, fontSize: 18, fontWeight: 700, color: C.txt,
                      margin: "0 0 10px", letterSpacing: -.3 }}>{p.title}</h3>
                    <p style={{ fontFamily: C.f, fontSize: 14, color: C.muted, lineHeight: 1.75,
                      margin: "0 0 18px" }}>{p.description}</p>
                    {p.tags && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {p.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} style={{ fontSize: 11, fontWeight: 600, color: C.ac,
                            background: `${C.ac}18`, border: `1px solid ${C.ac}28`,
                            borderRadius: 6, padding: "4px 11px", fontFamily: C.f }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDUCATION
// ══════════════════════════════════════════════════════════════════════════════
function Education({ data }) {
  const ref = useFadeIn();
  return (
    <section id="education" ref={ref} style={{ padding: "96px 0", background: C.bgS }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="My Background" title="Education" />
        {!data.education.length
          ? <p style={{ color: C.muted, fontStyle: "italic", fontFamily: C.f }}>No education added yet.</p>
          : <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 660 }}>
              {data.education.map(e => (
                <Card key={e.id} style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0,
                    background: `${C.ac}15`, border: `1px solid ${C.ac}26`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="fas fa-graduation-cap" style={{ fontSize: 22, color: C.ac }} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: C.f, fontSize: 16, fontWeight: 700, color: C.txt,
                      margin: "0 0 4px" }}>{e.degree}</h3>
                    <p style={{ fontFamily: C.f, fontSize: 14, fontWeight: 600, color: C.ac,
                      margin: "0 0 4px" }}>{e.school}</p>
                    <p style={{ fontFamily: C.f, fontSize: 12, color: C.muted, margin: 0 }}>
                      {e.startYear} — {e.endYear || "Present"}
                    </p>
                  </div>
                </Card>
              ))}
            </div>}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTACT
// ══════════════════════════════════════════════════════════════════════════════
function Contact({ data }) {
  const ref = useFadeIn();
  const { email, location } = data.hero;
  return (
    <section id="contact" ref={ref} style={{ padding: "96px 0", background: C.bg }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
        <SHead eyebrow="Let's Talk" title="Contact" />
        <p style={{ fontFamily: C.f, fontSize: 16, color: C.muted, margin: "0 0 40px",
          maxWidth: 480, lineHeight: 1.85 }}>
          Interested in working together or just want to say hello? Reach out anytime!
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { icon: "fas fa-envelope",       label: "Email",    value: email,    href: `mailto:${email}` },
            { icon: "fas fa-map-marker-alt", label: "Location", value: location },
          ].map(({ icon, label, value, href }) => {
            const inner = (
              <Card style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 290,
                transition: "border-color .18s" }}>
                <div style={{ width: 52, height: 52, borderRadius: 13, flexShrink: 0,
                  background: `${C.ac}15`, border: `1px solid ${C.ac}26`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={icon} style={{ fontSize: 20, color: C.ac }} />
                </div>
                <div>
                  <p style={{ margin: "0 0 5px", fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: 1.2, fontFamily: C.f }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.txt, fontFamily: C.f }}>
                    {value}
                  </p>
                </div>
              </Card>
            );
            return href
              ? <a key={label} href={href} style={{ textDecoration: "none" }}>{inner}</a>
              : <div key={label}>{inner}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ══════════════════════════════════════════════════════════════════════════════
function Footer({ data }) {
  return (
    <footer style={{ background: C.bgS, borderTop: `1px solid ${C.bdr}`, padding: "28px 0" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontFamily: C.f, fontSize: 14, color: C.muted }}>
          © {new Date().getFullYear()}{" "}
          <span style={{ color: C.txt, fontWeight: 600 }}>{data.hero.name}</span>.
          All rights reserved.
        </span>
        {/* <span style={{ fontFamily: C.f, fontSize: 13, color: C.muted }}>
          Built with <span style={{ color: C.ac, fontWeight: 600 }}>React</span>
        </span> */}
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PORTFOLIO VIEW
// ══════════════════════════════════════════════════════════════════════════════
function PortfolioView({ data, onLogoClick }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <Nav onLogoClick={onLogoClick} />
      <Hero data={data} />
      <About data={data} />
      <Skills data={data} />
      <Experience data={data} />
      <Projects data={data} />
      <Education data={data} />
      <Contact data={data} />
      <Footer data={data} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN LOGIN
// ══════════════════════════════════════════════════════════════════════════════
function AdminLogin({ onSuccess, onBack }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [mins, setMins] = useState(0);

  useEffect(() => {
    const lock = (() => { try { return JSON.parse(localStorage.getItem(LK) || "null"); } catch { return null; } })();
    if (lock && Date.now() < lock.until) {
      setLocked(true);
      setMins(Math.ceil((lock.until - Date.now()) / 60000));
    }
  }, []);

  const submit = async () => {
    setErr("");
    const lock = (() => { try { return JSON.parse(localStorage.getItem(LK) || "null"); } catch { return null; } })();
    if (lock && Date.now() < lock.until) {
      setLocked(true); setMins(Math.ceil((lock.until - Date.now()) / 60000)); return;
    }
    const [hIn, hReal] = await Promise.all([sha256(p), sha256(ADMIN_PASS)]);
    if (u.trim().toLowerCase() === ADMIN_USER && hIn === hReal) {
      const token = await sha256(Date.now() + Math.random().toString());
      sessionStorage.setItem(SK, token); localStorage.removeItem(LK); onSuccess();
    } else {
      const prev = (() => { try { return JSON.parse(localStorage.getItem(LK) || '{"count":0}'); } catch { return { count: 0 }; } })();
      const count = (prev.count || 0) + 1;
      if (count >= MAX_TRIES) {
        localStorage.setItem(LK, JSON.stringify({ count, until: Date.now() + LOCK_MS }));
        setLocked(true); setMins(15);
      } else {
        localStorage.setItem(LK, JSON.stringify({ count, until: 0 }));
        setErr(`Invalid credentials. ${MAX_TRIES - count} attempt(s) remaining.`);
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.bg, position: "relative", overflow: "hidden" }}>
      {/* Glow */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-60%)",
        width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(${C.ac}0c, transparent 70%)`, pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 420, padding: 24, position: "relative", zIndex: 1 }}>
        <Card style={{ padding: 44 }}>
          <div style={{ textAlign: "center", marginBottom: 38 }}>
            <div style={{ width: 68, height: 68, borderRadius: 20, margin: "0 auto 22px",
              background: C.acG, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 12px 36px ${C.ac}44` }}>
              <i className="fas fa-shield-alt" style={{ fontSize: 28, color: "#fff" }} />
            </div>
            <h1 style={{ fontFamily: C.f, fontSize: 26, fontWeight: 800, color: C.txt,
              margin: "0 0 8px", letterSpacing: -.4 }}>
              Admin Access
            </h1>
            <p style={{ fontFamily: C.f, fontSize: 14, color: C.muted, margin: 0 }}>
              Sign in to manage your portfolio
            </p>
          </div>

          {locked ? (
            <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)",
              borderRadius: 12, padding: "22px 20px", textAlign: "center" }}>
              <i className="fas fa-lock" style={{ fontSize: 28, color: "#f87171", display: "block", marginBottom: 10 }} />
              <p style={{ fontFamily: C.f, fontSize: 14, color: "#f87171", margin: 0, fontWeight: 600 }}>
                Account locked — {mins} minute{mins !== 1 ? "s" : ""} remaining
              </p>
            </div>
          ) : (
            <>
              {err && (
                <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.28)",
                  borderRadius: 9, padding: "12px 16px", marginBottom: 22,
                  display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="fas fa-exclamation-circle" style={{ color: "#f87171", flexShrink: 0 }} />
                  <span style={{ fontFamily: C.f, fontSize: 13, color: "#f87171" }}>{err}</span>
                </div>
              )}
              <Field label="Username">
                <Inp value={u} onChange={e => setU(e.target.value)} placeholder="Enter username"
                  autoComplete="off" onKeyDown={e => e.key === "Enter" && submit()} />
              </Field>
              <Field label="Password">
                <Inp type="password" value={p} onChange={e => setP(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => e.key === "Enter" && submit()} />
              </Field>
              <Btn variant="primary" onClick={submit}
                style={{ width: "100%", justifyContent: "center", padding: "13px", marginTop: 6 }}>
                <i className="fas fa-sign-in-alt" /> Sign In
              </Btn>
            </>
          )}
          <Btn variant="ghost" onClick={onBack}
            style={{ width: "100%", justifyContent: "center", marginTop: 12, fontSize: 13 }}>
            <i className="fas fa-arrow-left" /> Back to Portfolio
          </Btn>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ data, update, onLogout, onViewPortfolio }) {
  const [tab, setTab] = useState("hero");
  const [toast, setToast] = useState("");
  const width = useWindowWidth();
  const isMobile = width < 768;
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  const tabs = [
    { id: "hero",       label: "Hero / Profile", icon: "fa-user-circle" },
    { id: "about",      label: "About Me",        icon: "fa-id-card" },
    { id: "skills",     label: "Skills",          icon: "fa-bolt" },
    { id: "experience", label: "Experience",      icon: "fa-briefcase" },
    { id: "projects",   label: "Projects",        icon: "fa-folder-open" },
    { id: "education",  label: "Education",       icon: "fa-graduation-cap" },
  ];

  const props = { data, update, showToast };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: C.bg, fontFamily: C.f }}>
      {/* ── Sidebar (desktop) ── */}
      {!isMobile && (
        <aside style={{ width: 252, background: C.bgC, borderRight: `1px solid ${C.bdr}`,
          display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
          <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.bdr}` }}>
            <span style={{ fontFamily: C.f, fontSize: 20, fontWeight: 900, color: C.txt }}>
              J<span style={{ color: C.ac }}>.</span>
            </span>
            <p style={{ margin: "5px 0 0", fontSize: 11, fontWeight: 700, color: C.muted,
              letterSpacing: 1.2, textTransform: "uppercase" }}>Admin Panel</p>
          </div>

          <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className="pf-adminnav"
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%",
                  textAlign: "left", padding: "10px 14px", borderRadius: 9, border: "none",
                  cursor: "pointer", fontSize: 13, marginBottom: 3, fontFamily: C.f,
                  background: tab === t.id ? `${C.ac}1a` : "transparent",
                  color: tab === t.id ? C.ac : C.muted,
                  fontWeight: tab === t.id ? 700 : 400,
                  borderLeft: tab === t.id ? `2.5px solid ${C.ac}` : "2.5px solid transparent",
                  transition: "all .15s" }}>
                <i className={`fas ${t.icon}`} style={{ width: 16, textAlign: "center", fontSize: 13 }} />
                {t.label}
              </button>
            ))}
          </nav>

          <div style={{ padding: "12px 10px", borderTop: `1px solid ${C.bdr}`,
            display: "flex", flexDirection: "column", gap: 7 }}>
            <Btn variant="subtle" onClick={onViewPortfolio}
              style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "9px" }}>
              <i className="fas fa-eye" /> View Portfolio
            </Btn>
            <Btn variant="danger" onClick={onLogout}
              style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "9px" }}>
              <i className="fas fa-sign-out-alt" /> Sign Out
            </Btn>
          </div>
        </aside>
      )}

      {/* ── Mobile bottom tab bar ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: C.bgC, borderTop: `1px solid ${C.bdr}`,
          display: "flex", overflowX: "auto", padding: "6px 4px 10px" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                padding: "8px 14px", border: "none", cursor: "pointer", borderRadius: 9,
                background: tab === t.id ? `${C.ac}1a` : "transparent",
                color: tab === t.id ? C.ac : C.muted,
                fontFamily: C.f, fontSize: 10, fontWeight: 700, flexShrink: 0, minWidth: 62 }}>
              <i className={`fas ${t.icon}`} style={{ fontSize: 17 }} />
              {t.label.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ flex: 1, padding: isMobile ? "24px 20px 110px" : "46px 56px",
        overflowY: "auto", minHeight: "100vh" }}>
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: C.txt }}>
              J<span style={{ color: C.ac }}>.</span> Admin
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="subtle" onClick={onViewPortfolio} style={{ padding: "8px 12px", fontSize: 12 }}>
                <i className="fas fa-eye" />
              </Btn>
              <Btn variant="danger" onClick={onLogout} style={{ padding: "8px 12px", fontSize: 12 }}>
                <i className="fas fa-sign-out-alt" />
              </Btn>
            </div>
          </div>
        )}
        {tab === "hero"       && <HeroAdmin {...props} />}
        {tab === "about"      && <AboutAdmin {...props} />}
        {tab === "skills"     && <SkillsAdmin {...props} />}
        {tab === "experience" && <ExpAdmin {...props} />}
        {tab === "projects"   && <ProjAdmin {...props} />}
        {tab === "education"  && <EduAdmin {...props} />}
      </main>
      <Toast msg={toast} />
    </div>
  );
}

// ── Section wrapper for admin pages ──────────────────────────────────────────
const ASection = ({ eyebrow, title, children }) => (
  <div>
    <div style={{ marginBottom: 34 }}>
      <p style={{ fontFamily: C.f, fontSize: 11, fontWeight: 700, color: C.ac,
        letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 6px" }}>{eyebrow}</p>
      <h1 style={{ fontFamily: C.f, fontSize: 30, fontWeight: 800, color: C.txt,
        margin: 0, letterSpacing: -.6 }}>{title}</h1>
    </div>
    {children}
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — HERO EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function HeroAdmin({ data, update, showToast }) {
  const [form, setForm] = useState({ ...data.hero });
  const f = k => e => setForm({ ...form, [k]: e.target.value });
  return (
    <ASection eyebrow="Section · Hero" title="Hero / Profile">
      <Card style={{ maxWidth: 640 }}>
        <Field label="Full Name"><Inp value={form.name} onChange={f("name")} /></Field>
        <Field label="Professional Title"><Inp value={form.title} onChange={f("title")} /></Field>
        <Field label="Tagline">
          <TA value={form.tagline} onChange={f("tagline")} style={{ minHeight: 90 }} />
        </Field>
        <Field label="Location"><Inp value={form.location} onChange={f("location")} /></Field>
        <Field label="Email"><Inp type="email" value={form.email} onChange={f("email")} /></Field>
        <Field label="Years of Experience">
          <select value={form.years} onChange={f("years")} style={{ ...iSt, appearance: "auto" }}>
            {["<1 year","1-3 years","3-5 years","5-10 years","10+ years"].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Resume / CV URL (leave blank to hide the button)">
          <Inp type="url" value={form.resumeUrl} onChange={f("resumeUrl")}
            placeholder="https://drive.google.com/your-resume" />
        </Field>

        {/* ── Social Links ── */}
        <div style={{ margin: "4px 0 20px", paddingTop: 20,
          borderTop: `1px solid ${C.bdr}` }}>
          <p style={{ fontFamily: C.f, fontSize: 12, fontWeight: 700, color: C.muted,
            letterSpacing: 1.1, textTransform: "uppercase", margin: "0 0 18px" }}>
            Social Links (leave blank to disable)
          </p>
          <Field label="GitHub URL">
            <div style={{ position: "relative" }}>
              <i className="fab fa-github" style={{ position: "absolute", left: 13,
                top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 15 }} />
              <Inp type="url" value={form.githubUrl || ""} onChange={f("githubUrl")}
                placeholder="https://github.com/yourusername"
                style={{ paddingLeft: 38 }} />
            </div>
          </Field>
          <Field label="LinkedIn URL">
            <div style={{ position: "relative" }}>
              <i className="fab fa-linkedin" style={{ position: "absolute", left: 13,
                top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 15 }} />
              <Inp type="url" value={form.linkedinUrl || ""} onChange={f("linkedinUrl")}
                placeholder="https://linkedin.com/in/yourusername"
                style={{ paddingLeft: 38 }} />
            </div>
          </Field>
          <Field label="Facebook URL">
            <div style={{ position: "relative" }}>
              <i className="fab fa-facebook" style={{ position: "absolute", left: 13,
                top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 15 }} />
              <Inp type="url" value={form.facebookUrl || ""} onChange={f("facebookUrl")}
                placeholder="https://facebook.com/yourusername"
                style={{ paddingLeft: 38 }} />
            </div>
          </Field>
        </div>

        <Btn variant="primary" onClick={() => { update("hero", form); showToast("Hero saved!"); }}>
          <i className="fas fa-check" /> Save Changes
        </Btn>
      </Card>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — ABOUT EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function AboutAdmin({ data, update, showToast }) {
  const [bio, setBio] = useState(data.about.bio);
  return (
    <ASection eyebrow="Section · About" title="About Me">
      <Card style={{ maxWidth: 640 }}>
        <Field label="Bio Paragraph">
          <TA value={bio} onChange={e => setBio(e.target.value)}
            style={{ minHeight: 240 }} placeholder="Tell visitors about yourself..." />
        </Field>
        <Btn variant="primary" onClick={() => { update("about", { bio }); showToast("About saved!"); }}>
          <i className="fas fa-check" /> Save Changes
        </Btn>
      </Card>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — SKILLS EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function SkillsAdmin({ data, update, showToast }) {
  const [skills, setSkills] = useState([...data.skills]);
  const [form, setForm] = useState({ name: "", category: "" });
  const [editing, setEditing] = useState(null);

  const sync = s => { setSkills(s); update("skills", s); };
  const add = () => {
    if (!form.name.trim() || !form.category.trim()) return;
    sync([...skills, { id: uid(), name: esc(form.name), category: esc(form.category) }]);
    showToast("Skill added!"); setForm({ name: "", category: "" });
  };
  const remove   = id  => { sync(skills.filter(s => s.id !== id)); showToast("Skill removed."); };
  const saveEdit = ()  => { sync(skills.map(s => s.id === editing.id ? editing : s)); showToast("Updated!"); setEditing(null); };

  return (
    <ASection eyebrow="Section · Skills" title="Skills">
      <Card style={{ marginBottom: 24, maxWidth: 620 }}>
        <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 700, color: C.txt, margin: "0 0 18px" }}>
          <i className="fas fa-plus-circle" style={{ color: C.ac, marginRight: 8 }} />Add New Skill
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Skill Name">
            <Inp value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Power BI" onKeyDown={e => e.key === "Enter" && add()} />
          </Field>
          <Field label="Category">
            <Inp value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Data & Analytics" onKeyDown={e => e.key === "Enter" && add()} />
          </Field>
        </div>
        <Btn variant="primary" onClick={add}><i className="fas fa-plus" /> Add Skill</Btn>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 620 }}>
        {skills.map(s => (
          <Card key={s.id} style={{ padding: "14px 18px" }}>
            {editing?.id === s.id ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <Field label="Name">
                    <Inp value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                  </Field>
                  <Field label="Category">
                    <Inp value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="primary" onClick={saveEdit}><i className="fas fa-check" /> Save</Btn>
                  <Btn variant="subtle" onClick={() => setEditing(null)}><i className="fas fa-times" /> Cancel</Btn>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.txt, fontFamily: C.f }}>
                    {s.name}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.ac,
                    background: `${C.ac}18`, borderRadius: 6, padding: "2px 9px", fontFamily: C.f }}>
                    {s.category}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <Btn variant="subtle" onClick={() => setEditing({ ...s })} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-pen" />
                  </Btn>
                  <Btn variant="danger" onClick={() => remove(s.id)} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-trash" />
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — EXPERIENCE EDITOR
// ══════════════════════════════════════════════════════════════════════════════

// ✅ Defined OUTSIDE ExpAdmin so React never remounts it on re-render
function EForm({ val, set }) {
  return (
    <>
      <Field label="Job Title">
        <Inp value={val.position} onChange={e => set({ ...val, position: e.target.value })} placeholder="e.g. Power BI Developer" />
      </Field>
      <Field label="Company">
        <Inp value={val.company} onChange={e => set({ ...val, company: e.target.value })} placeholder="e.g. Acme Corp" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Start Date">
          <Inp value={val.startDate} onChange={e => set({ ...val, startDate: e.target.value })} placeholder="Jan 2023" />
        </Field>
        <Field label="End Date (blank = Present)">
          <Inp value={val.endDate} onChange={e => set({ ...val, endDate: e.target.value })} placeholder="Dec 2024" />
        </Field>
      </div>
      <Field label="Description">
        <TA value={val.description} onChange={e => set({ ...val, description: e.target.value })}
          placeholder="Your responsibilities and achievements..." />
      </Field>
    </>
  );
}

function ExpAdmin({ data, update, showToast }) {
  const blank = { position: "", company: "", startDate: "", endDate: "", description: "" };
  const [items, setItems] = useState([...data.experience]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const sync     = i => { setItems(i); update("experience", i); };
  const add      = () => { if (!form.position.trim() || !form.company.trim()) return; sync([...items, { id: uid(), ...form }]); showToast("Added!"); setForm(blank); };
  const remove   = id => { sync(items.filter(i => i.id !== id)); showToast("Removed."); };
  const saveEdit = () => { sync(items.map(i => i.id === editing.id ? editing : i)); showToast("Updated!"); setEditing(null); };

  return (
    <ASection eyebrow="Section · Experience" title="Work Experience">
      <Card style={{ marginBottom: 24, maxWidth: 640 }}>
        <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 700, color: C.txt, margin: "0 0 18px" }}>
          <i className="fas fa-plus-circle" style={{ color: C.ac, marginRight: 8 }} />Add Experience
        </p>
        <EForm val={form} set={setForm} />
        <Btn variant="primary" onClick={add}><i className="fas fa-plus" /> Add</Btn>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
        {items.map(item => (
          <Card key={item.id}>
            {editing?.id === item.id ? (
              <>
                <EForm val={editing} set={setEditing} />
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Btn variant="primary" onClick={saveEdit}><i className="fas fa-check" /> Save</Btn>
                  <Btn variant="subtle" onClick={() => setEditing(null)}><i className="fas fa-times" /> Cancel</Btn>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <h3 style={{ fontFamily: C.f, fontSize: 15, fontWeight: 700, color: C.txt, margin: "0 0 4px" }}>
                    {item.position}
                  </h3>
                  <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 600, color: C.ac, margin: "0 0 3px" }}>
                    {item.company}
                  </p>
                  <p style={{ fontFamily: C.f, fontSize: 12, color: C.muted, margin: 0 }}>
                    {item.startDate} — {item.endDate || "Present"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                  <Btn variant="subtle" onClick={() => setEditing({ ...item })} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-pen" />
                  </Btn>
                  <Btn variant="danger" onClick={() => remove(item.id)} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-trash" />
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE UPLOADER
// ══════════════════════════════════════════════════════════════════════════════
function ImageUploader({ value, onChange }) {
  const ref = useRef();
  const handle = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("Please choose an image under 3MB."); return; }
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" onChange={handle} style={{ display: "none" }} />
      {value ? (
        <div>
          <img src={value} alt="preview"
            style={{ width: "100%", maxWidth: 420, height: 210, objectFit: "cover",
              borderRadius: 10, border: `1px solid ${C.bdr}`, display: "block" }} />
          <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
            <button onClick={() => ref.current.click()}
              style={{ fontFamily: C.f, fontSize: 12, fontWeight: 700, color: C.ac,
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 6 }}>
              <i className="fas fa-redo" /> Change Image
            </button>
            <button onClick={() => onChange("")}
              style={{ fontFamily: C.f, fontSize: 12, fontWeight: 700, color: "#f87171",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 6 }}>
              <i className="fas fa-times" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="pf-uploadzone" onClick={() => ref.current.click()}
          style={{ width: "100%", height: 170, border: `2px dashed ${C.bdr}`, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
            gap: 10, cursor: "pointer", background: C.bgS, transition: "all .2s" }}>
          <i className="fas fa-cloud-upload-alt" style={{ fontSize: 30, color: C.ac }} />
          <span style={{ fontFamily: C.f, fontSize: 14, fontWeight: 600, color: C.txt }}>
            Click to upload image
          </span>
          <span style={{ fontFamily: C.f, fontSize: 11, color: C.muted }}>
            PNG · JPG · WEBP · max 3MB
          </span>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — PROJECTS EDITOR
// ══════════════════════════════════════════════════════════════════════════════

// ✅ Defined OUTSIDE ProjAdmin so React never remounts it on re-render
function PForm({ val, set }) {
  return (
    <>
      <Field label="Project Title">
        <Inp value={val.title} onChange={e => set({ ...val, title: e.target.value })} placeholder="e.g. Sales Analytics Dashboard" />
      </Field>
      <Field label="Description">
        <TA value={val.description} onChange={e => set({ ...val, description: e.target.value })}
          placeholder="Describe what this project does..." />
      </Field>
      <Field label="Project Image">
        <ImageUploader value={val.imageData} onChange={v => set({ ...val, imageData: v })} />
      </Field>
      <Field label="Tags (comma separated)">
        <Inp value={val.tags} onChange={e => set({ ...val, tags: e.target.value })}
          placeholder="Power BI, DAX, SQL" />
      </Field>
    </>
  );
}

function ProjAdmin({ data, update, showToast }) {
  const blank = { title: "", description: "", imageData: "", tags: "" };
  const [items, setItems] = useState([...data.projects]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const sync     = i => { setItems(i); update("projects", i); };
  const add      = () => { if (!form.title.trim()) return; sync([...items, { id: uid(), ...form }]); showToast("Project added!"); setForm(blank); };
  const remove   = id => { sync(items.filter(i => i.id !== id)); showToast("Removed."); };
  const saveEdit = () => { sync(items.map(i => i.id === editing.id ? editing : i)); showToast("Updated!"); setEditing(null); };

  return (
    <ASection eyebrow="Section · Projects" title="Projects">
      <Card style={{ marginBottom: 28, maxWidth: 640 }}>
        <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 700, color: C.txt, margin: "0 0 18px" }}>
          <i className="fas fa-plus-circle" style={{ color: C.ac, marginRight: 8 }} />Add New Project
        </p>
        <PForm val={form} set={setForm} />
        <Btn variant="primary" onClick={add} style={{ marginTop: 4 }}>
          <i className="fas fa-plus" /> Add Project
        </Btn>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
        {items.map(item => (
          <div key={item.id}
            style={{ background: C.bgC, border: `1px solid ${C.bdr}`, borderRadius: 14, overflow: "hidden" }}>
            {item.imageData
              ? <img src={item.imageData} alt={item.title}
                  style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }} />
              : <div style={{ height: 170, background: C.bgH, display: "flex", alignItems: "center",
                  justifyContent: "center", flexDirection: "column", gap: 8, borderBottom: `1px solid ${C.bdr}` }}>
                  <i className="fas fa-image" style={{ fontSize: 28, color: C.bdr }} />
                  <span style={{ fontFamily: C.f, fontSize: 11, color: C.muted }}>No image</span>
                </div>}
            <div style={{ padding: 18 }}>
              {editing?.id === item.id ? (
                <>
                  <PForm val={editing} set={setEditing} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn variant="primary" onClick={saveEdit}><i className="fas fa-check" /> Save</Btn>
                    <Btn variant="subtle" onClick={() => setEditing(null)}><i className="fas fa-times" /> Cancel</Btn>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ fontFamily: C.f, fontSize: 15, fontWeight: 700, color: C.txt, margin: "0 0 7px" }}>
                    {item.title}
                  </h3>
                  <p style={{ fontFamily: C.f, fontSize: 12, color: C.muted, lineHeight: 1.65, margin: "0 0 12px" }}>
                    {item.description}
                  </p>
                  {item.tags && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                      {item.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, color: C.ac,
                          background: `${C.ac}18`, borderRadius: 5, padding: "2px 8px", fontFamily: C.f }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 7 }}>
                    <Btn variant="subtle" onClick={() => setEditing({ ...item })} style={{ padding: "6px 10px" }}>
                      <i className="fas fa-pen" />
                    </Btn>
                    <Btn variant="danger" onClick={() => remove(item.id)} style={{ padding: "6px 10px" }}>
                      <i className="fas fa-trash" />
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — EDUCATION EDITOR
// ══════════════════════════════════════════════════════════════════════════════

// ✅ Defined OUTSIDE EduAdmin so React never remounts it on re-render
function EdForm({ val, set }) {
  return (
    <>
      <Field label="Degree / Course">
        <Inp value={val.degree} onChange={e => set({ ...val, degree: e.target.value })}
          placeholder="e.g. BS Information Technology" />
      </Field>
      <Field label="School / University">
        <Inp value={val.school} onChange={e => set({ ...val, school: e.target.value })}
          placeholder="e.g. University of Cebu" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Start Year">
          <Inp value={val.startYear} onChange={e => set({ ...val, startYear: e.target.value })} placeholder="2018" />
        </Field>
        <Field label="End Year (blank = Present)">
          <Inp value={val.endYear} onChange={e => set({ ...val, endYear: e.target.value })} placeholder="2022" />
        </Field>
      </div>
    </>
  );
}

function EduAdmin({ data, update, showToast }) {
  const blank = { degree: "", school: "", startYear: "", endYear: "" };
  const [items, setItems] = useState([...data.education]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const sync     = i => { setItems(i); update("education", i); };
  const add      = () => { if (!form.degree.trim() || !form.school.trim()) return; sync([...items, { id: uid(), ...form }]); showToast("Added!"); setForm(blank); };
  const remove   = id => { sync(items.filter(i => i.id !== id)); showToast("Removed."); };
  const saveEdit = () => { sync(items.map(i => i.id === editing.id ? editing : i)); showToast("Updated!"); setEditing(null); };

  return (
    <ASection eyebrow="Section · Education" title="Education">
      <Card style={{ marginBottom: 24, maxWidth: 640 }}>
        <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 700, color: C.txt, margin: "0 0 18px" }}>
          <i className="fas fa-plus-circle" style={{ color: C.ac, marginRight: 8 }} />Add Education
        </p>
        <EdForm val={form} set={setForm} />
        <Btn variant="primary" onClick={add}><i className="fas fa-plus" /> Add</Btn>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
        {items.map(item => (
          <Card key={item.id}>
            {editing?.id === item.id ? (
              <>
                <EdForm val={editing} set={setEditing} />
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Btn variant="primary" onClick={saveEdit}><i className="fas fa-check" /> Save</Btn>
                  <Btn variant="subtle" onClick={() => setEditing(null)}><i className="fas fa-times" /> Cancel</Btn>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <h3 style={{ fontFamily: C.f, fontSize: 15, fontWeight: 700, color: C.txt, margin: "0 0 4px" }}>
                    {item.degree}
                  </h3>
                  <p style={{ fontFamily: C.f, fontSize: 13, fontWeight: 600, color: C.ac, margin: "0 0 3px" }}>
                    {item.school}
                  </p>
                  <p style={{ fontFamily: C.f, fontSize: 12, color: C.muted, margin: 0 }}>
                    {item.startYear} — {item.endYear || "Present"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                  <Btn variant="subtle" onClick={() => setEditing({ ...item })} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-pen" />
                  </Btn>
                  <Btn variant="danger" onClick={() => remove(item.id)} style={{ padding: "6px 10px" }}>
                    <i className="fas fa-trash" />
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </ASection>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP ROOT — secret admin access wiring
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [data, update, loading, error] = useData();
  const [view, setView] = useState("portfolio");

  useEffect(() => {
    injectStyles();

    // Restore session if already logged in
    if (sessionStorage.getItem(SK)) { setView("admin"); return; }

    // Method 1: URL query param — yoursite.com?portal=TOKEN
    const params = new URLSearchParams(window.location.search);
    if (params.get("portal") === ADMIN_TOKEN) {
      // Strip the query param from the URL so it doesn't linger in browser history
      history.replaceState(null, "", window.location.pathname);
      setView("login");
    }
  }, []);

  const logout = () => { sessionStorage.removeItem(SK); setView("portfolio"); };

  // ── Loading screen ──
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#060d1f", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 48, height: 48, borderRadius: "50%",
        border: "3px solid #1a2d50", borderTopColor: "#3b82f6",
        animation: "spin 0.8s linear infinite" }} />
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#94a3b8", margin: 0 }}>
        Loading portfolio...
      </p>
    </div>
  );

  // ── Error screen ──
  if (error) return (
    <div style={{ minHeight: "100vh", background: "#060d1f", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column",
      gap: 16, padding: 32, textAlign: "center" }}>
      <i className="fas fa-exclamation-triangle" style={{ fontSize: 40, color: "#f87171" }} />
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 16,
        color: "#f1f5f9", margin: 0, fontWeight: 600 }}>Something went wrong</p>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#94a3b8", margin: 0 }}>
        {error}
      </p>
      <button onClick={() => window.location.reload()}
        style={{ marginTop: 8, padding: "10px 24px", borderRadius: 8, border: "none",
          background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 600,
          cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
        Try Again
      </button>
    </div>
  );

  if (view === "login") return <AdminLogin onSuccess={() => setView("admin")} onBack={() => setView("portfolio")} />;
  if (view === "admin") return <AdminDashboard data={data} update={update} onLogout={logout} onViewPortfolio={() => setView("portfolio")} />;
  return <PortfolioView data={data} onLogoClick={() => setView("login")} />;
}