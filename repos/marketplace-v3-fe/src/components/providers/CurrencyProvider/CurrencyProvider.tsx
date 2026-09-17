"use client";

import { createContext, useSyncExternalStore } from "react";

import type { CurrencyCode } from "@/lib/helpers/currency/currency";
import { isCurrencyCode } from "@/lib/helpers/currency/currency";

export const CurrencyContext = createContext<{
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
} | null>(null);

const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const currency = useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener("tofa-currency-change", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("tofa-currency-change", notify);
      };
    },
    () => {
      const savedCurrency = window.localStorage.getItem("tofa-currency");
      return savedCurrency && isCurrencyCode(savedCurrency)
        ? savedCurrency
        : "NGN";
    },
    () => "NGN" as CurrencyCode,
  );

  const setCurrency = (nextCurrency: CurrencyCode) => {
    window.localStorage.setItem("tofa-currency", nextCurrency);
    window.dispatchEvent(new Event("tofa-currency-change"));
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyProvider;
