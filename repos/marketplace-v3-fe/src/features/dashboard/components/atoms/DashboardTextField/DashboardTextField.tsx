import { InputHTMLAttributes, memo } from "react";

import { cn } from "@/lib/utils";

interface DashboardTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const DashboardTextField = ({
  label,
  error,
  id,
  className,
  ...props
}: DashboardTextFieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70",
          "focus:border-(--orange) focus:ring-4 focus:ring-(--orange)/12",
          "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/15",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
};

export default memo(DashboardTextField);
