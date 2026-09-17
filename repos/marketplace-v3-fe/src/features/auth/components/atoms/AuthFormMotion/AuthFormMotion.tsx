"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

const AuthFormMotion = (props: HTMLMotionProps<"form">) => (
  <motion.form
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    {...props}
  />
);

export default AuthFormMotion;
