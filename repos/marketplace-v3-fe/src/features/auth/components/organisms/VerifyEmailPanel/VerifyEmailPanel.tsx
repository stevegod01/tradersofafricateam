"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

import MailSentSketch from "@/features/auth/components/atoms/MailSentSketch/MailSentSketch";
import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";
import AuthErrorText from "@/features/auth/components/atoms/AuthErrorText/AuthErrorText";
import OtpInput from "@/features/auth/components/molecules/OtpInput/OtpInput";
import { useVerifyEmail } from "@/features/auth/hooks/useVerifyEmail";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const VerifyEmailPanel = ({
  initialEmail = "",
  initialToken = "",
}: {
  initialEmail?: string;
  initialToken?: string;
}) => {
  const t = useTranslations("Auth.verifyEmail");
  const { routes } = useGetAllRoutes();
  const email = initialEmail.trim();

  const {
    otp,
    otpError,
    handleOtpChange,
    handleSubmit,
    handleResend,
    isVerifying,
    isResending,
    canResend,
    resendTimer,
    expiryTimer,
  } = useVerifyEmail({ email, token: initialToken.trim() });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex size-24 items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute size-16 rounded-full bg-(--orange-light)"
          />
          <MailSentSketch className="relative size-20 text-(--orange)" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t("sentTo")}{" "}
          <span className="font-semibold text-foreground">
            {email || t("emailUnavailable")}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <OtpInput
          value={otp}
          onChange={handleOtpChange}
          invalid={Boolean(otpError)}
          label={t("otpLabel")}
        />
        <AuthErrorText>{otpError}</AuthErrorText>

        <div className="flex items-center justify-between rounded-xl bg-muted/70 px-4 py-3 text-xs">
          <span className="text-muted-foreground">{t("timerLabel")}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {expiryTimer}
          </span>
        </div>

        <AuthSubmitButton loading={isVerifying}>
          {isVerifying ? t("verifying") : t("verify")}
        </AuthSubmitButton>

        <button
          type="button"
          onClick={handleResend}
          disabled={!canResend || isResending}
          className="h-12 w-full rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        >
          {isResending
            ? t("resending")
            : canResend
              ? t("resend")
              : t("resendIn", { timer: resendTimer })}
        </button>

        <Link
          href={routes.register}
          className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-(--orange)"
        >
          <ArrowLeft size={15} />
          {t("changeEmail")}
        </Link>
      </form>
    </motion.div>
  );
};

export default VerifyEmailPanel;
