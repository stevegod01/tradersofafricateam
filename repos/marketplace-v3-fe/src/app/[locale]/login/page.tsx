import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import AuthLayout from "@/features/auth/components/templates/AuthLayout/AuthLayout";
import AuthHeading from "@/features/auth/components/molecules/AuthHeading/AuthHeading";
import LoginForm from "@/features/auth/components/organisms/LoginForm/LoginForm";
import TradeShowcase from "@/features/auth/components/organisms/TradeShowcase/TradeShowcase";

export const metadata: Metadata = {
  title: "Log In",
  description:
    "Log in to your Traders of Africa account to buy, sell, and trade across the continent.",
};

type LoginPageProps = {
  searchParams: Promise<{ returnUrl?: string | string[] }>;
};

const firstQueryValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations("Auth.login");
  const query = await searchParams;
  const returnUrl = firstQueryValue(query.returnUrl)?.trim();

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
      <LoginForm returnUrl={returnUrl} />
    </AuthLayout>
  );
}
