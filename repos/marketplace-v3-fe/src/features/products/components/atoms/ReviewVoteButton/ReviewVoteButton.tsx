"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";

const ReviewVoteButton = ({
  sentiment,
  label,
  selected,
  onSelect,
}: {
  sentiment: "helpful" | "not-helpful";
  label: string;
  selected: boolean;
  onSelect: () => void;
}) => {
  const Icon = sentiment === "helpful" ? ThumbsUp : ThumbsDown;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? "border-(--orange) bg-(--orange)/10 text-(--orange)"
          : "border-border text-muted-foreground hover:border-(--orange-light) hover:text-foreground"
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
  );
};

export default ReviewVoteButton;
