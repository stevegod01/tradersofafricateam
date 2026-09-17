import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import AuthLayout from "@/features/auth/components/templates/AuthLayout/AuthLayout";
import AuthHeading from "@/features/auth/components/molecules/AuthHeading/AuthHeading";
import SignUpForm from "@/features/auth/components/organisms/SignUpForm/SignUpForm";
import TradeShowcase from "@/features/auth/components/organisms/TradeShowcase/TradeShowcase";

export const metadata: Metadata = {
  title: "Create Your Account",
  description:
    "Join Traders of Africa — the B2B and B2C marketplace connecting African suppliers to businesses and everyday buyers.",
};

type RegisterPageProps = {
  searchParams: Promise<{
    referral?: string | string[];
    referralCode?: string | string[];
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const t = await getTranslations("Auth.signUp");
  const query = await searchParams;
  const referralParam = query.referralCode ?? query.referral;
  const referralCode = Array.isArray(referralParam)
    ? referralParam[0]
    : referralParam;

  return (
    <AuthLayout
      showcase={
        <TradeShowcase
          badge={t("badge")}
          title={t("showcase.title")}
          subtitle={t("showcase.subtitle")}
        />
      }
    >
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />
      <SignUpForm initialReferralCode={referralCode?.trim()} />
    </AuthLayout>
  );
}
