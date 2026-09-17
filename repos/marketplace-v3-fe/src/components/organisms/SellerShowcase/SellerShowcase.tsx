"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Globe2 } from "lucide-react";

import DotPattern from "@/components/atoms/DotPattern/DotPattern";

const SellerShowcase = () => {
  const t = useTranslations("becomeSeller.hero");
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto flex w-full max-w-110 items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-88 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--orange-light)"
      />
      <div
        aria-hidden="true"
        className="absolute -top-4 -right-6 size-40 rounded-full bg-(--orange)/20 blur-2xl"
      />
      <DotPattern
        count={9}
        columns={3}
        color="orange"
        className="top-2 left-0 z-0"
      />
      <DotPattern
        count={4}
        columns={2}
        color="blue"
        className="right-2 bottom-6 z-0"
      />

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 24, scale: 0.97 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 aspect-1792/2400 w-full max-w-90 overflow-hidden"
      >
        <Image
          src="/assets/images/seller-empty.png"
          alt="A seller reviewing her produce store on the TOFA app, surrounded by baskets of fresh vegetables, grains, and spices."
          fill
          priority
          sizes="(min-width: 1024px) 360px, 80vw"
          className="object-cover"
        />
      </motion.div>

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: [0, -6, 0] }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{
          opacity: { duration: 0.5, delay: 0.5 },
          y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
        }}
        className="absolute top-4 -right-2 z-20 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-lg sm:-right-6"
      >
        <Globe2 size={16} className="text-(--orange)" />
        <div className="leading-tight">
          <p className="text-xs font-bold text-foreground">
            {t("stats.countries.value")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {t("stats.countries.label")}
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: [0, -6, 0] }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{
          opacity: { duration: 0.5, delay: 0.7 },
          y: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
        }}
        className="absolute bottom-6 -left-2 z-20 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-lg sm:-left-8"
      >
        <Clock size={16} className="text-(--orange)" />
        <div className="leading-tight">
          <p className="text-xs font-bold text-foreground">
            {t("stats.payout.value")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {t("stats.payout.label")}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default SellerShowcase;
