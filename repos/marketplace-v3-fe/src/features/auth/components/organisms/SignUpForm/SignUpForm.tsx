"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

import AuthFormMotion from "@/features/auth/components/atoms/AuthFormMotion/AuthFormMotion";
import AuthFormField from "@/features/auth/components/molecules/AuthFormField/AuthFormField";
import PasswordField from "@/features/auth/components/molecules/PasswordField/PasswordField";
import PasswordStrengthChecklist from "@/features/auth/components/molecules/PasswordStrengthChecklist/PasswordStrengthChecklist";
import TermsCheckboxField from "@/features/auth/components/molecules/TermsCheckboxField/TermsCheckboxField";
import ReferralCodeField from "@/features/auth/components/molecules/ReferralCodeField/ReferralCodeField";
import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";
import AuthDivider from "@/features/auth/components/molecules/AuthDivider/AuthDivider";
import GoogleAuthButton from "@/features/auth/components/molecules/GoogleAuthButton/GoogleAuthButton";
import AuthFooterPrompt from "@/features/auth/components/molecules/AuthFooterPrompt/AuthFooterPrompt";

import { useSignUpForm } from "@/features/auth/hooks/useSignUpForm";
import { useSignUp } from "@/features/auth/hooks/useSignUp";
import { useGoogleAuth } from "@/features/auth/hooks/useGoogleAuth";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const TermsPromptModal = dynamic(
  () =>
    import(
      "@/features/auth/components/organisms/TermsPromptModal/TermsPromptModal"
    ),
  { ssr: false },
);

const SignUpForm = ({
  initialReferralCode,
}: {
  initialReferralCode?: string;
}) => {
  const t = useTranslations("Auth.signUp");
  const { routes } = useGetAllRoutes();

  const {
    handleCredential,
    isAuthenticating,
    showTermsModal,
    handleAcceptTerms,
    handleDeclineTerms,
    isAcceptingTerms,
  } = useGoogleAuth();
  const { submit, isSubmitting } = useSignUp();

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setTermsOfUse,
    handleSubmit,
  } = useSignUpForm(submit, initialReferralCode);

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

      <div className="flex flex-col gap-1">
        <PasswordField
          id="password"
          name="password"
          label={t("passwordLabel")}
          placeholder={t("passwordPlaceholder")}
          value={values.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={touched.password ? errors.password : undefined}
          autoComplete="new-password"
        />
        <PasswordStrengthChecklist
          password={values.password}
          visible={values.password.length > 0}
        />
      </div>

      <ReferralCodeField
        value={values.referralCode}
        onChange={handleChange}
        label={t("referralPlaceholder")}
        triggerLabel={t("referralTrigger")}
      />

      <TermsCheckboxField
        checked={values.termsOfUse}
        onCheckedChange={setTermsOfUse}
        error={touched.termsOfUse ? errors.termsOfUse : undefined}
      >
        {t("termsPrefix")}{" "}
        <span className="font-semibold text-foreground">{t("terms")}</span>{" "}
        {t("and")}{" "}
        <span className="font-semibold text-foreground">{t("privacy")}</span>
      </TermsCheckboxField>

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
        text={t("haveAccount")}
        actionText={t("login")}
        href={routes.login}
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

export default SignUpForm;
