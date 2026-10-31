import { formatINR } from "@/lib/format";

export function Money({ amount, className }: { amount: number | string | null | undefined; className?: string }) {
  return <span className={className}>{formatINR(amount)}</span>;
}
