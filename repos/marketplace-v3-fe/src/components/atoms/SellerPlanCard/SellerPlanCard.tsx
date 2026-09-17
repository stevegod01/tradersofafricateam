import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import SellerCta from "@/components/atoms/SellerCta/SellerCta";

const SellerPlanCard = ({
  name,
  description,
  price,
  period,
  cta,
  href,
  features,
  unavailableFeature,
  highlighted,
  badge,
}: {
  name: string;
  description: string;
  price: string;
  period?: string;
  cta: string;
  href: string;
  features: string[];
  unavailableFeature?: string;
  highlighted?: boolean;
  badge?: string;
}) => (
  <article
    className={cn(
      "relative mx-auto flex w-full max-w-90 flex-col rounded-2xl border bg-background p-6 lg:mx-0",
      highlighted
        ? "border-(--orange) shadow-lg lg:-translate-y-2"
        : "border-border shadow-sm",
    )}
  >
    {badge && (
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-(--orange) px-3 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-sm">
        {badge}
      </span>
    )}
    <span
      aria-hidden="true"
      className={cn(
        "mb-4 block size-4 shrink-0 rounded-full border-2",
        highlighted ? "border-(--orange)" : "border-muted-foreground/30",
      )}
    />
    <h3 className="font-bold">{name}</h3>
    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    <p className="my-5 text-3xl font-bold">
      {price}
      {period && (
        <span className="text-xs font-normal text-muted-foreground">
          {period}
        </span>
      )}
    </p>
    <SellerCta href={href} variant={highlighted ? "orange" : "outline"} fullWidth>
      {cta}
    </SellerCta>
    <ul className="mt-6 space-y-3 text-xs">
      {unavailableFeature && (
        <li className="flex gap-2 text-muted-foreground">
          <X size={14} className="shrink-0 text-red-500" /> {unavailableFeature}
        </li>
      )}
      {features.map((feature) => (
        <li key={feature} className="flex gap-2">
          <Check size={14} className="shrink-0 text-emerald-500" /> {feature}
        </li>
      ))}
    </ul>
  </article>
);

export default SellerPlanCard;
