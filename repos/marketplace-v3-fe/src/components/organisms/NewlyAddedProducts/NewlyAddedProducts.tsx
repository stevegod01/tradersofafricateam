"use client";

import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import ProductCardWrapper from "@/components/molecules/ProductCardWrapper/ProductCardWrapper";

import { products } from "@/features/products/constants/dummy";
import { useTranslations } from "next-intl";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const NewlyAddedProducts = () => {
  const t = useTranslations("HomePage");
  const { routes } = useGetAllRoutes();

  return (
    <SectionWrapper paddingX="xl:px-14" className="sm:pb-14 pb-10">
      <ProductCardWrapper
        title={t("newlyAddedProducts")}
        products={products}
        href={routes.productCollection("new")}
      />
    </SectionWrapper>
  );
};

export default NewlyAddedProducts;
