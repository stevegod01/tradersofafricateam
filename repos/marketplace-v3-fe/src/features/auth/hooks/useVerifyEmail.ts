"use client";

import { type SubmitEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { resendOtp, verifyEmail } from "../api";
import { isEmailValid } from "../helpers";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const RESEND_DELAY_SECONDS = 60;
const OTP_EXPIRY_SECONDS = 10 * 60;

export const useVerifyEmail = ({
  email,
  token,
}: {
  email: string;
  token: string;
}) => {
  const t = useTranslations("Auth.verifyEmail");
  const router = useRouter();
  const { routes } = useGetAllRoutes();

  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string>();
  const [resendSecondsLeft, setResendSecondsLeft] = useState(
    RESEND_DELAY_SECONDS,
  );
  const [expirySecondsLeft, setExpirySecondsLeft] = useState(
    OTP_EXPIRY_SECONDS,
  );

  useEffect(() => {
    if (resendSecondsLeft <= 0 && expirySecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setResendSecondsLeft((seconds) => Math.max(0, seconds - 1));
      setExpirySecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSecondsLeft, expirySecondsLeft]);

  const { mutate: verify, isPending: isVerifying } = useMutation({
    mutationFn: verifyEmail,
    onSuccess: () => {
      toast.success(t("success"));
      router.push(routes.login);
    },
    onError: (error) => promiseErrorFunction(error, t("verifyError")),
  });

  const { mutate: resend, isPending: isResending } = useMutation({
    mutationFn: resendOtp,
    onSuccess: () => {
      setResendSecondsLeft(RESEND_DELAY_SECONDS);
      setExpirySecondsLeft(OTP_EXPIRY_SECONDS);
      toast.success(t("resendSuccess"));
    },
    onError: (error) => promiseErrorFunction(error, t("resendError")),
  });

  const handleOtpChange = (value: string) => {
    setOtp(value);
    setOtpError(undefined);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      toast.error(t("missingToken"));
      return;
    }

    if (otp.length !== 6) {
      setOtpError(t("invalidOtp"));
      return;
    }

    verify({ token, otp });
  };

  const handleResend = () => {
    if (!isEmailValid(email)) {
      toast.error(t("invalidEmail"));
      return;
    }
    resend({ email });
  };

  const formatTimer = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return {
    otp,
    otpError,
    handleOtpChange,
    handleSubmit,
    handleResend,
    isVerifying,
    isResending,
    canResend: resendSecondsLeft <= 0,
    resendTimer: formatTimer(resendSecondsLeft),
    expiryTimer: formatTimer(expirySecondsLeft),
  };
};
