"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import AuthFormMotion from "@/features/auth/components/atoms/AuthFormMotion/AuthFormMotion";
import AuthFormField from "@/features/auth/components/molecules/AuthFormField/AuthFormField";
import PasswordField from "@/features/auth/components/molecules/PasswordField/PasswordField";
import RememberMeField from "@/features/auth/components/molecules/RememberMeField/RememberMeField";
import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";
import AuthDivider from "@/features/auth/components/molecules/AuthDivider/AuthDivider";
import GoogleAuthButton from "@/features/auth/components/molecules/GoogleAuthButton/GoogleAuthButton";
import AuthFooterPrompt from "@/features/auth/components/molecules/AuthFooterPrompt/AuthFooterPrompt";

import { useLoginForm } from "@/features/auth/hooks/useLoginForm";
import { useLogin } from "@/features/auth/hooks/useLogin";
import { useGoogleAuth } from "@/features/auth/hooks/useGoogleAuth";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const TermsPromptModal = dynamic(
  () =>
    import(
      "@/features/auth/components/organisms/TermsPromptModal/TermsPromptModal"
    ),
  { ssr: false },
);

const LoginForm = ({ returnUrl }: { returnUrl?: string }) => {
  const t = useTranslations("Auth.login");
  const { routes } = useGetAllRoutes();

  const { submit, isSubmitting } = useLogin({ returnUrl });
  const {
    handleCredential,
    isAuthenticating,
    showTermsModal,
    handleAcceptTerms,
    handleDeclineTerms,
    isAcceptingTerms,
  } = useGoogleAuth({ returnUrl });

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setRememberMe,
    handleSubmit,
  } = useLoginForm(submit);

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

      <PasswordField
        id="password"
        name="password"
        label={t("passwordLabel")}
        placeholder={t("passwordPlaceholder")}
        value={values.password}
        onChange={handleChange}
        onBlur={handleBlur}
        error={touched.password ? errors.password : undefined}
        autoComplete="current-password"
      />

      <div className="flex items-center justify-between">
        <RememberMeField
          checked={values.rememberMe}
          onCheckedChange={setRememberMe}
          label={t("rememberMe")}
        />
        <Link
          href={routes.forgotPassword}
          className="text-sm font-semibold text-(--orange) transition-colors hover:text-(--orange-dark) hover:underline"
        >
          {t("forgotPassword")}
        </Link>
      </div>

      <AuthSubmitButton loading={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </AuthSubmitButton>

      <AuthDivider label={t("orDivider")} />

      <GoogleAuthButton
        onCredential={handleCredential}
        loading={isAuthenticating}
        label={t("google")}
      />

      <AuthFooterPrompt
        text={t("noAccount")}
        actionText={t("register")}
        href={routes.register}
      />

      <TermsPromptModal
        open={showTermsModal}
        onAccept={handleAcceptTerms}
        onDecline={handleDeclineTerms}
        isPending={isAcceptingTerms}
      />
    </AuthFormMotion>
  );
};

export default LoginForm;
