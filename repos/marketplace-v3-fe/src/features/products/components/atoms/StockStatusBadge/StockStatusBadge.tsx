"use client";

import { useTranslations } from "next-intl";

import { getStockStatus } from "@/features/products/helpers";

const STATUS_STYLES = {
  "in-stock": "bg-green-500/10 text-green-600",
  "low-stock": "bg-amber-500/10 text-amber-600",
  "out-of-stock": "bg-red-500/10 text-red-600",
};

const StockStatusBadge = ({ quantity }: { quantity: number }) => {
  const t = useTranslations("ProductInfo");
  const status = getStockStatus(quantity);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(`stockStatus.${status}`)}
    </span>
  );
};

export default StockStatusBadge;
