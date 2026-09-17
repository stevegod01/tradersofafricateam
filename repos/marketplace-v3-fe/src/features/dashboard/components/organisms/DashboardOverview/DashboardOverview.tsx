"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import DashboardStatCard from "@/features/dashboard/components/atoms/DashboardStatCard/DashboardStatCard";
import AnalyticsDateRangePicker from "@/features/dashboard/components/molecules/AnalyticsDateRangePicker/AnalyticsDateRangePicker";
import IncompleteProfilePrompt from "@/features/dashboard/components/molecules/IncompleteProfilePrompt/IncompleteProfilePrompt";
import { isUserProfileIncomplete } from "@/features/dashboard/helpers";
import { getCurrentMonthRange } from "@/features/dashboard/helpers/dateRange";
import { useBuyerAnalyticsOverview } from "@/features/dashboard/hooks/useBuyerAnalyticsOverview";
import type { BuyerAnalyticsDateRange } from "@/features/dashboard/types";
import { useStore } from "@/store/authStore";

const UpdateProfileModal = dynamic(
  () =>
    import(
      "@/features/dashboard/components/organisms/UpdateProfileModal/UpdateProfileModal"
    ),
  { ssr: false },
);

const DashboardOverview = () => {
  const t = useTranslations("Dashboard.overview");
  const currentUser = useStore((state) => state.currentUser);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<BuyerAnalyticsDateRange>(() =>
    getCurrentMonthRange(),
  );
  const analyticsQuery = useBuyerAnalyticsOverview(dateRange);
  const openProfileModal = useCallback(() => setProfileModalOpen(true), []);
  const firstName =
    currentUser?.firstName ||
    currentUser?.email.split("@")[0] ||
    t("fallbackName");
  const totalOrders =
    analyticsQuery.data?.totalOrders ?? analyticsQuery.data?.orders ?? 0;
  const totalRfqs =
    analyticsQuery.data?.totalRfqs ??
    analyticsQuery.data?.totalRFQs ??
    analyticsQuery.data?.rfqs ??
    0;
  const analyticsValue = (value: number) =>
    analyticsQuery.isPending ? "—" : String(value);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="heading-font text-2xl font-bold text-foreground">
            {t("greeting", { name: firstName })}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {analyticsQuery.isFetching && (
            <LoaderCircle
              aria-label={t("dateRange.refreshing")}
              className="shrink-0 animate-spin text-(--orange)"
              size={17}
            />
          )}
          <AnalyticsDateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {analyticsQuery.isError && (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {t("analyticsError")}
        </div>
      )}

      {currentUser && isUserProfileIncomplete(currentUser) && (
        <IncompleteProfilePrompt
          title={t("profilePrompt.title")}
          description={t("profilePrompt.description")}
          actionLabel={t("profilePrompt.action")}
          onOpen={openProfileModal}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardStatCard
          label={t("stats.orders")}
          value={analyticsValue(totalOrders)}
          hint={t("stats.ordersHint")}
        />
        <DashboardStatCard
          label={t("stats.rfqs")}
          value={analyticsValue(totalRfqs)}
          hint={t("stats.rfqsHint")}
        />
        <DashboardStatCard
          label={t("stats.points")}
          value={String(currentUser?.totalPoints ?? 0)}
          hint={t("stats.pointsHint")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-background p-8 text-center">
        <p className="text-sm font-semibold text-foreground">
          {t("recentOrders.title")}
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
          {t("recentOrders.empty")}
        </p>
      </div>

      {currentUser && (
        <UpdateProfileModal
          user={currentUser}
          open={profileModalOpen}
          onOpenChange={setProfileModalOpen}
        />
      )}
    </div>
  );
};

export default DashboardOverview;
