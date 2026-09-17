import { useTranslations } from "next-intl";

import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import AnimatedHeading from "@/components/atoms/AnimatedHeading/AnimatedHeading";
import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";

const OurImpactWrapper = () => {
  const t = useTranslations("ourImpact");

  return (
    <div className="w-full bg-background">
      <div
        className="w-full"
        style={{
          background: "url('/assets/images/imp-bn.jpg')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <SectionWrapper>
          <ScrollReveal>
            <div className="max-w-xl space-y-6 text-white">
              <AnimatedHeading className="text-xl font-bold sm:text-3xl">
                {t("customerStory")}
              </AnimatedHeading>
              <div className="space-y-4 ">
                <p className="sm:text-xl font-medium">{t("customerDesc")}</p>
                <p className="max-sm:text-xs">{t("speaker")}</p>
              </div>
            </div>
          </ScrollReveal>
        </SectionWrapper>
      </div>
      <SectionWrapper>
        <div className=""></div>
      </SectionWrapper>
    </div>
  );
};

export default OurImpactWrapper;
