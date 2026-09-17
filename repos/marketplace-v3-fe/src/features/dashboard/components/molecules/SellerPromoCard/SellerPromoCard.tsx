"use client";

import { useTranslations } from "next-intl";

const SellerPromoCard = ({ onOpen }: { onOpen: () => void }) => {
  const t = useTranslations("Dashboard.sellerPromo");

  return (
    <div className="relative overflow-hidden rounded-2xl bg-(--brown) p-5">
      <div
        aria-hidden="true"
        className="absolute -top-8 -right-8 size-28 rounded-full bg-(--orange)/25 blur-2xl"
      />
      <p className="relative text-sm font-bold text-white">{t("title")}</p>
      <p className="relative mt-1.5 text-xs leading-5 text-white/65">
        {t("description")}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="relative mt-4 w-full rounded-xl bg-(--orange) py-2.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-(--orange-dark)"
      >
        {t("cta")}
      </button>
    </div>
  );
};

export default SellerPromoCard;
