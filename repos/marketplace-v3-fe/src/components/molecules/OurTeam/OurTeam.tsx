import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import StyledParagraph from "@/components/atoms/StyledParagraph/StyledParagraph";
import TeamCard from "@/components/atoms/TeamCard/TeamCard";

import { team } from "@/lib/constants/teamMembers";

import { useTranslations } from "next-intl";

const OurTeam = () => {
  const t = useTranslations("aboutUs");

  return (
    <SectionWrapper>
      <div className="space-y-6">
        <SectionTitle title={t("ourTeam")} className="font-bold text-2xl" />
        <div className="max-w-3xl w-full space-y-8">
          <p>{t("teamDesc")}</p>
          <StyledParagraph desc={t("teamQuote")} className="max-w-lg w-full" />
        </div>
        <div className="flex gap-10 flex-wrap justify-between">
          {team?.map((tm) => (
            <TeamCard
              key={tm?.name}
              name={tm?.name}
              role={t(`roles.${tm.role}`)}
              url={tm?.url}
              imgUrl={tm?.imgUrl}
            />
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
};

export default OurTeam;
