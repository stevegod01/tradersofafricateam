"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const SidebarNavLink = ({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  onNavigate?: () => void;
}) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm transition-colors duration-200",
        isActive
          ? "font-semibold text-(--orange)"
          : "text-foreground/70 hover:bg-muted hover:text-foreground",
      )}
    >
      {isActive && (
        <motion.span
          layoutId="dashboard-sidebar-active"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-(--orange)"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon size={16} className="relative shrink-0" strokeWidth={2} />
      <span className="relative">{label}</span>
    </Link>
  );
};

export default memo(SidebarNavLink);
