export type CurrencyCode = "NGN" | "USD" | "EUR" | "GBP" | "KES" | "GHS" | "XOF";

const currencySymbols: Record<CurrencyCode, string> = {
  NGN: "₦",
  USD: "$",
  EUR: "€",
  GBP: "£",
  KES: "KSh",
  GHS: "₵",
  XOF: "CFA",
};

// Approximate NGN value of one unit. Replace with the live FX response later.
const ratesInNaira: Record<CurrencyCode, number> = {
  NGN: 1,
  USD: 1600,
  EUR: 1750,
  GBP: 2050,
  KES: 12.4,
  GHS: 103,
  XOF: 2.66,
};

export const isCurrencyCode = (value: string): value is CurrencyCode =>
  value in currencySymbols;

export const getCurrencySymbol = (currency: string): string =>
  isCurrencyCode(currency) ? currencySymbols[currency] : currency;

export const convertCurrency = (
  amount: number,
  from: string,
  to: string,
): number => {
  if (!isCurrencyCode(from) || !isCurrencyCode(to)) return amount;
  return (amount * ratesInNaira[from]) / ratesInNaira[to];
};

export const formatPrice = (
  amount: number,
  currency: string,
  maximumFractionDigits = 0,
): string =>
  `${getCurrencySymbol(currency)}${formatAmount(amount, maximumFractionDigits)}`;

export const formatAmount = (
  amount: number,
  maximumFractionDigits = 0,
): string =>
  new Intl.NumberFormat("en-NG", {
    maximumFractionDigits,
  }).format(amount);
