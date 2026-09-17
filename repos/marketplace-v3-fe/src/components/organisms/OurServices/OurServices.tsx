import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import OurServiceCard from "@/components/molecules/OurServiceCard/OurServiceCard";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";

const OurServices = () => {
  const t = useTranslations("whatWeDo");

  return (
    <div className="bg-background">
      <div
        className="bg-cover bg-center bg-no-repeat"
        style={{ background: "url('/assets/images/h1-map1.svg')" }}
      >
        <SectionWrapper>
          <div className="sm:space-y-20 space-y-16">
            <ScrollReveal>
              <OurServiceCard
                title={t("foreFront")}
                imgUrl="/assets/images/network.png"
                className="max-w-90 w-full"
              >
                <p>{t("foreFrontDesc")}</p>
                <p>{t("foreFrontDesc2")}</p>
              </OurServiceCard>
            </ScrollReveal>
            <ScrollReveal>
              <OurServiceCard
                title={t("sourceProWork")}
                imgUrl="/assets/images/sp2.png"
                className="max-w-125 w-full"
                size={450}
                isImgFirst
              >
                <p>{t("sourceProWorkDesc")}</p>
              </OurServiceCard>
            </ScrollReveal>
            <ScrollReveal>
              <OurServiceCard
                title={t("BuildSupplyCapacity")}
                imgUrl="/assets/images/tcb-img.png"
                className="max-w-125 w-full"
                size={500}
              >
                <p>{t("BuildSupplyCapacityDesc")}</p>
                <p>{t("BuildSupplyCapacityDesc2")}</p>
              </OurServiceCard>
            </ScrollReveal>
          </div>
        </SectionWrapper>
      </div>
    </div>
  );
};

export default OurServices;
