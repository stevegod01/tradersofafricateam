import { memo } from "react";

const AnalyticsCalendarDay = ({
  day,
  label,
  outsideMonth,
  selected,
  inRange,
  onSelect,
}: {
  day: number;
  label: string;
  outsideMonth: boolean;
  selected: boolean;
  inRange: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-label={label}
    aria-pressed={selected}
    className={`relative flex h-9 items-center justify-center text-xs font-semibold transition ${
      outsideMonth ? "text-muted-foreground/45" : "text-foreground"
    } ${inRange ? "bg-(--orange-light)" : "hover:bg-muted"} ${
      selected ? "rounded-lg bg-(--orange)! text-white shadow-sm" : ""
    }`}
  >
    {day}
  </button>
);

export default memo(AnalyticsCalendarDay);
