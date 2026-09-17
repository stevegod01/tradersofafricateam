"use client";

import { steps } from "@/lib/constants";
import { useTranslations } from "next-intl";

import StepCard from "@/components/atoms/StepCard/StepCard";

const StepsWrapper = () => {
  const t = useTranslations();

  return (
    <div className="flex gap-10 justify-between flex-wrap w-full">
      {steps?.map((step, i) => (
        <StepCard
          key={i}
          iconUrl={step.iconUrl}
          title={t(step.title)}
          desc={t(step.desc)}
        />
      ))}
    </div>
  );
};

export default StepsWrapper;
