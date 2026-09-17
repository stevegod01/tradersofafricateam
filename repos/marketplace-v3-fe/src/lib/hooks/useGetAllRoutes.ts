"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

export const useGetAllRoutes = () => {
  const locale = useLocale();

  const routes = useMemo(() => ({
    home: `/${locale}`,
    ourImpact: `/${locale}/our-impact`,
    whatWeDo: `/${locale}/what-we-do`,
    ourStory: `/${locale}/our-story`,
    faq: `/${locale}/faq`,
    contact: `/${locale}/contact`,
    support: `/${locale}/support`,
    rfq: `/${locale}/rfq`,
    cart: `/${locale}/cart`,
    categories: `/${locale}/categories`,
    categoryInfo: (id: string) =>
      `/${locale}/products?category=${encodeURIComponent(id)}`,
    login: `/${locale}/login`,
    register: `/${locale}/register`,
    verifyEmail: `/${locale}/verify-email`,
    forgotPassword: `/${locale}/forgot-password`,
    resetPassword: `/${locale}/reset-password`,
    dashboard: `/${locale}/dashboard`,
    overview: `/${locale}/dashboard/overview`,
    messages: `/${locale}/dashboard/messages`,
    notifications: `/${locale}/dashboard/notifications`,
    savedProducts: `/${locale}/dashboard/saved-products`,
    reviews: `/${locale}/dashboard/reviews`,
    disputes: `/${locale}/dashboard/disputes`,
    returnsRefunds: `/${locale}/dashboard/returns-refunds`,
    referrals: `/${locale}/dashboard/referrals`,
    profileSettings: `/${locale}/dashboard/settings`,
    products: `/${locale}/products`,
    product: `/${locale}/products`,
    productCollection: (collection: string) =>
      `/${locale}/products?collection=${encodeURIComponent(collection)}`,
    productInfo: (slug: string) => `/${locale}/products/info/${slug}`,
    sellerStore: (slug: string) => `/${locale}/sellers/${slug}`,
    orders: `/${locale}/dashboard/orders`,
    orderInfo: (id: string) => `/${locale}/dashboard/orders/info/${id}`,
    sellerProduct: `/${locale}/dashboard/products`,
    sellerProductInfo: (id: string) =>
      `/${locale}/dashboard/products/info/${id}`,

    quotes: `/${locale}/dashboard/quotes`,
    quoteInfo: (id: string) => `/${locale}/dashboard/quotes/info/${id}`,
    settings: `/${locale}/dashboard/settings`,
    becomeSeller: `/${locale}/become-seller`,
  }), [locale]);

  return { routes };
};
