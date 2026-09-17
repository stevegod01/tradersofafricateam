import { notFound } from "next/navigation";
import type { Metadata } from "next";

import MainLayout from "@/components/templates/MainLayout/MainLayout";
import ProductInfoTemplate from "@/features/products/components/templates/ProductInfoTemplate/ProductInfoTemplate";
import { getProductDetailBySlug } from "@/features/products/constants/productDetails";
import { products } from "@/features/products/constants/dummy";
import { getLocalizedText } from "@/features/products/helpers";

const getRelatedProducts = (
  currentSlug: string,
  sellerStoreName: string,
) => {
  const others = products.filter((product) => product.slug !== currentSlug);
  return {
    similarProducts: others.slice(0, 6),
    moreFromSeller: others
      .filter((product) => product.storeName === sellerStoreName)
      .slice(0, 6),
  };
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = getProductDetailBySlug(slug);

  if (!product) return {};

  return {
    title: getLocalizedText(product.productName, locale),
    description: getLocalizedText(product.productDescription, locale),
  };
}

export default async function ProductInfoPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const product = getProductDetailBySlug(slug);

  if (!product) notFound();

  const { similarProducts, moreFromSeller } = getRelatedProducts(
    slug,
    product.seller.storeName,
  );

  return (
    <MainLayout>
      <ProductInfoTemplate
        product={product}
        locale={locale}
        similarProducts={similarProducts}
        moreFromSeller={moreFromSeller}
      />
    </MainLayout>
  );
}
