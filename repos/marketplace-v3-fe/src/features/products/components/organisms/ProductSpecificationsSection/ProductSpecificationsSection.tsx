"use client";

import { useTranslations } from "next-intl";

import { formatLeadTime } from "@/features/products/helpers";
import { ProductDetail, ProductVariant } from "@/features/products/types";

const SpecRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5 border-b border-border/70 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
    <p className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-sm text-foreground">{value}</p>
  </div>
);

const ProductSpecificationsSection = ({
  product,
  activeVariant,
}: {
  product: ProductDetail;
  activeVariant?: ProductVariant;
}) => {
  const t = useTranslations("ProductInfo");

  const rows: { label: string; value: string }[] = [
    { label: t("category"), value: product.categoryIds.join(", ") || "—" },
    { label: t("countryOfOrigin"), value: product.countryOfOrigin },
    {
      label: t("minOrder"),
      value: `${product.minOrdersAllowed} ${product.unitForMinOrder}`,
    },
    {
      label: t("supplyCapacity"),
      value: `${product.supplyCapacity.toLocaleString()} ${product.unitForSupplyCapacity}`,
    },
    {
      label: t("leadTime"),
      value: formatLeadTime(product.minDuration, product.maxDuration, product.durationUnit),
    },
    ...product.variantOptions.map((option) => ({
      label: option.name,
      value: activeVariant?.attributes[option.name] ?? option.values.join(", "),
    })),
  ];

  return (
    <div>
      {rows.map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
};

export default ProductSpecificationsSection;
