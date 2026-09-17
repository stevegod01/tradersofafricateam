import { memo } from "react";
import type { LucideIcon } from "lucide-react";

const SellerBenefitCard = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <article className="group h-full space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-(--orange)/30 hover:shadow-md">
    <div className="flex size-11 items-center justify-center rounded-xl bg-(--orange-light) text-(--orange) transition-colors duration-300 group-hover:bg-(--orange) group-hover:text-white">
      <Icon size={19} aria-hidden="true" />
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  </article>
);

export default memo(SellerBenefitCard);
