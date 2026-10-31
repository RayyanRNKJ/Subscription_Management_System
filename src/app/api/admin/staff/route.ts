import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffSchema } from "@/lib/validation";

// Only an admin may add staff. Role is set HERE on the server, never taken from the client.
export async function POST(req: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const parsed = staffSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { email, password, full_name } = parsed.data;

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // The signup trigger creates the profile as 'customer'; promote it.
  const { error: roleErr } = await admin.from("profiles").update({ role: "staff" }).eq("id", data.user.id);
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  return NextResponse.json({ id: data.user.id, email }, { status: 201 });
}
