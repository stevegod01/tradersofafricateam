"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const RequirementBadge = ({
  label,
  met,
  dirty,
}: {
  label: string;
  met: boolean;
  dirty: boolean;
}) => {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 text-xs transition-colors duration-200",
        !dirty && "text-muted-foreground",
        dirty && met && "text-emerald-600",
        dirty && !met && "text-muted-foreground",
      )}
    >
      <motion.span
        animate={{ scale: dirty && met ? [1, 1.25, 1] : 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          dirty && met
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-muted-foreground/40 text-muted-foreground/40",
        )}
      >
        {dirty && met ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
      </motion.span>
      {label}
    </li>
  );
};

export default RequirementBadge;
