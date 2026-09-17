import { useCallback, useEffect, useState } from "react";
import { SliderType } from "../types";

export const useSlider = ({
  autoPlayInterval = 4000,
  slides,
}: {
  autoPlayInterval?: number;
  slides: SliderType[];
}) => {
  const [current, setCurrent] = useState(0);

  const next = useCallback(
    () => setCurrent((p) => (p + 1) % slides.length),
    [slides.length],
  );

  const prev = useCallback(
    () => setCurrent((p) => (p - 1 + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    const t = setInterval(next, autoPlayInterval);
    return () => clearInterval(t);
  }, [next, autoPlayInterval]);

  return { current, setCurrent, prev, next };
};
