"use client";

import { AnimatePresence, motion } from "framer-motion";

import RequirementBadge from "@/features/auth/components/atoms/RequirementBadge/RequirementBadge";
import { passwordRules } from "@/features/auth/helpers";

const PasswordStrengthChecklist = ({
  password,
  visible,
}: {
  password: string;
  visible: boolean;
}) => {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 gap-x-3 gap-y-1.5 overflow-hidden pt-1"
        >
          {passwordRules.map((rule) => (
            <RequirementBadge
              key={rule.key}
              label={rule.label}
              met={rule.test(password)}
              dirty={password.length > 0}
            />
          ))}
        </motion.ul>
      )}
    </AnimatePresence>
  );
};

export default PasswordStrengthChecklist;
