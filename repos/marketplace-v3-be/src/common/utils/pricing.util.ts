export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFinalPrice(
  price: number | string,
  discount?: number | string | null,
): number {
  const base = toNumber(price);
  const pct = toNumber(discount);
  if (pct <= 0) return roundMoney(base);
  return roundMoney(base - (base * pct) / 100);
}
