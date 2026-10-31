import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
export const btnCls =
  "w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (message) return <p className="text-sm text-green-700">{message}</p>;
  return null;
}
