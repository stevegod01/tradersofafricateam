import MissionCard from "@/components/atoms/MissionCard/MissionCard";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";

import { useTranslations } from "next-intl";

const MissionVisionWrapper = () => {
  const t = useTranslations("aboutUs");

  return (
    <SectionWrapper className="sm:py-14 py-10 bg-(--brown)">
      <div className="grid lg:grid-cols-12 grid-cols-6 gap-10">
        <MissionCard
          title={t("ourMission")}
          desc={t("theMission")}
          className=""
        />
        <MissionCard
          title={t("ourVision")}
          desc={t("theVision")}
          className=""
        />
      </div>
    </SectionWrapper>
  );
};

export default MissionVisionWrapper;
