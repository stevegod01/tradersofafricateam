"use client";

import { InputHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  invalid?: boolean;
  endAdornment?: React.ReactNode;
}

const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ className, icon, invalid, endAdornment, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          aria-invalid={invalid}
          className={cn(
            "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70",
            "focus:border-(--orange) focus:ring-4 focus:ring-(--orange)/12",
            "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/15",
            icon && "pl-10.5",
            endAdornment && "pr-11",
            className,
          )}
          {...props}
        />
        {endAdornment && (
          <span className="absolute right-2 flex items-center">
            {endAdornment}
          </span>
        )}
      </div>
    );
  },
);

AuthInput.displayName = "AuthInput";

export default AuthInput;
