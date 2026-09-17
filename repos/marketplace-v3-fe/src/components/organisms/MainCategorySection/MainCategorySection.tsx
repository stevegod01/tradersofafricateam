"use client";

import { useTranslations } from "next-intl";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { categories } from "@/lib/constants/dummyData";
import { useScrollable } from "@/lib/hooks/useSrollable";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

import FadeMask from "@/components/atoms/FadeMask/FadeMask";
import MainCategoryCard from "@/components/atoms/MainCategoryCard/MainCategoryCard";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";

const MainCategorySection = () => {
  const t = useTranslations("Hero.categories");

  const { routes } = useGetAllRoutes();
  const {
    viewportRef,
    trackRef,
    offset,
    showPrev,
    showNext,
    scrollPrev,
    scrollNext,
  } = useScrollable();

  return (
    <SectionWrapper paddingX="xl:px-14" className="sm:pb-14 pb-10">
      <div className="p-6 max-sm:py-4 bg-background rounded-xl">
        <div className="relative">
          <AnimatePresence>
            {showPrev && (
              <motion.button
                key="prev"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18 }}
                onClick={scrollPrev}
                aria-label={t("prevAriaLabel")}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/80 transition-colors shadow-sm"
              >
                <ChevronLeft size={16} className="text-muted" />
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showNext && (
              <motion.button
                key="next"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.18 }}
                onClick={scrollNext}
                aria-label={t("nextAriaLabel")}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/80 transition-colors shadow-sm"
              >
                <ChevronRight size={16} className="text-muted" />
              </motion.button>
            )}
          </AnimatePresence>

          <FadeMask isActive={showPrev} />
          <FadeMask isActive={showNext} className="right-0 bg-linear-to-l" />

          {/* Scrollable viewport */}
          <div ref={viewportRef} className="overflow-hidden">
            <div
              ref={trackRef}
              className="flex gap-4 transition-transform duration-380 ease-in-out will-change-transform pb-1"
              style={{ transform: `translateX(-${offset}px)` }}
            >
              {categories.map((cat) => (
                <MainCategoryCard
                  key={cat?.id}
                  href={routes?.categoryInfo(cat?.id)}
                  image={cat?.image}
                  category={
                    t.has(cat.category) ? t(cat.category) : cat.category
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
};

export default MainCategorySection;
