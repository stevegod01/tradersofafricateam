import {
  LocalizedText,
  ProductDetail,
  ProductVariant,
} from "../types";

/**
 * finalPrice = price - (price * discount / 100), or price when discount is
 * null. The frontend never submits/authors a discounted price directly -
 * this mirrors the backend's own calculation for display purposes only.
 */
export const calculateFinalPrice = (
  price: number,
  discount: number | null,
) => (discount ? price - (price * discount) / 100 : price);

/** 0 < discount < 100, or null. A 100% discount is not a valid product discount. */
export const isValidDiscount = (discount: number | null) =>
  discount === null || (discount > 0 && discount < 100);

export const getLocalizedText = (text: LocalizedText, locale: string) =>
  text[locale] ?? text.en ?? Object.values(text)[0] ?? "";

/** Finds the variant whose attributes exactly match every selected option. */
export const findMatchingVariant = (
  variants: ProductVariant[],
  selected: Record<string, string>,
) =>
  variants.find((variant) =>
    Object.entries(selected).every(
      ([key, value]) => variant.attributes[key] === value,
    ),
  );

/** The lowest price across all variants - used for "from ₦X" display before a variant is chosen. */
export const getVariantPriceRange = (variants: ProductVariant[]) => {
  const finalPrices = variants.map((variant) =>
    calculateFinalPrice(variant.price, variant.discount),
  );
  return { min: Math.min(...finalPrices), max: Math.max(...finalPrices) };
};

export const clampToMinOrder = (quantity: number, minOrdersAllowed: number) =>
  Math.max(quantity, minOrdersAllowed);

/** One representative variant per distinct image, for a clickable variant-image row. */
export const getUniqueVariantImages = (variants: ProductVariant[]) => {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    if (seen.has(variant.image)) return false;
    seen.add(variant.image);
    return true;
  });
};

export const getActiveQuantity = (
  product: ProductDetail,
  activeVariant: ProductVariant | undefined,
) =>
  product.productType === "VARIABLE"
    ? (activeVariant?.quantity ?? 0)
    : (product.quantity ?? 0);

export const getStockStatus = (
  quantity: number,
): "in-stock" | "low-stock" | "out-of-stock" => {
  if (quantity <= 0) return "out-of-stock";
  if (quantity <= 20) return "low-stock";
  return "in-stock";
};

export const formatLeadTime = (
  minDuration: number,
  maxDuration: number,
  durationUnit: string,
) =>
  minDuration === maxDuration
    ? `${minDuration} ${durationUnit}`
    : `${minDuration}–${maxDuration} ${durationUnit}`;
