import { createClient } from "@supabase/supabase-js";
 
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
 
if (!url || !key) {
  console.error(
    "[Supabase] Missing environment variables.\n" +
    "Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file."
  );
}
 
export const supabase = createClient(url, key);
 