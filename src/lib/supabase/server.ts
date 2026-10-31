import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// User-scoped client: respects RLS. Use this for anything a signed-in user does.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; the middleware refreshes the session instead
          }
        },
      },
    }
  );
}
