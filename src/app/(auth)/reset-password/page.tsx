"use client";
import { useActionState } from "react";
import { resetPassword, type FormState } from "../actions";
import { AuthCard, Feedback, btnCls, inputCls } from "@/components/auth-ui";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <AuthCard title="Choose a new password">
      <form action={action} className="space-y-3">
        <input name="password" type="password" placeholder="New password" required className={inputCls} />
        <Feedback {...state} />
        <button disabled={pending} className={btnCls}>{pending ? "Saving…" : "Update password"}</button>
      </form>
    </AuthCard>
  );
}
