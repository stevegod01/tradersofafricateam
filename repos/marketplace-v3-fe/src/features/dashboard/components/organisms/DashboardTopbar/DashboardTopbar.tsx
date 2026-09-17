"use client";

import { Bell, Menu, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import UserMenu from "@/components/molecules/UserMenu/UserMenu";
import CartIcon from "@/components/atoms/CartIcon/CartIcon";
import TopbarIconLink from "@/features/dashboard/components/atoms/TopbarIconLink/TopbarIconLink";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const DashboardTopbar = ({
  title,
  onMenuClick,
}: {
  title: string;
  onMenuClick: () => void;
}) => {
  const t = useTranslations("Dashboard.topbar");
  const { routes } = useGetAllRoutes();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-lg hover:bg-muted lg:hidden"
        >
          <Menu size={18} />
        </button>
        <h1 className="heading-font text-lg font-bold text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <TopbarIconLink
          href={routes.messages}
          icon={MessageSquare}
          label={t("messages")}
        />
        <TopbarIconLink
          href={routes.notifications}
          icon={Bell}
          label={t("notifications")}
        />
        <CartIcon />
        <div className="ml-1.5 border-l border-border pl-2.5 sm:ml-2 sm:pl-3">
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default DashboardTopbar;
