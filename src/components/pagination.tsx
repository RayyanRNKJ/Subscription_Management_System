import Link from "next/link";

export function Pagination({ page, totalPages, total, itemLabel, hrefForPage }: { page: number; totalPages: number; total: number; itemLabel: string; hrefForPage: (page: number) => string }) {
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>Page {page} of {totalPages} · {total} {itemLabel}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-md border bg-white px-3 py-2 hover:bg-slate-50" href={hrefForPage(page - 1)}>Previous</Link> : <span className="rounded-md border px-3 py-2 text-slate-400">Previous</span>}
        {page < totalPages ? <Link className="rounded-md border bg-white px-3 py-2 hover:bg-slate-50" href={hrefForPage(page + 1)}>Next</Link> : <span className="rounded-md border px-3 py-2 text-slate-400">Next</span>}
      </div>
    </nav>
  );
}
