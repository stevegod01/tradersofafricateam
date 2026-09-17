import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import AuthLayout from "@/features/auth/components/templates/AuthLayout/AuthLayout";
import AuthHeading from "@/features/auth/components/molecules/AuthHeading/AuthHeading";
import ForgotPasswordForm from "@/features/auth/components/organisms/ForgotPasswordForm/ForgotPasswordForm";
import TradeShowcase from "@/features/auth/components/organisms/TradeShowcase/TradeShowcase";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset the password for your Traders of Africa account.",
};

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth.forgotPassword");

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
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
