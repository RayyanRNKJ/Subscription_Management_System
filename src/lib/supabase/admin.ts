import { createClient } from "@supabase/supabase-js";

// SERVER ONLY. Service-role client bypasses RLS.
// Never import this from a "use client" file. Use it for: creating staff, the billing run, seeding.
export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
