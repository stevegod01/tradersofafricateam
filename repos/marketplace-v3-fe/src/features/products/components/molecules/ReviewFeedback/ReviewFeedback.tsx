"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import ReviewVoteButton from "@/features/products/components/atoms/ReviewVoteButton/ReviewVoteButton";

type ReviewVote = "helpful" | "not-helpful" | null;

const ReviewFeedback = () => {
  const t = useTranslations("ProductInfo");
  const [vote, setVote] = useState<ReviewVote>(null);

  const selectVote = (nextVote: Exclude<ReviewVote, null>) =>
    setVote((current) => (current === nextVote ? null : nextVote));

  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs text-muted-foreground">{t("wasHelpful")}</span>
      <ReviewVoteButton
        sentiment="helpful"
        label={t("helpful")}
        selected={vote === "helpful"}
        onSelect={() => selectVote("helpful")}
      />
      <ReviewVoteButton
        sentiment="not-helpful"
        label={t("notHelpful")}
        selected={vote === "not-helpful"}
        onSelect={() => selectVote("not-helpful")}
      />
    </div>
  );
};

export default ReviewFeedback;
