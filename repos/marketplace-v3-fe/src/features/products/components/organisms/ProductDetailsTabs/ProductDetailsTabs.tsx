"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import ProductDescriptionSection from "@/features/products/components/organisms/ProductDescriptionSection/ProductDescriptionSection";
import ProductSpecificationsSection from "@/features/products/components/organisms/ProductSpecificationsSection/ProductSpecificationsSection";
import type { ProductDetail, ProductVariant } from "@/features/products/types";

type DetailsTab = "description" | "specifications";

const ProductDetailsTabs = ({
  product,
  locale,
  activeVariant,
}: {
  product: ProductDetail;
  locale: string;
  activeVariant?: ProductVariant;
}) => {
  const t = useTranslations("ProductInfo");
  const [activeTab, setActiveTab] = useState<DetailsTab>("description");

  return (
    <section>
      <div className="flex gap-7 border-b border-border" role="tablist">
        {(["description", "specifications"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`relative py-4 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab)}
            {activeTab === tab && (
              <motion.span
                layoutId="product-details-tab"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-(--orange)"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="py-6"
      >
        {activeTab === "description" ? (
          <ProductDescriptionSection product={product} locale={locale} />
        ) : (
          <ProductSpecificationsSection
            product={product}
            activeVariant={activeVariant}
          />
        )}
      </motion.div>
    </section>
  );
};

export default ProductDetailsTabs;
