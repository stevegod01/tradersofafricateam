import { memo } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const TopbarIconLink = ({
  href,
  icon: Icon,
  label,
  badgeCount,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badgeCount?: number;
}) => (
  <Link
    href={href}
    aria-label={label}
    className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    <Icon size={18} strokeWidth={2} />
    {Boolean(badgeCount) && (
      <span className="absolute top-1 right-1 size-2 rounded-full bg-(--orange)" />
    )}
  </Link>
);

export default memo(TopbarIconLink);
