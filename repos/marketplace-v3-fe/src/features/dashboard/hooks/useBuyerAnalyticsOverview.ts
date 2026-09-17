"use client";

import { useQuery } from "@tanstack/react-query";

import { getBuyerAnalyticsOverview } from "@/features/dashboard/api";
import type { BuyerAnalyticsDateRange } from "@/features/dashboard/types";

export const useBuyerAnalyticsOverview = (range: BuyerAnalyticsDateRange) =>
  useQuery({
    queryKey: ["buyerAnalyticsOverview", range.dateFrom, range.dateTo],
    queryFn: () => getBuyerAnalyticsOverview(range),
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
