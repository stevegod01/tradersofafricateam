"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const RequestQuoteButton = ({ productId }: { productId: string }) => {
  const t = useTranslations("ProductInfo");
  const { routes } = useGetAllRoutes();

  return (
    <Link
      href={`${routes.rfq}?productId=${encodeURIComponent(productId)}`}
      className="flex h-11 items-center justify-center rounded-full border border-(--orange) px-6 text-sm font-semibold text-(--orange) transition-colors duration-200 hover:bg-(--orange)/10"
    >
      {t("requestQuote")}
    </Link>
  );
};

export default RequestQuoteButton;
