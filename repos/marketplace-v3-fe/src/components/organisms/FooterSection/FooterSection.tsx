import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import FooterLower from "@/components/molecules/FooterLower/FooterLower";
import FooterUpper from "@/components/molecules/FooterUpper/FooterUpper";
import NewsLetter from "@/components/molecules/NewsLetter/NewsLetter";

const FooterSection = () => {
  return (
    <SectionWrapper tag="footer" className="sm:py-14 py-10 bg-(--brown)">
      <div className="sm:space-y-14 spce-y-10">
        <FooterUpper />
        <NewsLetter />
        <FooterLower />
      </div>
    </SectionWrapper>
  );
};

export default FooterSection;
