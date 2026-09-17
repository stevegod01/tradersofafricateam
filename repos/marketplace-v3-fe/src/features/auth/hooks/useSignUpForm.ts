"use client";

import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import { SignUpFormErrors, SignUpFormState } from "../types";
import { validateSignUpForm } from "../helpers";

const initialValues: SignUpFormState = {
  email: "",
  password: "",
  referralCode: "",
  termsOfUse: false,
};

export const useSignUpForm = (
  onValid: (values: SignUpFormState) => void,
  initialReferralCode = "",
) => {
  const [values, setValues] = useState<SignUpFormState>(() => ({
    ...initialValues,
    referralCode: initialReferralCode,
  }));
  const [errors, setErrors] = useState<SignUpFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof SignUpFormState, boolean>>
  >({});

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);

  const handleBlur = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setTouched((prev) => ({ ...prev, [e.target.name]: true }));
  }, []);

  const setTermsOfUse = useCallback((checked: boolean) => {
    setValues((prev) => ({ ...prev, termsOfUse: checked }));
  }, []);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateSignUpForm(values);
    setErrors(validationErrors);
    setTouched({
      email: true,
      password: true,
      termsOfUse: true,
    });

    if (Object.keys(validationErrors).length === 0) {
      onValid(values);
    }
  };

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setTermsOfUse,
    handleSubmit,
  };
};
