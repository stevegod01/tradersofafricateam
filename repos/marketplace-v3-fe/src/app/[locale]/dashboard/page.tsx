import type { Metadata } from "next";

import BuyerDashboardShell from "@/features/dashboard/components/templates/BuyerDashboardShell/BuyerDashboardShell";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your orders, RFQs, and account on Traders of Africa.",
};

export default function DashboardPage() {
  return <BuyerDashboardShell />;
}
