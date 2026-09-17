"use client";

import VariantSwatch from "@/features/products/components/atoms/VariantSwatch/VariantSwatch";
import { ProductVariantOption } from "@/features/products/types";

const VariantOptionGroup = ({
  option,
  selectedValue,
  onSelect,
  isValueAvailable,
}: {
  option: ProductVariantOption;
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
  isValueAvailable: (value: string) => boolean;
}) => {
  return (
    <div className="min-w-0 space-y-2 overflow-hidden">
      <p className="text-sm font-semibold text-foreground">
        {option.name}
        {selectedValue && (
          <span className="ml-1.5 font-normal text-muted-foreground">{selectedValue}</span>
        )}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {option.values.map((value) => (
          <VariantSwatch
            key={value}
            optionName={option.name}
            value={value}
            isSelected={selectedValue === value}
            isAvailable={isValueAvailable(value)}
            onSelect={() => onSelect(value)}
          />
        ))}
      </div>
    </div>
  );
};

export default VariantOptionGroup;
