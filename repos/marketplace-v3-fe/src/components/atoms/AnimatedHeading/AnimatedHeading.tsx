"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const AnimatedHeading = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.h2
      aria-label={children}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "visible"}
      viewport={{ once: true, amount: 0.8 }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.035 } },
      }}
      className={cn("heading-font", className)}
    >
      {Array.from(children).map((character, index) => (
        <motion.span
          key={`${character}-${index}`}
          aria-hidden="true"
          variants={{
            hidden: { opacity: 0, y: 16, rotateX: -45 },
            visible: {
              opacity: 1,
              y: 0,
              rotateX: 0,
              transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
            },
          }}
          className={character === " " ? "inline-block w-[0.28em]" : "inline-block"}
        >
          {character === " " ? "\u00a0" : character}
        </motion.span>
      ))}
    </motion.h2>
  );
};

export default AnimatedHeading;
