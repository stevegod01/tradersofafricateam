import Image from "next/image";

import { useTranslations } from "next-intl";

import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";
import TechCard from "@/components/molecules/TechCard/TechCard";
import VisibilityCard from "@/components/molecules/VisibilityCard/VisibilityCard";
import AnimatedHeading from "@/components/atoms/AnimatedHeading/AnimatedHeading";
import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";

const WhatWeDoWrapper = () => {
  const t = useTranslations("whatWeDo");

  return (
    <div className="">
      <div className="pb-20 pt-14">
        <div className="relative">
          <div className="h-175 absolute right-0 max-xl:hidden">
            <Image
              src="/assets/images/intell-img2.png"
              width={650}
              height={700}
              alt=""
              className=""
            />
          </div>
          <SectionWrapper className="xl:py-28">
            <ScrollReveal>
              <div className="max-w-xl w-full space-y-8 xl:pt-10">
                <div className="space-y-6">
                  <AnimatedHeading className="text-2xl font-bold">
                    {t("backedTech")}
                  </AnimatedHeading>
                  <p>{t("backedTechDesc")}</p>
                </div>
                <div className="space-y-6">
                  <TechCard title={t("monitoring")} />
                  <TechCard title={t("productMap")} />
                  <TechCard title={t("SeasonalityData")} />
                  <TechCard title={t("commodityPrice")} />
                  <TechCard title={t("instantPayment")} />
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="space-y-6 xl:pt-56 pt-10">
                <div className="max-w-2xl w-full space-y-6">
                  <SectionTitle
                    title={t("providingVisibility")}
                    className="font-bold text-2xl"
                  />
                  <p>{t("providingVisibilitydesc")}</p>
                </div>
                <div className="grid lg:grid-cols-2 grid-cols-1 gap-10">
                  <VisibilityCard
                    imgUrl="/assets/images/bh-img.png"
                    title={t("buyerHub")}
                    desc={t("buyerHubDesc")}
                  />
                  <VisibilityCard
                    imgUrl="/assets/images/sm-img.jpg"
                    title={t("onlineMarket")}
                    desc={t("onlineMarketDesc")}
                  />
                </div>
              </div>
            </ScrollReveal>
          </SectionWrapper>
        </div>
      </div>
    </div>
  );
};

export default WhatWeDoWrapper;
