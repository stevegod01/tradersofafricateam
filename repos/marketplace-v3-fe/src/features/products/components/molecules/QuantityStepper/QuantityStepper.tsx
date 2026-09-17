"use client";

import { useTranslations } from "next-intl";

const QuantityStepper = ({
  quantity,
  minOrdersAllowed,
  onIncrement,
  onDecrement,
  onChange,
}: {
  quantity: number;
  minOrdersAllowed: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (value: number) => void;
}) => {
  const t = useTranslations("ProductInfo");

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{t("quantity")}</p>
      <div className="flex items-center gap-3">
        <div className="flex items-center overflow-hidden rounded-xl border border-border">
          <button
            type="button"
            onClick={onDecrement}
            disabled={quantity <= minOrdersAllowed}
            aria-label={t("decreaseQuantity")}
            className="flex h-11 w-11 items-center justify-center text-lg text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
          >
            −
          </button>
          <input
            type="number"
            value={quantity}
            min={minOrdersAllowed}
            onChange={(event) => onChange(Number(event.target.value) || minOrdersAllowed)}
            className="h-11 w-16 border-x border-border bg-transparent text-center text-sm font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={onIncrement}
            aria-label={t("increaseQuantity")}
            className="flex h-11 w-11 items-center justify-center text-lg text-foreground transition-colors hover:bg-muted"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuantityStepper;
