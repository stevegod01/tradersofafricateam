"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import AuthFormMotion from "@/features/auth/components/atoms/AuthFormMotion/AuthFormMotion";
import OtpInput from "@/features/auth/components/molecules/OtpInput/OtpInput";
import AuthErrorText from "@/features/auth/components/atoms/AuthErrorText/AuthErrorText";
import PasswordField from "@/features/auth/components/molecules/PasswordField/PasswordField";
import PasswordStrengthChecklist from "@/features/auth/components/molecules/PasswordStrengthChecklist/PasswordStrengthChecklist";
import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";

import { useResetPasswordForm } from "@/features/auth/hooks/useResetPasswordForm";
import { useResetPassword } from "@/features/auth/hooks/useResetPassword";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const ResetPasswordForm = ({ initialEmail = "" }: { initialEmail?: string }) => {
  const t = useTranslations("Auth.resetPassword");
  const { routes } = useGetAllRoutes();
  const email = initialEmail.trim();

  const { submit, isSubmitting } = useResetPassword();
  const {
    values,
    errors,
    touched,
    handlePasswordChange,
    handlePasswordBlur,
    handleOtpChange,
    handleSubmit,
  } = useResetPasswordForm(submit);

  return (
    <AuthFormMotion
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      noValidate
    >
      {email && (
        <p className="text-sm text-muted-foreground">
          {t("sentTo")}{" "}
          <span className="font-semibold text-foreground">{email}</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <OtpInput
          value={values.otp}
          onChange={handleOtpChange}
          invalid={Boolean(touched.otp && errors.otp)}
          label={t("otpLabel")}
        />
        <AuthErrorText>{touched.otp ? errors.otp : undefined}</AuthErrorText>
      </div>

      <div className="flex flex-col gap-1">
        <PasswordField
          id="password"
          name="password"
          label={t("passwordLabel")}
          placeholder={t("passwordPlaceholder")}
          value={values.password}
          onChange={handlePasswordChange}
          onBlur={handlePasswordBlur}
          error={touched.password ? errors.password : undefined}
          autoComplete="new-password"
        />
        <PasswordStrengthChecklist
          password={values.password}
          visible={values.password.length > 0}
        />
      </div>

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

export default ResetPasswordForm;
