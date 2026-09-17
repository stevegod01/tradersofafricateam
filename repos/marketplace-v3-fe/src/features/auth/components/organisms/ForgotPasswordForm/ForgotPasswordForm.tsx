"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Mail } from "lucide-react";

import AuthFormMotion from "@/features/auth/components/atoms/AuthFormMotion/AuthFormMotion";
import AuthFormField from "@/features/auth/components/molecules/AuthFormField/AuthFormField";
import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";

import { useForgotPasswordForm } from "@/features/auth/hooks/useForgotPasswordForm";
import { useForgotPassword } from "@/features/auth/hooks/useForgotPassword";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const ForgotPasswordForm = () => {
  const t = useTranslations("Auth.forgotPassword");
  const { routes } = useGetAllRoutes();

  const { submit, isSubmitting } = useForgotPassword();
  const { values, errors, touched, handleChange, handleBlur, handleSubmit } =
    useForgotPasswordForm(submit);

  return (
    <AuthFormMotion
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <AuthFormField
        id="email"
        name="email"
        type="email"
        label={t("emailLabel")}
        placeholder={t("emailPlaceholder")}
        icon={<Mail size={16} />}
        value={values.email}
        onChange={handleChange}
        onBlur={handleBlur}
        error={touched.email ? errors.email : undefined}
        autoComplete="email"
      />

      <AuthSubmitButton loading={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </AuthSubmitButton>

      <Link
        href={routes.login}
        className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-(--orange)"
      >
        <ArrowLeft size={15} />
        {t("backToLogin")}
      </Link>
    </AuthFormMotion>
  );
};

export default ForgotPasswordForm;
