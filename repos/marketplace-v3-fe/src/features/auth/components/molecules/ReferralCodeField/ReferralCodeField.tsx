"use client";

import { ChangeEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Tag } from "lucide-react";

import AuthInput from "@/features/auth/components/atoms/AuthInput/AuthInput";
import { cn } from "@/lib/utils";

const ReferralCodeField = ({
  value,
  onChange,
  label,
  triggerLabel,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  label: string;
  triggerLabel: string;
}) => {
  const [open, setOpen] = useState(Boolean(value));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 self-start text-xs font-semibold text-muted-foreground transition-colors hover:text-(--orange)"
      >
        <Tag size={12} />
        {triggerLabel}
        <ChevronDown
          size={13}
          className={cn("transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <AuthInput
              id="referralCode"
              name="referralCode"
              value={value}
              onChange={onChange}
              placeholder={label}
              icon={<Tag size={16} />}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReferralCodeField;
