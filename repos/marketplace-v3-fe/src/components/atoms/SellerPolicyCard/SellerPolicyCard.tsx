import type { LucideIcon } from "lucide-react";

import Download from "@/components/atoms/icons/Download";

const SellerPolicyCard = ({
  icon: Icon,
  title,
  description,
  downloadLabel,
  downloadHref,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  downloadLabel: string;
  downloadHref: string;
}) => (
  <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
    <div className="flex size-11 items-center justify-center rounded-xl bg-(--orange-light) text-(--orange)">
      <Icon size={19} aria-hidden="true" />
    </div>
    <h3 className="text-lg font-bold">{title}</h3>
    <p className="flex-1 text-sm leading-7 text-muted-foreground">{description}</p>
    <a
      href={downloadHref}
      download
      className="flex w-fit items-center gap-2 text-xs font-semibold text-foreground transition-colors hover:text-(--orange)"
    >
      <Download />
      {downloadLabel}
    </a>
  </article>
);

export default SellerPolicyCard;
