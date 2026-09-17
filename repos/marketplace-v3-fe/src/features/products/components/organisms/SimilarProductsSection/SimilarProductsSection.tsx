"use client";

import { useTranslations } from "next-intl";

import ProductCardWrapper from "@/components/molecules/ProductCardWrapper/ProductCardWrapper";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { ProductData } from "@/features/products/types";

const SimilarProductsSection = ({
  products,
  categoryId,
}: {
  products: ProductData[];
  categoryId?: string;
}) => {
  const t = useTranslations("ProductInfo");
  const { routes } = useGetAllRoutes();

  if (products.length === 0) return null;

  return (
    <ProductCardWrapper
      title={t("similarProducts")}
      products={products}
      href={categoryId ? routes.categoryInfo(categoryId) : routes.products}
    />
  );
};

export default SimilarProductsSection;
