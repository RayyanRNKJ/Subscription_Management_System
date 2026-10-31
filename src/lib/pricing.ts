export type PricedLine = {
  qty: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
};

export type LineAmounts = { net: number; tax: number; gross: number };

/** Match Postgres round(numeric, 2) for the non-negative billing amounts used here. */
export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineAmounts({ qty, unitPrice, discount = 0, taxRate }: PricedLine): LineAmounts {
  const net = roundMoney(Math.max(0, qty * unitPrice - discount));
  const tax = roundMoney(net * taxRate / 100);
  return { net, tax, gross: roundMoney(net + tax) };
}

export function documentTotals(lines: LineAmounts[]) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const tax = roundMoney(lines.reduce((sum, line) => sum + line.tax, 0));
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}
