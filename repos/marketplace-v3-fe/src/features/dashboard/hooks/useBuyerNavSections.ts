"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  Gift,
  Heart,
  LayoutDashboard,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  ShieldAlert,
  Star,
} from "lucide-react";

import { DashboardNavSection } from "../types";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useBuyerNavSections = (): DashboardNavSection[] => {
  const t = useTranslations("Dashboard.nav");
  const { routes } = useGetAllRoutes();

  return useMemo<DashboardNavSection[]>(() => [
    {
      label: t("overview.label"),
      items: [
        {
          label: t("overview.dashboard"),
          href: routes.dashboard,
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: t("buying.label"),
      items: [
        { label: t("buying.orders"), href: routes.orders, icon: Package },
        { label: t("buying.rfqs"), href: routes.quotes, icon: FileText },
        {
          label: t("buying.messages"),
          href: routes.messages,
          icon: MessageSquare,
        },
        {
          label: t("buying.savedProducts"),
          href: routes.savedProducts,
          icon: Heart,
        },
      ],
    },
    {
      label: t("afterSales.label"),
      items: [
        { label: t("afterSales.reviews"), href: routes.reviews, icon: Star },
        {
          label: t("afterSales.disputes"),
          href: routes.disputes,
          icon: ShieldAlert,
        },
        {
          label: t("afterSales.returnsRefunds"),
          href: routes.returnsRefunds,
          icon: RotateCcw,
        },
      ],
    },
    {
      label: t("rewards.label"),
      items: [
        { label: t("rewards.referrals"), href: routes.referrals, icon: Gift },
      ],
    },
    {
      label: t("account.label"),
      items: [
        {
          label: t("account.profileSettings"),
          href: routes.profileSettings,
          icon: Settings,
        },
      ],
    },
  ], [t, routes]);
};
