"use client";

import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import { LoginFormErrors, LoginFormState } from "../types";
import { validateLoginForm } from "../helpers";

const initialValues: LoginFormState = {
  email: "",
  password: "",
  rememberMe: true,
};

export const useLoginForm = (onValid: (values: LoginFormState) => void) => {
  const [values, setValues] = useState<LoginFormState>(initialValues);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof LoginFormState, boolean>>
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

  const setRememberMe = useCallback((checked: boolean) => {
    setValues((prev) => ({ ...prev, rememberMe: checked }));
  }, []);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateLoginForm(values);
    setErrors(validationErrors);
    setTouched({ email: true, password: true });

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
    setRememberMe,
    handleSubmit,
  };
};
