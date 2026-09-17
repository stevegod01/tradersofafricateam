import type { LucideIcon } from "lucide-react";

export type SellerUpgradePayload = {
  storeName: string;
  businessCategory: string;
  phoneNumber: string;
  country: string;
};

export type SellerUpgradeFormState = SellerUpgradePayload;

export type SellerUpgradeFormErrors = Partial<
  Record<keyof SellerUpgradeFormState, string>
>;

export type UpdateProfilePayload = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  selectedLanguage: string;
  deliveryAddress: string;
  companyBio?: string;
};

export type UpdateProfileFormState = UpdateProfilePayload & {
  companyBio: string;
};

export type UpdateProfileFormErrors = Partial<
  Record<keyof UpdateProfileFormState, string>
>;

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type DashboardNavSection = {
  label: string;
  items: DashboardNavItem[];
};

export type BuyerAnalyticsDateRange = {
  dateFrom: string;
  dateTo: string;
};

export type BuyerAnalyticsOverview = {
  totalOrders?: number;
  totalRfqs?: number;
  totalRFQs?: number;
  orders?: number;
  rfqs?: number;
};
