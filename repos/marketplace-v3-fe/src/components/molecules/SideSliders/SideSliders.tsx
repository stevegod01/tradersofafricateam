import SingleSideSlider from "../SingleSideSlider/SingleSideSlider";
import { SliderType } from "@/lib/types";

const SideSliders = ({
  topSlides,
  bottomSlides,
}: {
  topSlides: SliderType[];
  bottomSlides: SliderType[];
}) => {
  return (
    <div className="flex flex-col gap-3 h-full">
      {topSlides?.length > 0 && (
        <SingleSideSlider slides={topSlides} autoPlayInterval={4200} />
      )}
      {bottomSlides?.length > 0 && (
        <SingleSideSlider slides={bottomSlides} autoPlayInterval={5100} />
      )}
    </div>
  );
};

export default SideSliders;
