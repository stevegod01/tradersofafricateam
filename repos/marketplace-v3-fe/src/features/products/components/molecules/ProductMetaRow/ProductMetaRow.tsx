"use client";

import { useTranslations } from "next-intl";

import { formatLeadTime } from "@/features/products/helpers";
import { ProductDetail } from "@/features/products/types";

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-0.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold text-foreground">{value}</p>
  </div>
);

const ProductMetaRow = ({ product }: { product: ProductDetail }) => {
  const t = useTranslations("ProductInfo");

  return (
    <div className="grid grid-cols-3 gap-4 rounded-xl bg-muted/45 px-4 py-3.5">
      <MetaItem
        label={t("minOrder")}
        value={`${product.minOrdersAllowed} ${product.unitForMinOrder}`}
      />
      <MetaItem
        label={t("supplyCapacity")}
        value={`${product.supplyCapacity.toLocaleString()} ${product.unitForSupplyCapacity}`}
      />
      <MetaItem
        label={t("leadTime")}
        value={formatLeadTime(product.minDuration, product.maxDuration, product.durationUnit)}
      />
    </div>
  );
};

export default ProductMetaRow;
