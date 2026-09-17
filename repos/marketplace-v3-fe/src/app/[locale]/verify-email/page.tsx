import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import AuthHeading from "@/features/auth/components/molecules/AuthHeading/AuthHeading";
import VerifyEmailPanel from "@/features/auth/components/organisms/VerifyEmailPanel/VerifyEmailPanel";
import TradeShowcase from "@/features/auth/components/organisms/TradeShowcase/TradeShowcase";
import AuthLayout from "@/features/auth/components/templates/AuthLayout/AuthLayout";

export const metadata: Metadata = {
  title: "Verify Your Email",
  description: "Verify your email address to activate your TOFA account.",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    email?: string | string[];
    token?: string | string[];
  }>;
};

const firstQueryValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const t = await getTranslations("Auth.verifyEmail");
  const tShowcase = await getTranslations("Auth.signUp");
  const query = await searchParams;

  return (
    <AuthLayout
      showcase={
        <TradeShowcase
          badge={tShowcase("badge")}
          title={tShowcase("showcase.title")}
          subtitle={tShowcase("showcase.subtitle")}
        />
      }
    >
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />
      <VerifyEmailPanel
        initialEmail={firstQueryValue(query.email)?.trim()}
        initialToken={firstQueryValue(query.token)?.trim()}
      />
    </AuthLayout>
  );
}
