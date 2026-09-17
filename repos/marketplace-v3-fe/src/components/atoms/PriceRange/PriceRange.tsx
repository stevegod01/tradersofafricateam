const PriceRange = ({
  min,
  max,
  limit,
  symbol,
  minLabel,
  maxLabel,
  onChange,
}: {
  min: number;
  max: number;
  limit: number;
  symbol: string;
  minLabel: string;
  maxLabel: string;
  onChange: (range: { min: number; max: number }) => void;
}) => {
  const minPercentage = (min / limit) * 100;
  const maxPercentage = (max / limit) * 100;

  return (
    <div>
      <div
        className="relative mb-5 h-1.5 rounded-full bg-muted"
        style={{
          background: `linear-gradient(to right, var(--muted) ${minPercentage}%, var(--orange) ${minPercentage}%, var(--orange) ${maxPercentage}%, var(--muted) ${maxPercentage}%)`,
        }}
      >
        <input
          aria-label={minLabel}
          type="range"
          min={0}
          max={limit}
          step={Math.max(1, Math.round(limit / 100))}
          value={min}
          onChange={(event) =>
            onChange({ min: Math.min(Number(event.target.value), max - limit / 100), max })
          }
          className="catalogue-range absolute inset-0 z-20 w-full"
        />
        <input
          aria-label={maxLabel}
          type="range"
          min={0}
          max={limit}
          step={Math.max(1, Math.round(limit / 100))}
          value={max}
          onChange={(event) =>
            onChange({ min, max: Math.max(Number(event.target.value), min + limit / 100) })
          }
          className="catalogue-range absolute inset-0 z-30 w-full"
        />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="text-[11px] text-muted-foreground">
          {minLabel}
          <span className="mt-1 flex rounded-md border border-input bg-background focus-within:border-(--orange)">
            <span className="py-2 pl-2 text-xs">{symbol}</span>
            <input value={min.toLocaleString()} inputMode="numeric" onChange={(event) => onChange({ min: Math.min(Number(event.target.value.replaceAll(",", "")) || 0, max - limit / 100), max })} className="w-full min-w-0 bg-transparent px-1 py-2 text-xs text-foreground outline-none" />
          </span>
        </label>
        <span className="pb-2 text-muted-foreground">–</span>
        <label className="text-[11px] text-muted-foreground">
          {maxLabel}
          <span className="mt-1 flex rounded-md border border-input bg-background focus-within:border-(--orange)">
            <span className="py-2 pl-2 text-xs">{symbol}</span>
            <input value={max.toLocaleString()} inputMode="numeric" onChange={(event) => onChange({ min, max: Math.min(Math.max(Number(event.target.value.replaceAll(",", "")) || limit, min + limit / 100), limit) })} className="w-full min-w-0 bg-transparent px-1 py-2 text-xs text-foreground outline-none" />
          </span>
        </label>
      </div>
    </div>
  );
};

export default PriceRange;
