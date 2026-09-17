"use client";

import { useTranslations } from "next-intl";

import ReviewStars from "@/features/products/components/atoms/ReviewStars/ReviewStars";

const ReviewSummaryBar = ({
  averageRating,
  totalReviewCount,
  ratingCounts,
  activeRatingFilter,
  onRatingFilterChange,
}: {
  averageRating: number;
  totalReviewCount: number;
  ratingCounts: Record<number, number>;
  activeRatingFilter: number | null;
  onRatingFilterChange: (rating: number | null) => void;
}) => {
  const t = useTranslations("ProductInfo");

  return (
    <div className="flex flex-col gap-6 rounded-xl bg-muted/30 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex shrink-0 flex-col items-center gap-1 sm:border-r sm:border-border sm:pr-6">
        <p className="text-4xl font-bold text-foreground">{averageRating.toFixed(1)}</p>
        <ReviewStars rating={averageRating} size={18} />
        <p className="text-xs text-muted-foreground">
          {t("reviewCount", { count: totalReviewCount })}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = ratingCounts[rating] ?? 0;
          const percent = totalReviewCount ? Math.round((count / totalReviewCount) * 100) : 0;
          const isActive = activeRatingFilter === rating;
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onRatingFilterChange(isActive ? null : rating)}
              className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors ${isActive ? "bg-(--orange)/10" : "hover:bg-muted"}`}
            >
              <span className="w-10 shrink-0 text-xs font-medium text-foreground">
                {rating} {t("star")}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-(--orange)"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewSummaryBar;
