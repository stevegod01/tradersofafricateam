import { axiosInstance } from "@/lib/axiosInstance";
import type { AuthUser } from "@/features/auth/types";
import {
  BuyerAnalyticsDateRange,
  BuyerAnalyticsOverview,
  SellerUpgradePayload,
  UpdateProfilePayload,
} from "../types";

export const submitSellerUpgrade = async (payload: SellerUpgradePayload) => {
  try {
    const url = "/users/seller-upgrade";
    const { data } = await axiosInstance.post(url, payload);
    return data?.data ?? data;
  } catch (error) {
    throw error;
  }
};

export const updateUserProfile = async (payload: UpdateProfilePayload) => {
  try {
    const url = "/users/profile";
    const { data } = await axiosInstance.patch<
      AuthUser | { data: AuthUser }
    >(url, payload);
    return "data" in data ? data.data : data;
  } catch (error) {
    throw error;
  }
};

export const getBuyerAnalyticsOverview = async (
  params: BuyerAnalyticsDateRange,
) => {
  const { data } = await axiosInstance.get<
    BuyerAnalyticsOverview | { data: BuyerAnalyticsOverview }
  >("/buyer/analytics/overview", { params });

  return "data" in data ? data.data : data;
};
