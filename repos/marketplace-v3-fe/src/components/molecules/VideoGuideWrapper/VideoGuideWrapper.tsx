"use client";

import { useState } from "react";

import { videoGuide } from "@/lib/constants";
import { useTranslations } from "next-intl";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import VideoPlayer from "@/components/atoms/VideoPlayer/VideoPlayer";
import HowItWorksHeader from "../HowItWorksHeader/HowItWorksHeader";
import DotIndicator from "@/components/atoms/DotIndicator/DotIndicator";

const VideoGuideWrapper = () => {
  const t = useTranslations();

  const [currentGuide, setCurrentGuide] = useState(1);

  const itsNotLast = videoGuide?.length > currentGuide;
  const itsFirst = currentGuide <= 1;

  const nextGuide = () => {
    if (itsNotLast) {
      setCurrentGuide((prev) => prev + 1);
    }
  };

  const prevGuide = () => {
    if (!itsFirst) {
      setCurrentGuide((prev) => prev - 1);
    }
  };

  const selectGuide = (guide: number) => {
    setCurrentGuide(guide);
  };

  return (
    <div className="">
      <div className="flex justify-between flex-wrap md:gap-20 gap-10">
        <div className="max-w-90.5 w-full min-w-70 h-full flex items-center">
          <div className="space-y-6 ">
            <motion.h5 className="text-transparent font-bold [-webkit-text-stroke:1px_var(--background)] text-[64px] opacity-65 m-0">
              {videoGuide[currentGuide - 1]?.id}.
            </motion.h5>
            <motion.div className="">
              <HowItWorksHeader>
                {t(videoGuide[currentGuide - 1]?.title)}
              </HowItWorksHeader>
            </motion.div>
            <div className="flex gap-1 items-center">
              {videoGuide?.map((indicator) => (
                <DotIndicator
                  key={indicator.id}
                  isCurrent={indicator?.id === currentGuide}
                  setCurrent={selectGuide}
                  i={indicator.id}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={itsFirst}
                onClick={prevGuide}
                aria-label={t("Hero.categories.prevAriaLabel")}
                className="w-8 h-8 rounded-full bg-background flex items-center justify-center hover:bg-background/80 disabled:opacity-40 transition-colors shadow-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={!itsNotLast}
                onClick={nextGuide}
                aria-label={t("Hero.categories.nextAriaLabel")}
                className="w-8 h-8 rounded-full bg-background flex items-center justify-center hover:bg-background/80 disabled:bg-background/40 transition-colors shadow-sm"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
        <VideoPlayer url="https://youtu.be/JlNN4nfaMQs?si=gW-ma6BdKEEJR37R" />
      </div>
    </div>
  );
};

export default VideoGuideWrapper;
