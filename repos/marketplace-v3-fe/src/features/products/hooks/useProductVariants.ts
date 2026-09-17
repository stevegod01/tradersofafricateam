import { useMemo, useState } from "react";

import { ProductDetail } from "../types";
import { findMatchingVariant, getVariantPriceRange } from "../helpers";

export const useProductVariants = (product: ProductDetail) => {
  const isVariable = product.productType === "VARIABLE";

  const [selected, setSelected] = useState<Record<string, string>>(() =>
    isVariable
      ? Object.fromEntries(
          product.variantOptions.map((option) => [option.name, option.values[0]]),
        )
      : {},
  );

  const activeVariant = useMemo(
    () => (isVariable ? findMatchingVariant(product.variants, selected) : undefined),
    [isVariable, product.variants, selected],
  );

  const priceRange = useMemo(
    () => (isVariable ? getVariantPriceRange(product.variants) : undefined),
    [isVariable, product.variants],
  );

  const selectOption = (optionName: string, value: string) =>
    setSelected((prev) => ({ ...prev, [optionName]: value }));

  const isValueAvailable = (optionName: string, value: string) =>
    product.variants.some(
      (variant) =>
        variant.attributes[optionName] === value &&
        Object.entries(selected).every(
          ([key, val]) =>
            key === optionName || variant.attributes[key] === val,
        ),
    );

  return {
    isVariable,
    selected,
    activeVariant,
    priceRange,
    selectOption,
    isValueAvailable,
  };
};
