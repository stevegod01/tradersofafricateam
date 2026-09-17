import { cn } from "@/lib/utils";

const DotPattern = ({
  count,
  columns,
  color,
  className,
}: {
  count: number;
  columns: 2 | 3 | 4;
  color: "blue" | "orange";
  className?: string;
}) => (
  <div
    aria-hidden="true"
    className={cn("absolute grid gap-5 sm:gap-7", className)}
    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
  >
    {Array.from({ length: count }).map((_, index) => (
      <span
        key={index}
        className={cn(
          "size-2.5 rounded-full sm:size-3.5",
          color === "blue" ? "bg-sky-300/75" : "bg-orange-300/80",
        )}
      />
    ))}
  </div>
);

export default DotPattern;
