"use client";

import { useTranslations } from "next-intl";

import ProductCardWrapper from "@/components/molecules/ProductCardWrapper/ProductCardWrapper";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { ProductData, ProductSeller } from "@/features/products/types";

const MoreFromSellerSection = ({
  seller,
  products,
}: {
  seller: ProductSeller;
  products: ProductData[];
}) => {
  const t = useTranslations("ProductInfo");
  const { routes } = useGetAllRoutes();

  if (products.length === 0) return null;

  return (
    <ProductCardWrapper
      title={t("moreFromSeller", { store: seller.storeName })}
      products={products}
      href={routes.sellerStore(seller.slug)}
    />
  );
};

export default MoreFromSellerSection;
