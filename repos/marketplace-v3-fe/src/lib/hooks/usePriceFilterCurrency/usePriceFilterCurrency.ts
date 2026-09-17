"use client";

import type { CatalogueFilters } from "@/features/products/types";
import { convertCurrency, getCurrencySymbol } from "@/lib/helpers/currency/currency";
import { useCurrency } from "@/lib/hooks/useCurrency/useCurrency";
import { PRODUCT_PRICE_LIMIT } from "@/lib/hooks/useProductCatalogue/useProductCatalogue";

export const usePriceFilterCurrency = (
  filters: CatalogueFilters,
  onChange: (next: Partial<CatalogueFilters>) => void,
) => {
  const { currency } = useCurrency();
  const displayLimit = Math.round(convertCurrency(PRODUCT_PRICE_LIMIT, "NGN", currency));
  const displayMin = Math.round(convertCurrency(Number(filters.minPrice), "NGN", currency));
  const displayMax = Math.round(convertCurrency(Number(filters.maxPrice), "NGN", currency));

  const changeDisplayRange = ({ min, max }: { min: number; max: number }) => {
    onChange({
      minPrice: String(Math.round(convertCurrency(min, currency, "NGN"))),
      maxPrice: String(Math.round(convertCurrency(max, currency, "NGN"))),
    });
  };

  return {
    displayLimit,
    displayMin,
    displayMax,
    symbol: getCurrencySymbol(currency),
    changeDisplayRange,
  };
};
