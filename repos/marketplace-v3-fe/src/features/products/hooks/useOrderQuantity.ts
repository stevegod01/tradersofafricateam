import { useEffect, useState } from "react";

export const useOrderQuantity = (minOrdersAllowed: number, maxQuantity: number) => {
  const [quantity, setQuantity] = useState(minOrdersAllowed);

  useEffect(() => {
    setQuantity(minOrdersAllowed);
  }, [minOrdersAllowed]);

  const clamp = (value: number) =>
    Math.min(Math.max(value, minOrdersAllowed), Math.max(maxQuantity, minOrdersAllowed));

  const increment = (step = 1) => setQuantity((prev) => clamp(prev + step));
  const decrement = (step = 1) => setQuantity((prev) => clamp(prev - step));
  const setValue = (value: number) => setQuantity(clamp(value));

  return { quantity, increment, decrement, setValue };
};
