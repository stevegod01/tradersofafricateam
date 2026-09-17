import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import SellerCta from "@/components/atoms/SellerCta/SellerCta";
import SellerShowcase from "@/components/organisms/SellerShowcase/SellerShowcase";

const SellerHero = () => {
  const t = useTranslations("becomeSeller");

  return (
    <SectionWrapper className="bg-muted/40 py-14 lg:py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <ScrollReveal>
          <div className="max-w-xl space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--orange-light) px-3 py-1 text-xs font-semibold text-(--orange)">
              <ShieldCheck size={13} />
              {t("hero.badge")}
            </span>
            <h1 className="heading-font text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              <span className="text-(--orange)">{t("hero.accent")}</span>{" "}
              {t("hero.title")}
            </h1>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {t("hero.description")}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <SellerCta href="#seller-plans">{t("register")}</SellerCta>
              <a
                href="#seller-onboarding"
                className="text-sm font-semibold text-foreground underline-offset-4 transition-colors hover:text-(--orange) hover:underline"
              >
                {t("hero.secondaryCta")}
              </a>
            </div>
            <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6">
              {(["sellers", "countries", "payout"] as const).map((stat) => (
                <div key={stat}>
                  <dt className="sr-only">{t(`hero.stats.${stat}.label`)}</dt>
                  <dd className="heading-font text-xl font-bold text-foreground sm:text-2xl">
                    {t(`hero.stats.${stat}.value`)}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {t(`hero.stats.${stat}.label`)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <SellerShowcase />
        </ScrollReveal>
      </div>
    </SectionWrapper>
  );
};

export default SellerHero;
