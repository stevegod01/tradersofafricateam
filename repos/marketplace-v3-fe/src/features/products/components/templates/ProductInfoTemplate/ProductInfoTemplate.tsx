"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import Container from "@/components/atoms/Container/Container";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import ProductGallery from "@/features/products/components/organisms/ProductGallery/ProductGallery";
import ProductPurchasePanel from "@/features/products/components/organisms/ProductPurchasePanel/ProductPurchasePanel";
import ProductDetailsTabs from "@/features/products/components/organisms/ProductDetailsTabs/ProductDetailsTabs";
import ProductReviewsSection from "@/features/products/components/organisms/ProductReviewsSection/ProductReviewsSection";
import MoreFromSellerSection from "@/features/products/components/organisms/MoreFromSellerSection/MoreFromSellerSection";
import SimilarProductsSection from "@/features/products/components/organisms/SimilarProductsSection/SimilarProductsSection";
import SellerMiniCard from "@/features/products/components/molecules/SellerMiniCard/SellerMiniCard";
import { useProductVariants } from "@/features/products/hooks/useProductVariants";
import { useOrderQuantity } from "@/features/products/hooks/useOrderQuantity";
import {
  getActiveQuantity,
  getLocalizedText,
} from "@/features/products/helpers";
import { ProductData, ProductDetail } from "@/features/products/types";

const ProductInfoTemplate = ({
  product,
  locale,
  similarProducts,
  moreFromSeller,
}: {
  product: ProductDetail;
  locale: string;
  similarProducts: ProductData[];
  moreFromSeller: ProductData[];
}) => {
  const t = useTranslations("ProductInfo");
  const { routes } = useGetAllRoutes();

  const {
    isVariable,
    selected,
    activeVariant,
    priceRange,
    selectOption,
    isValueAvailable,
  } = useProductVariants(product);

  const activeQuantity = getActiveQuantity(product, activeVariant);
  const { quantity, increment, decrement, setValue } = useOrderQuantity(
    product.minOrdersAllowed,
    activeQuantity,
  );

  const handleSelectVariantByImage = (variant: {
    attributes: Record<string, string>;
  }) => {
    Object.entries(variant.attributes).forEach(([key, value]) =>
      selectOption(key, value),
    );
  };

  return (
    <div className="bg-background">
      <Container className="space-y-8 py-6 sm:py-8">
        <nav
          aria-label={t("breadcrumb")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link
            href={routes.home}
            className="transition-colors hover:text-(--orange)"
          >
            {t("home")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={routes.products}
            className="transition-colors hover:text-(--orange)"
          >
            {t("products")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-foreground">
            {getLocalizedText(product.productName, locale)}
          </span>
        </nav>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,680px)_minmax(360px,1fr)] xl:gap-12">
          <div className="min-w-0 space-y-10">
            <ProductGallery
              product={product}
              activeVariant={activeVariant}
              onSelectVariantByImage={
                isVariable ? handleSelectVariantByImage : undefined
              }
            />
            <ProductDetailsTabs
              product={product}
              locale={locale}
              activeVariant={activeVariant}
            />
            <ProductReviewsSection product={product} />
          </div>

          <aside className="space-y-8 rounded-2xl bg-(--orange-light)/35 p-5 sm:p-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <ProductPurchasePanel
              product={product}
              locale={locale}
              selected={selected}
              activeVariant={activeVariant}
              priceRange={priceRange}
              selectOption={selectOption}
              isValueAvailable={isValueAvailable}
              quantity={quantity}
              onIncrement={() => increment()}
              onDecrement={() => decrement()}
              onQuantityChange={setValue}
            />
            <SellerMiniCard seller={product.seller} />
          </aside>
        </div>

        <MoreFromSellerSection
          seller={product.seller}
          products={moreFromSeller}
        />
        <SimilarProductsSection
          products={similarProducts}
          categoryId={product.categoryIds[0]}
        />
      </Container>
    </div>
  );
};

export default ProductInfoTemplate;
