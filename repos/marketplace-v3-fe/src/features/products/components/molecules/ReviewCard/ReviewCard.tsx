"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import ReviewStars from "@/features/products/components/atoms/ReviewStars/ReviewStars";
import ReviewFeedback from "@/features/products/components/molecules/ReviewFeedback/ReviewFeedback";
import { ProductReview } from "@/features/products/types";

const ReviewCard = ({ review }: { review: ProductReview }) => {
  const locale = useLocale();
  const t = useTranslations("ProductInfo");
  const [renderedAt] = useState(() => Date.now());
  const postedAt = new Date(review.createdAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((renderedAt - postedAt) / 1000));
  const relativeTime = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
  });

  const postedTime = (() => {
    if (elapsedSeconds < 45) return t("justNow");
    if (elapsedSeconds < 60 * 60) {
      return relativeTime.format(-Math.floor(elapsedSeconds / 60), "minute");
    }
    if (elapsedSeconds < 60 * 60 * 24) {
      return relativeTime.format(-Math.floor(elapsedSeconds / 3600), "hour");
    }
    if (elapsedSeconds < 60 * 60 * 24 * 30) {
      return relativeTime.format(-Math.floor(elapsedSeconds / 86400), "day");
    }
    if (elapsedSeconds < 60 * 60 * 24 * 365) {
      return relativeTime.format(-Math.floor(elapsedSeconds / 2592000), "month");
    }
    return relativeTime.format(-Math.floor(elapsedSeconds / 31536000), "year");
  })();

  return (
    <div className="space-y-2 border-b border-border py-5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {review.authorAvatar ? (
            <Image
              src={review.authorAvatar}
              alt={review.authorName}
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            review.authorName.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{review.authorName}</p>
          <p suppressHydrationWarning className="text-xs text-muted-foreground">
            {t("postedTime", { time: postedTime })}
          </p>
        </div>
      </div>
      <ReviewStars rating={review.rating} size={14} />
      {review.title && <p className="text-sm font-semibold text-foreground">{review.title}</p>}
      <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
      <ReviewFeedback />
    </div>
  );
};

export default ReviewCard;
