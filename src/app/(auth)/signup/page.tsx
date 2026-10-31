"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signUp, type FormState } from "../actions";
import { AuthCard, Feedback, btnCls, inputCls } from "@/components/auth-ui";

export default function SignUpPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  return (
    <AuthCard title="Create your account">
      <form action={action} className="space-y-3">
        <input name="full_name" placeholder="Full name" required className={inputCls} />
        <input name="company" placeholder="Company (optional)" className={inputCls} />
        <input name="email" type="email" placeholder="Email" required className={inputCls} />
        <input name="password" type="password" placeholder="Password" required className={inputCls} />
        <p className="text-xs text-neutral-500">
          9+ characters with an uppercase letter, a lowercase letter and a special character.
        </p>
        <Feedback {...state} />
        <button disabled={pending} className={btnCls}>{pending ? "Creating…" : "Sign up"}</button>
      </form>
      <p className="text-sm">Already registered? <Link href="/login" className="text-indigo-700">Sign in</Link></p>
    </AuthCard>
  );
}
