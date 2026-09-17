"use client";

import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import { ForgotPasswordFormErrors, ForgotPasswordFormState } from "../types";
import { validateForgotPasswordForm } from "../helpers";

const initialValues: ForgotPasswordFormState = { email: "" };

export const useForgotPasswordForm = (
  onValid: (values: ForgotPasswordFormState) => void,
) => {
  const [values, setValues] = useState<ForgotPasswordFormState>(initialValues);
  const [errors, setErrors] = useState<ForgotPasswordFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof ForgotPasswordFormState, boolean>>
  >({});

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleBlur = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setTouched((prev) => ({ ...prev, [e.target.name]: true }));
  }, []);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateForgotPasswordForm(values);
    setErrors(validationErrors);
    setTouched({ email: true });

    if (Object.keys(validationErrors).length === 0) {
      onValid(values);
    }
  };

  return { values, errors, touched, handleChange, handleBlur, handleSubmit };
};
