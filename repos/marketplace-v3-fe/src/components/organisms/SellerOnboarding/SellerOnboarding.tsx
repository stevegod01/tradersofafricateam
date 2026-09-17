"use client";

import { useTranslations } from "next-intl";
import { FileCheck2, GraduationCap, PackagePlus, Truck } from "lucide-react";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import SellerCta from "@/components/atoms/SellerCta/SellerCta";
import { sellerSteps } from "@/features/sellers/constants";

const STEP_ICONS = {
  one: FileCheck2,
  two: GraduationCap,
  three: PackagePlus,
  four: Truck,
} as const;

const splitStep = (text: string) => {
  const [lead, ...rest] = text.split(/\.\s+/);
  return { lead: lead.replace(/\.$/, ""), description: rest.join(". ") };
};

const SellerOnboarding = () => {
  const t = useTranslations("becomeSeller");

  return (
    <SectionWrapper className="bg-background py-16 lg:py-20" id="seller-onboarding">
      <ScrollReveal>
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="heading-font text-2xl font-bold sm:text-3xl">
            {t("onboarding.title")}
          </h2>
        </div>
      </ScrollReveal>

      <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
        {sellerSteps.map((step, index) => {
          const Icon = STEP_ICONS[step];
          const { lead, description } = splitStep(t(`onboarding.steps.${step}`));

          return (
            <ScrollReveal key={step} delay={index * 0.08}>
              <div className="flex h-full gap-4 rounded-2xl border border-border bg-background p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--orange-light) text-(--orange)">
                  <Icon size={19} aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-(--orange)">
                    {t("onboarding.stepLabel", { number: index + 1 })}
                  </span>
                  <p className="text-sm font-bold text-foreground">{lead}</p>
                  {description && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      <ScrollReveal delay={0.2}>
        <div className="mt-10 flex justify-center">
          <SellerCta href="#seller-plans">{t("register")}</SellerCta>
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
};

export default SellerOnboarding;
