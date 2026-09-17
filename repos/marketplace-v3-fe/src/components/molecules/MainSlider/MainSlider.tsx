"use client";

import Link from "next/link";

import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { useSlider } from "@/lib/hooks/useSlider";
import { mainSlides } from "@/lib/constants/dummyData";

import DotIndicatorWrapper from "../DotIndicatorWrapper/DotIndicatorWrapper";

const MainSlider = ({ autoPlayInterval }: { autoPlayInterval?: number }) => {
  const locale = useLocale();
  const t = useTranslations("HomePage");
  const { current, setCurrent } = useSlider({
    slides: mainSlides,
    autoPlayInterval,
  });

  const slides = mainSlides;
  const slide = slides[current];
  const href = `/${locale}${slide.href.replace(/^\/en/, "")}`;
  const slideText = (key: "badge" | "title" | "subtitle") => {
    const messageKey = `slides.${slide.id}.${key}`;
    return t.has(messageKey) ? t(messageKey) : slide[key];
  };

  return (
    <div className="relative rounded-xl overflow-hidden h-full min-h-75 cursor-pointer select-none">
      <AnimatePresence mode="sync">
        <motion.div
          key={current}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex items-end p-6"
          style={{ background: slides[current].bgColor }}
        >
          <Link
            href={href}
            className="absolute inset-0"
            aria-label={slideText("title")}
          />

          <div className="absolute inset-0 flex items-center justify-center text-8xl opacity-20 pointer-events-none select-none">
              {slide.emoji}
          </div>

          <div className="">
            <span
              className="inline-block text-xs font-medium px-3 py-1 rounded-full mb-2"
              style={{
                background: slide.badgeColor + "33",
                color: slide.badgeColor,
              }}
            >
              {slideText("badge")}
            </span>
            <h2 className="text-xl font-medium text-white leading-snug drop-shadow-md mb-1">
              {slideText("title")}
            </h2>
            <p className="text-sm text-white/80">{slideText("subtitle")}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <DotIndicatorWrapper
        current={current}
        setCurrent={setCurrent}
        slides={slides}
      />
    </div>
  );
};

export default MainSlider;
