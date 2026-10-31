import type { ReactNode } from "react";

export function DataTable({ headers, rows, emptyMessage, minWidth = "min-w-[640px]" }: { headers: ReactNode[]; rows: ReactNode[][]; emptyMessage: string; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headers.map((header, index) => <th className="px-4 py-3 font-medium" key={index}>{header}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((row, index) => <tr className="border-t border-slate-100" key={index}>{row}</tr>) : <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={headers.length}>{emptyMessage}</td></tr>}</tbody>
      </table>
    </div>
  );
}
