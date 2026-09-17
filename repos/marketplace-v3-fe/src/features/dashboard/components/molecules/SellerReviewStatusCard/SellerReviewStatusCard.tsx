"use client";

import { useTranslations } from "next-intl";

const SellerReviewStatusCard = () => {
  const t = useTranslations("Dashboard.sellerPromo");

  return (
    <div className="rounded-2xl border border-(--orange)/20 bg-(--orange-light) p-5">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--orange) opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-(--orange)" />
        </span>
        <p className="text-xs font-bold text-(--orange-dark)">
          {t("pendingTitle")}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground/70">
        {t("pendingDescription")}
      </p>
    </div>
  );
};

export default SellerReviewStatusCard;
