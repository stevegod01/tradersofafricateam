import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import CategoryPanel from "@/components/molecules/CategoryPanel/CategoryPanel";
import MainSlider from "@/components/molecules/MainSlider/MainSlider";
import SideSliders from "@/components/molecules/SideSliders/SideSliders";

import { bottomSlides, topSlides } from "@/lib/constants/dummyData";

const HeroSection = () => {
  return (
    <SectionWrapper paddingX="xl:px-14" className="sm:py-14 py-8">
      <div
        className="
        grid gap-3
        grid-cols-1
        md:grid-cols-[2fr_1fr]
        lg:grid-cols-[250px_2fr_1fr]
      "
      >
        {" "}
        <div className="hidden lg:block">
          <CategoryPanel />
        </div>
        <div className="h-80 md:h-90 lg:h-auto lg:min-h-95">
          <MainSlider />
        </div>
        <div
          className="
          flex gap-3
          flex-row  md:flex-col
          h-40 md:h-auto
        "
        >
          <div className="flex-1 h-full lg:hidden">
            <SideSliders topSlides={topSlides} bottomSlides={[]} />
          </div>
          <div className="flex-1 h-full lg:hidden">
            <SideSliders topSlides={bottomSlides} bottomSlides={[]} />
          </div>

          <div className="hidden lg:flex lg:flex-col lg:gap-3 lg:flex-1">
            <SideSliders topSlides={topSlides} bottomSlides={bottomSlides} />
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
};

export default HeroSection;
