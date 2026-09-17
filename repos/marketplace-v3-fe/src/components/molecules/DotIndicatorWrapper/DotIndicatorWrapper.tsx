import DotIndicator from "@/components/atoms/DotIndicator/DotIndicator";

import { SliderType } from "@/lib/types";

const DotIndicatorWrapper = ({
  slides,
  current,
  setCurrent,
}: {
  slides: SliderType[];
  current: number;
  setCurrent: (i: number) => void;
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
      {slides.map((_, i) => (
        <DotIndicator
          key={i}
          i={i}
          isCurrent={i === current}
          setCurrent={setCurrent}
        />
      ))}
    </div>
  );
};

export default DotIndicatorWrapper;
