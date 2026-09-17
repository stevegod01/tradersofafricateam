"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import ReviewSummaryBar from "@/features/products/components/molecules/ReviewSummaryBar/ReviewSummaryBar";
import ReviewSearchBar from "@/features/products/components/molecules/ReviewSearchBar/ReviewSearchBar";
import ReviewCard from "@/features/products/components/molecules/ReviewCard/ReviewCard";
import { useReviewSearch } from "@/features/products/hooks/useReviewSearch";
import { ProductDetail } from "@/features/products/types";

const INITIAL_VISIBLE = 3;

const ProductReviewsSection = ({ product }: { product: ProductDetail }) => {
  const t = useTranslations("ProductInfo");
  const { query, setQuery, ratingFilter, setRatingFilter, filtered, ratingCounts } =
    useReviewSearch(product.reviews);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visibleReviews = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold text-lg text-foreground">
          {t("reviews")}
          <span className="ml-1.5 font-normal text-muted-foreground">
            ({product.totalReviewCount})
          </span>
        </h2>
        <ReviewSearchBar query={query} onQueryChange={setQuery} />
      </div>

      <div className="mt-4">
        <ReviewSummaryBar
          averageRating={product.totalAverageReviews}
          totalReviewCount={product.totalReviewCount}
          ratingCounts={ratingCounts}
          activeRatingFilter={ratingFilter}
          onRatingFilterChange={setRatingFilter}
        />
      </div>

      {visibleReviews.length > 0 ? (
        <div className="mt-2">
          {visibleReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noReviewsFound")}</p>
      )}

      {hasMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}
            className="rounded-full border border-border px-5 py-2 text-xs font-semibold text-(--orange) transition-colors hover:border-(--orange) hover:bg-(--orange)/5"
          >
            {t("viewAllReviews")}
          </button>
        </div>
      )}
    </section>
  );
};

export default ProductReviewsSection;
