"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import DashboardLayout from "@/features/dashboard/components/templates/DashboardLayout/DashboardLayout";
import DashboardOverview from "@/features/dashboard/components/organisms/DashboardOverview/DashboardOverview";
import DashboardSkeleton from "@/features/dashboard/components/templates/DashboardSkeleton/DashboardSkeleton";
import { useBuyerNavSections } from "@/features/dashboard/hooks/useBuyerNavSections";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { useStore } from "@/store/authStore";

const BuyerDashboardShell = () => {
  const t = useTranslations("Dashboard.topbar");
  const router = useRouter();
  const { routes } = useGetAllRoutes();
  const sections = useBuyerNavSections();

  const currentUser = useStore((state) => state.currentUser);
  const isAuthInitialized = useStore((state) => state.isAuthInitialized);

  useEffect(() => {
    if (isAuthInitialized && !currentUser) {
      const query = new URLSearchParams({ returnUrl: routes.dashboard });
      router.replace(`${routes.login}?${query.toString()}`);
    }
  }, [isAuthInitialized, currentUser, router, routes]);

  if (!currentUser) {
    return <DashboardSkeleton />;
  }

  return (
    <DashboardLayout sections={sections} title={t("overviewTitle")}>
      <DashboardOverview />
    </DashboardLayout>
  );
};

export default BuyerDashboardShell;
