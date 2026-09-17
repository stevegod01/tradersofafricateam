"use client";

import { AnimatePresence, motion } from "framer-motion";

const AuthErrorText = ({ children }: { children?: string }) => {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.p
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.18 }}
          className="text-xs font-medium text-destructive"
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  );
};

export default AuthErrorText;
