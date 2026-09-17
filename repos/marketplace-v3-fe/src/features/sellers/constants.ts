import { Globe2, HandCoins, Store, Users } from "lucide-react";

export const sellerBenefits = [
  { key: "listStore", icon: Store },
  { key: "fastSales", icon: HandCoins },
  { key: "connectBuyers", icon: Users },
  { key: "payments", icon: Globe2 },
] as const;

export const sellerSteps = ["one", "two", "three", "four"] as const;

export const sellerPlans = [
  {
    key: "basic",
    features: ["quotas", "commission", "products", "pictures", "buyerAccess"],
  },
  {
    key: "premium",
    features: ["quotas", "commission", "products", "pictures", "buyerAccess"],
  },
] as const;
