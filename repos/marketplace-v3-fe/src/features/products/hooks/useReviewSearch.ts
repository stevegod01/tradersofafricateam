import { useMemo, useState } from "react";

import { ProductReview } from "../types";

export const useReviewSearch = (reviews: ProductReview[]) => {
  const [query, setQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesQuery =
        !normalizedQuery ||
        review.comment.toLowerCase().includes(normalizedQuery) ||
        review.title?.toLowerCase().includes(normalizedQuery) ||
        review.authorName.toLowerCase().includes(normalizedQuery);
      const matchesRating = ratingFilter === null || review.rating === ratingFilter;
      return matchesQuery && matchesRating;
    });
  }, [reviews, query, ratingFilter]);

  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((review) => {
      const rounded = Math.round(review.rating);
      if (counts[rounded] !== undefined) counts[rounded] += 1;
    });
    return counts;
  }, [reviews]);

  return { query, setQuery, ratingFilter, setRatingFilter, filtered, ratingCounts };
};
