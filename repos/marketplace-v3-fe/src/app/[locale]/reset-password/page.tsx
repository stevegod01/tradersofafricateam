import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import AuthLayout from "@/features/auth/components/templates/AuthLayout/AuthLayout";
import AuthHeading from "@/features/auth/components/molecules/AuthHeading/AuthHeading";
import ResetPasswordForm from "@/features/auth/components/organisms/ResetPasswordForm/ResetPasswordForm";
import TradeShowcase from "@/features/auth/components/organisms/TradeShowcase/TradeShowcase";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Choose a new password for your Traders of Africa account.",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ email?: string | string[] }>;
};

const firstQueryValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const t = await getTranslations("Auth.resetPassword");
  const query = await searchParams;

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
      <ResetPasswordForm initialEmail={firstQueryValue(query.email)?.trim()} />
    </AuthLayout>
  );
}
