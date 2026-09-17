import { memo } from "react";

const DashboardStatCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-2xl border border-border bg-background p-5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="heading-font mt-2 text-2xl font-bold text-foreground sm:text-3xl">
      {value}
    </p>
    {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default memo(DashboardStatCard);
