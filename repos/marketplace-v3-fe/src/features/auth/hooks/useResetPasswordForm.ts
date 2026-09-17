"use client";

import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import { ResetPasswordFormErrors, ResetPasswordFormState } from "../types";
import { validateResetPasswordForm } from "../helpers";

const initialValues: ResetPasswordFormState = { otp: "", password: "" };

export const useResetPasswordForm = (
  onValid: (values: ResetPasswordFormState) => void,
) => {
  const [values, setValues] = useState<ResetPasswordFormState>(initialValues);
  const [errors, setErrors] = useState<ResetPasswordFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof ResetPasswordFormState, boolean>>
  >({});

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, password: e.target.value }));
  }, []);

  const handlePasswordBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, password: true }));
  }, []);

  const handleOtpChange = useCallback((otp: string) => {
    setValues((prev) => ({ ...prev, otp }));
    setErrors((prev) => ({ ...prev, otp: undefined }));
  }, []);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateResetPasswordForm(values);
    setErrors(validationErrors);
    setTouched({ otp: true, password: true });

    if (Object.keys(validationErrors).length === 0) {
      onValid(values);
    }
  };

  return {
    values,
    errors,
    touched,
    handlePasswordChange,
    handlePasswordBlur,
    handleOtpChange,
    handleSubmit,
  };
};
