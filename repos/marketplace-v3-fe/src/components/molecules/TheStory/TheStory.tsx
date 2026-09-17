import Image from "next/image";

import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import AnimatedHeading from "@/components/atoms/AnimatedHeading/AnimatedHeading";

import { useTranslations } from "next-intl";
import StyledParagraph from "@/components/atoms/StyledParagraph/StyledParagraph";

const TheStory = () => {
  const t = useTranslations("aboutUs");

  return (
    <div
      className="bg-no-repeat bg-center bg-cover w-full pb-20 lg:pt-28 md:pt-20 pt-14 h-full"
      style={{ backgroundImage: "url('/assets/images/about-bg.png')" }}
    >
      <SectionWrapper className="">
        <div className="grid grid-cols-12">
          <div className="lg:col-span-6 md:col-span-10 col-span-12 space-y-4">
            <AnimatedHeading className="text-2xl font-bold">
              {t("ourStory")}
            </AnimatedHeading>
            <div className="space-y-8">
              <p className=" leading-loose">{t("theStory")}</p>
              <StyledParagraph desc={t("ujuQuote")} />
              <div className="">
                <a
                  href="https://www.youtube.com/watch?v=zsj0Tw38qj0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 group w-fit"
                >
                  <Image
                    src="/assets/images/dark-play-btn.svg"
                    width={50}
                    height={50}
                    alt=""
                    className="object-contain"
                  />
                  <p className="group-hover:text-(--orange) transition-all duration-300 ease-out group-hover:underline">
                    {t("watchGroundnutStory")}
                  </p>
                </a>
              </div>
            </div>
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
};

export default TheStory;
