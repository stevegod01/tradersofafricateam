import { memo, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface DashboardSelectFieldProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: Array<{ label: string; value: string }>;
}

const DashboardSelectField = ({
  label,
  error,
  options,
  id,
  className,
  ...props
}: DashboardSelectFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold text-foreground">
      {label}
    </label>
    <select
      id={id}
      aria-invalid={Boolean(error)}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-all",
        "focus:border-(--orange) focus:ring-4 focus:ring-(--orange)/12",
        "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/15",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error && <p className="text-xs font-medium text-destructive">{error}</p>}
  </div>
);

export default memo(DashboardSelectField);
