"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const AuthCheckbox = ({
  checked,
  onCheckedChange,
  id,
  invalid,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  invalid?: boolean;
}) => {
  return (
    <Checkbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      className={cn(
        "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-md border border-border bg-background transition-all duration-150",
        "data-[checked]:border-(--orange) data-[checked]:bg-(--orange)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--orange)",
        invalid && "border-destructive",
      )}
    >
      <Checkbox.Indicator className="flex items-center justify-center text-white">
        <Check size={11} strokeWidth={3} />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
};

export default AuthCheckbox;
