"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { ProductSeller } from "@/features/products/types";

const SellerMiniCard = ({ seller }: { seller: ProductSeller }) => {
  const t = useTranslations("ProductInfo");
  const { routes } = useGetAllRoutes();

  const shareProduct = async () => {
    const shareData = { title: seller.storeName, url: window.location.href };

    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined);
      return;
    }

    await navigator.clipboard?.writeText(shareData.url);
  };

  return (
    <div className="space-y-4 border-t border-(--orange)/15 pt-6">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          {seller.logoUrl && (
            <Image
              src={seller.logoUrl}
              alt={seller.storeName}
              fill
              sizes="48px"
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{seller.storeName}</p>
            {seller.isVerified && (
              <svg width="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={t("verifiedSeller")}>
                <path
                  d="M10 1.667 12.5 3.958l3.333.417.417 3.333L18.333 10l-2.083 2.292-.417 3.333-3.333.417L10 18.333l-2.5-2.291-3.333-.417-.417-3.333L1.667 10l2.083-2.292.417-3.333 3.333-.417L10 1.667Z"
                  fill="#22c55e"
                />
                <path d="M7.5 10l1.667 1.667L12.5 8.333" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {seller.country && (
            <p className="truncate text-xs text-muted-foreground">{seller.country}</p>
          )}
          {seller.memberSince && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("sellingSince", { year: seller.memberSince })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-y-2 text-left">
        {typeof seller.totalAverageReviews === "number" && (
          <div className="min-w-20 border-r border-foreground/10 pr-4">
            <p className="text-sm font-bold text-foreground">
              {seller.totalAverageReviews.toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground">{t("rating")}</p>
          </div>
        )}
        {typeof seller.responseRate === "number" && (
          <div className="min-w-24 border-r border-foreground/10 px-4">
            <p className="text-sm font-bold text-foreground">{seller.responseRate}%</p>
            <p className="text-[11px] text-muted-foreground">{t("responseRate")}</p>
          </div>
        )}
        {typeof seller.totalProducts === "number" && (
          <div className="min-w-20 pl-4">
            <p className="text-sm font-bold text-foreground">{seller.totalProducts}</p>
            <p className="text-[11px] text-muted-foreground">{t("products")}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${routes.messages}?supplier=${encodeURIComponent(seller.id)}`}
          className="flex h-10 w-fit items-center justify-center gap-2 rounded-full bg-(--orange) px-4 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-95"
        >
          <MessageCircle aria-hidden="true" size={17} />
          {t("messageSupplier")}
        </Link>
        <Link
          href={routes.sellerStore(seller.slug)}
          className="flex h-10 w-fit items-center justify-center rounded-full border border-(--orange) px-4 text-sm font-semibold text-(--orange) transition-colors duration-200 hover:bg-(--orange)/10"
        >
          {t("visitStore")}
        </Link>
        <button
          type="button"
          onClick={shareProduct}
          aria-label={t("shareProduct")}
          title={t("shareProduct")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-(--orange) transition-colors duration-200 hover:bg-(--orange)/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--orange)"
        >
          <Share2 aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
};

export default SellerMiniCard;
