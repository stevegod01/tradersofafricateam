"use client";

const VariantSwatch = ({
  optionName,
  value,
  isSelected,
  isAvailable = true,
  onSelect,
}: {
  optionName: string;
  value: string;
  isSelected: boolean;
  isAvailable?: boolean;
  onSelect: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!isAvailable}
      aria-pressed={isSelected}
      aria-label={`${optionName}: ${value}`}
      title={value}
      className={`relative flex max-w-full items-center rounded-md border px-4 py-2 text-left text-xs leading-4 font-medium break-words whitespace-normal transition-all duration-200 ${
        isSelected
          ? "border-(--orange) bg-(--orange)/10 text-(--orange)"
          : "border-border text-foreground hover:border-(--orange-light)"
      } ${!isAvailable ? "cursor-not-allowed opacity-40 line-through" : "cursor-pointer"}`}
    >
      {value}
    </button>
  );
};

export default VariantSwatch;
