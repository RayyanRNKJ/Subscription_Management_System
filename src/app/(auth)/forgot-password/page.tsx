"use client";
import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword, type FormState } from "../actions";
import { AuthCard, Feedback, btnCls, inputCls } from "@/components/auth-ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPassword, {});
  return (
    <AuthCard title="Reset your password">
      <form action={action} className="space-y-3">
        <input name="email" type="email" placeholder="Registered email" required className={inputCls} />
        <Feedback {...state} />
        <button disabled={pending} className={btnCls}>{pending ? "Sending…" : "Send reset link"}</button>
      </form>
      <Link href="/login" className="text-sm text-indigo-700">Back to sign in</Link>
    </AuthCard>
  );
}
