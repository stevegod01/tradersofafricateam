import { memo, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface DashboardTextareaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

const DashboardTextareaField = ({
  label,
  error,
  id,
  className,
  ...props
}: DashboardTextareaFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-semibold text-foreground">
      {label}
    </label>
    <textarea
      id={id}
      aria-invalid={Boolean(error)}
      className={cn(
        "min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70",
        "focus:border-(--orange) focus:ring-4 focus:ring-(--orange)/12",
        "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/15",
        className,
      )}
      {...props}
    />
    {error && <p className="text-xs font-medium text-destructive">{error}</p>}
  </div>
);

export default memo(DashboardTextareaField);
