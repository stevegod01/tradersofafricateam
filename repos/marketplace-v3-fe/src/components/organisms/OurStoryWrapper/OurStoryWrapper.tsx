import MissionVisionWrapper from "@/components/molecules/MissionVisionWrapper/MissionVisionWrapper";
import OurTeam from "@/components/molecules/OurTeam/OurTeam";
import TheStory from "@/components/molecules/TheStory/TheStory";
import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";

const OurStoryWrapper = () => {
  return (
    <div>
      <ScrollReveal>
        <TheStory />
      </ScrollReveal>
      <ScrollReveal>
        <MissionVisionWrapper />
      </ScrollReveal>
      <ScrollReveal>
        <OurTeam />
      </ScrollReveal>
    </div>
  );
};

export default OurStoryWrapper;
