import { memo } from "react";

const AnalyticsDatePresetButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-(--orange-light) hover:text-(--orange)"
  >
    {label}
  </button>
);

export default memo(AnalyticsDatePresetButton);
