"use client";

import Link from "next/link";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { useSlider } from "@/lib/hooks/useSlider";
import { SliderType } from "@/lib/types";

const SingleSideSlider = ({
  autoPlayInterval,
  slides,
}: {
  autoPlayInterval?: number;
  slides: SliderType[];
}) => {
  const locale = useLocale();
  const t = useTranslations("HomePage");
  const { current, prev, next } = useSlider({
    slides,
    autoPlayInterval,
  });
  const slide = slides[current];
  const href = `/${locale}${slide.href.replace(/^\/en/, "")}`;
  const slideText = (key: "title" | "subtitle") => {
    const messageKey = `slides.${slide.id}.${key}`;
    return t.has(messageKey) ? t(messageKey) : slide[key];
  };

  return (
    <div className="relative rounded-xl overflow-hidden h-full min-h-32.5 cursor-pointer select-none group">
      <AnimatePresence mode="sync">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 flex items-end p-3"
          style={{ background: slides[current]?.bgColor }}
        >
          <Link
            href={href}
            className="absolute inset-0"
            aria-label={slideText("title")}
          />

          {/* Background emoji */}
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-20 pointer-events-none select-none">
            {slide.emoji}
          </div>

          {/* Content */}
          <div className="relative z-10">
            <p className="text-[13px] font-medium text-white drop-shadow leading-snug">
              {slideText("title")}
            </p>
            <p className="text-[11px] text-white/75">
              {slideText("subtitle")}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Nav buttons — visible on hover */}
      <div className="absolute bottom-2 right-2 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.preventDefault();
            prev();
          }}
          className="w-5 h-5 rounded-full bg-white/25 hover:bg-white/50 flex items-center justify-center transition-colors"
          aria-label={t.has("slides.previous") ? t("slides.previous") : "Previous"}
        >
          <ChevronLeft size={11} className="text-white" />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            next();
          }}
          className="w-5 h-5 rounded-full bg-white/25 hover:bg-white/50 flex items-center justify-center transition-colors"
          aria-label={t.has("slides.next") ? t("slides.next") : "Next"}
        >
          <ChevronRight size={11} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default SingleSideSlider;
