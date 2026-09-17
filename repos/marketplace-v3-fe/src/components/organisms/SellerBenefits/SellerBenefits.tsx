import { useTranslations } from "next-intl";

import SellerBenefitCard from "@/components/atoms/SellerBenefitCard/SellerBenefitCard";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import { sellerBenefits } from "@/features/sellers/constants";

const SellerBenefits = () => {
  const t = useTranslations("becomeSeller");

  return (
    <SectionWrapper className="bg-muted/40 py-16 lg:py-20">
      <ScrollReveal>
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="heading-font text-2xl font-bold sm:text-3xl">{t("benefits.title")}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("benefits.subtitle")}</p>
        </div>
      </ScrollReveal>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {sellerBenefits.map(({ key, icon }, index) => (
          <ScrollReveal key={key} delay={index * 0.08}>
            <SellerBenefitCard icon={icon} title={t(`benefits.items.${key}.title`)} description={t(`benefits.items.${key}.description`)} />
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
};

export default SellerBenefits;
