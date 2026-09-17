"use client";

import { useTranslations } from "next-intl";

const AddToCartButton = ({
  productId,
  quantity,
  disabled = false,
}: {
  productId: string;
  quantity: number;
  disabled?: boolean;
}) => {
  const t = useTranslations("ProductInfo");

  const addToCart = () => {
    console.log("add to cart", { productId, quantity });
  };

  return (
    <button
      type="button"
      onClick={addToCart}
      disabled={disabled}
      className="flex h-11 items-center justify-center gap-2 rounded-full bg-(--orange) px-6 text-sm font-semibold text-white transition-colors duration-200 hover:bg-(--orange-dark) disabled:pointer-events-none disabled:opacity-50"
    >
      {t("addToCart")}
    </button>
  );
};

export default AddToCartButton;
