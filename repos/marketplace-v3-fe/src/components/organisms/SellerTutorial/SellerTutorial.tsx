import { useTranslations } from "next-intl";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import InlineVideoPlayer from "@/components/molecules/InlineVideoPlayer/InlineVideoPlayer";

const SellerTutorial = () => {
  const t = useTranslations("becomeSeller");

  return (
    <SectionWrapper className="bg-muted/40 py-16 lg:py-20">
      <ScrollReveal>
        <div className="text-center">
          <h2 className="heading-font text-2xl font-bold sm:text-3xl">
            {t("tutorial.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tutorial.subtitle")}
          </p>
        </div>
        <div className="overflow-hidden">
          <InlineVideoPlayer
            url="https://youtu.be/JlNN4nfaMQs?si=gW-ma6BdKEEJR37R"
            playLabel={t("tutorial.play")}
          />
        </div>
      </ScrollReveal>
    </SectionWrapper>
  );
};

export default SellerTutorial;
