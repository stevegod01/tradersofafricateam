"use client";

import { motion } from "framer-motion";

const AuthHeading = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8 flex flex-col gap-2"
    >
      <h1 className="heading-font text-2xl font-bold text-foreground sm:text-[1.75rem]">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </motion.div>
  );
};

export default AuthHeading;
