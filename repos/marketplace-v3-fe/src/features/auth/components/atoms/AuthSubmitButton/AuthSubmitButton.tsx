"use client";

import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface AuthSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

const AuthSubmitButton = ({
  loading,
  disabled,
  children,
  className,
  ...props
}: AuthSubmitButtonProps) => {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--orange) text-sm font-semibold text-white shadow-sm transition-all duration-200",
        "hover:bg-(--orange-dark) hover:shadow-md active:scale-[0.99]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
};

export default AuthSubmitButton;
