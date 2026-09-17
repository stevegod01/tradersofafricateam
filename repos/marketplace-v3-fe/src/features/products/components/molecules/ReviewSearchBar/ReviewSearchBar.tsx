"use client";

import { useTranslations } from "next-intl";

const ReviewSearchBar = ({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) => {
  const t = useTranslations("ProductInfo");

  return (
    <div className="relative w-full sm:w-64">
      <svg
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17.5 17.5L13.875 13.875M15.8333 9.16667C15.8333 12.8486 12.8486 15.8333 9.16667 15.8333C5.48477 15.8333 2.5 12.8486 2.5 9.16667C2.5 5.48477 5.48477 2.5 9.16667 2.5C12.8486 2.5 15.8333 5.48477 15.8333 9.16667Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t("searchReviews")}
        className="h-9 w-full rounded-lg border border-border bg-muted/30 pr-3 pl-9 text-xs outline-none transition-colors focus:border-(--orange) focus:bg-background"
      />
    </div>
  );
};

export default ReviewSearchBar;
