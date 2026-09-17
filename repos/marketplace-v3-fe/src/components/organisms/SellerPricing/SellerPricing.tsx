import { useLocale, useTranslations } from "next-intl";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import SellerPlanCard from "@/components/atoms/SellerPlanCard/SellerPlanCard";
import { sellerPlans } from "@/features/sellers/constants";

const SellerPricing = () => {
  const t = useTranslations("becomeSeller");
  const locale = useLocale();

  return (
    <SectionWrapper className="bg-muted/40 py-16 lg:py-20" id="seller-plans">
      <ScrollReveal>
        <div className="text-center">
          <h2 className="heading-font text-2xl font-bold sm:text-3xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("pricing.subtitle")}
          </p>
        </div>
        <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col items-center justify-center gap-8 lg:flex-row lg:items-stretch lg:gap-6">
          {sellerPlans.map(({ key, features }) => (
            <SellerPlanCard
              key={key}
              name={t(`pricing.${key}.name`)}
              description={t(`pricing.${key}.description`)}
              price={t(`pricing.${key}.price`)}
              period={
                key === "premium" ? t("pricing.premium.period") : undefined
              }
              cta={t("pricing.choose")}
              href={`/${locale}/register`}
              highlighted={key === "premium"}
              badge={key === "premium" ? t("pricing.mostPopular") : undefined}
              unavailableFeature={
                key === "basic" ? t("pricing.basic.unavailable") : undefined
              }
              features={features.map((feature) =>
                t(`pricing.${key}.features.${feature}`),
              )}
            />
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
          {t("pricing.note")}
        </p>
      </ScrollReveal>
    </SectionWrapper>
  );
};

export default SellerPricing;
