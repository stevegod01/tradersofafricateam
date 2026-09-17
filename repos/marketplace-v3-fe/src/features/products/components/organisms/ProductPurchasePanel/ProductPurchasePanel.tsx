"use client";

import { useTranslations } from "next-intl";

import PriceTag from "@/features/products/components/atoms/PriceTag/PriceTag";
import StockStatusBadge from "@/features/products/components/atoms/StockStatusBadge/StockStatusBadge";
import ReviewStars from "@/features/products/components/atoms/ReviewStars/ReviewStars";
import AddToCartButton from "@/features/products/components/atoms/AddToCartButton/AddToCartButton";
import RequestQuoteButton from "@/features/products/components/atoms/RequestQuoteButton/RequestQuoteButton";
import SaveProductButton from "@/features/products/components/atoms/SaveProductButton/SaveProductButton";
import VariantOptionGroup from "@/features/products/components/molecules/VariantOptionGroup/VariantOptionGroup";
import QuantityStepper from "@/features/products/components/molecules/QuantityStepper/QuantityStepper";
import ProductMetaRow from "@/features/products/components/molecules/ProductMetaRow/ProductMetaRow";
import { getActiveQuantity, getLocalizedText } from "@/features/products/helpers";
import { ProductDetail, ProductVariant } from "@/features/products/types";

const ProductPurchasePanel = ({
  product,
  locale,
  selected,
  activeVariant,
  priceRange,
  selectOption,
  isValueAvailable,
  quantity,
  onIncrement,
  onDecrement,
  onQuantityChange,
}: {
  product: ProductDetail;
  locale: string;
  selected: Record<string, string>;
  activeVariant: ProductVariant | undefined;
  priceRange: { min: number; max: number } | undefined;
  selectOption: (optionName: string, value: string) => void;
  isValueAvailable: (optionName: string, value: string) => boolean;
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onQuantityChange: (value: number) => void;
}) => {
  const t = useTranslations("ProductInfo");
  const isVariable = product.productType === "VARIABLE";
  const activeQuantity = getActiveQuantity(product, activeVariant);
  const canAddToCart = isVariable ? Boolean(activeVariant) && activeQuantity > 0 : activeQuantity > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {product.countryOfOrigin}
        </p>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {getLocalizedText(product.productName, locale)}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <ReviewStars rating={product.totalAverageReviews} size={16} showValue />
            <span className="text-xs text-muted-foreground">
              ({t("reviewCount", { count: product.totalReviewCount })})
            </span>
          </div>
          <StockStatusBadge quantity={activeQuantity} />
        </div>
      </div>

      {isVariable && priceRange ? (
        activeVariant ? (
          <PriceTag
            price={activeVariant.price}
            discount={activeVariant.discount}
            currency={product.currency}
          />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm text-muted-foreground">{t("startingFrom")}</span>
            <PriceTag price={priceRange.min} discount={null} currency={product.currency} />
          </div>
        )
      ) : (
        <PriceTag
          price={product.price ?? 0}
          discount={product.discount}
          currency={product.currency}
        />
      )}

      <div className="space-y-5">
        {isVariable && (
          <div className="space-y-4">
          {product.variantOptions.map((option) => (
            <VariantOptionGroup
              key={option.name}
              option={option}
              selectedValue={selected[option.name]}
              onSelect={(value) => selectOption(option.name, value)}
              isValueAvailable={(value) => isValueAvailable(option.name, value)}
            />
          ))}
          </div>
        )}

        <QuantityStepper
          quantity={quantity}
          minOrdersAllowed={product.minOrdersAllowed}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onChange={onQuantityChange}
        />
      </div>

      <ProductMetaRow product={product} />

      <div className="flex flex-wrap gap-2.5">
        <AddToCartButton
          productId={activeVariant?.sku ?? product.id}
          quantity={quantity}
          disabled={!canAddToCart}
        />
        <RequestQuoteButton productId={product.id} />
        <SaveProductButton productId={product.id} />
      </div>
    </div>
  );
};

export default ProductPurchasePanel;
