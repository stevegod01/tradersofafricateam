"use client";

import { useCurrency } from "@/lib/hooks/useCurrency/useCurrency";
import { convertCurrency, getCurrencySymbol, formatAmount } from "@/lib/helpers/currency/currency";

const PriceTag = ({
  price,
  discount,
  currency,
  unit,
  size = "lg",
}: {
  price: number;
  discount: number | null;
  currency: string;
  unit?: string;
  size?: "md" | "lg";
}) => {
  const { currency: selectedCurrency } = useCurrency();
  const finalPrice = discount ? price - (price * discount) / 100 : price;
  const convertedFinal = convertCurrency(finalPrice, currency, selectedCurrency);
  const convertedOriginal = convertCurrency(price, currency, selectedCurrency);
  const symbol = getCurrencySymbol(selectedCurrency);

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <p
        className={`font-sans font-bold text-foreground ${size === "lg" ? "text-2xl sm:text-3xl" : "text-lg"}`}
      >
        {symbol}
        {formatAmount(convertedFinal)}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">/{unit}</span>
        )}
      </p>
      {discount ? (
        <>
          <p className="text-sm text-muted-foreground line-through">
            {symbol}
            {formatAmount(convertedOriginal)}
          </p>
          <span className="rounded-full bg-(--orange)/10 px-2 py-0.5 text-xs font-semibold text-(--orange)">
            -{discount}%
          </span>
        </>
      ) : null}
    </div>
  );
};

export default PriceTag;
