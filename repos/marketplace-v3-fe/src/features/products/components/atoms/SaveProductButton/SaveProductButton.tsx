"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const SaveProductButton = ({
  productId,
  initialSaved = false,
}: {
  productId: string;
  initialSaved?: boolean;
}) => {
  const t = useTranslations("ProductInfo");
  const [isSaved, setIsSaved] = useState(initialSaved);

  const toggleSave = () => {
    console.log("productId", productId, "saved", !isSaved);
    setIsSaved((prev) => !prev);
  };

  return (
    <button
      type="button"
      onClick={toggleSave}
      aria-pressed={isSaved}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
        isSaved
          ? "border-pink-500 text-pink-500"
          : "border-border text-foreground hover:border-(--orange)"
      }`}
      title={isSaved ? t("saved") : t("save")}
    >
      <svg width="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.7139 2.27598C9.24748 2.5462 9.68185 2.86249 9.99872 3.12841C10.3156 2.86249 10.7499 2.54621 11.2835 2.27598C12.4926 1.66361 14.2328 1.28486 16.1898 2.27597C17.4399 2.90908 18.2855 3.86704 18.746 5.03012C19.2003 6.17757 19.262 7.4766 19.0434 8.79457C18.6708 11.0401 17.136 13.0438 15.5597 14.5876C13.9638 16.1507 12.2139 17.3495 11.227 17.9745C10.4716 18.453 9.52588 18.453 8.77049 17.9745C7.78357 17.3495 6.03363 16.1507 4.43765 14.5876C2.86135 13.0438 1.32654 11.0401 0.953963 8.79457C0.735282 7.4766 0.797008 6.17757 1.25131 5.03012C1.7118 3.86704 2.55744 2.90908 3.80753 2.27597C5.76453 1.28486 7.50476 1.66361 8.7139 2.27598Z"
          fill={isSaved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={isSaved ? 0 : 1.5}
        />
      </svg>
    </button>
  );
};

export default SaveProductButton;
