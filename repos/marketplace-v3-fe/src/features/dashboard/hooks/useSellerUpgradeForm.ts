"use client";

import { type ChangeEvent, type SubmitEvent, useCallback, useState } from "react";

import { SellerUpgradeFormErrors, SellerUpgradeFormState } from "../types";
import { validateSellerUpgradeForm } from "../helpers";

const initialValues: SellerUpgradeFormState = {
  storeName: "",
  businessCategory: "",
  phoneNumber: "",
  country: "",
};

export const useSellerUpgradeForm = (
  onValid: (values: SellerUpgradeFormState) => void,
) => {
  const [values, setValues] = useState<SellerUpgradeFormState>(initialValues);
  const [errors, setErrors] = useState<SellerUpgradeFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof SellerUpgradeFormState, boolean>>
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

    const validationErrors = validateSellerUpgradeForm(values);
    setErrors(validationErrors);
    setTouched({
      storeName: true,
      businessCategory: true,
      phoneNumber: true,
      country: true,
    });

    if (Object.keys(validationErrors).length === 0) {
      onValid(values);
    }
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return { values, errors, touched, handleChange, handleBlur, handleSubmit, reset };
};
