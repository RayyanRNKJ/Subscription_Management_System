"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signIn, type FormState } from "../actions";
import { AuthCard, Feedback, btnCls, inputCls } from "@/components/auth-ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <AuthCard title="Sign in to Brightloop">
      <form action={action} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required className={inputCls} />
        <input name="password" type="password" placeholder="Password" required className={inputCls} />
        <Feedback {...state} />
        <button disabled={pending} className={btnCls}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="flex justify-between text-sm text-indigo-700">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/signup">Create account</Link>
      </div>
    </AuthCard>
  );
}
