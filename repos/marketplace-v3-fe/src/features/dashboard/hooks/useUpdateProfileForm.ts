"use client";

import {
  ChangeEvent,
  SubmitEvent,
  useCallback,
  useState,
} from "react";

import type { AuthUser } from "@/features/auth/types";
import type {
  UpdateProfileFormErrors,
  UpdateProfileFormState,
} from "../types";
import { validateUpdateProfileForm } from "../helpers";

const valuesFromUser = (user: AuthUser): UpdateProfileFormState => ({
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  phoneNumber: user.phoneNumber ?? "",
  selectedLanguage: user.selectedLanguage ?? "",
  deliveryAddress: user.deliveryAddress ?? "",
  companyBio: user.companyBio ?? "",
});

export const useUpdateProfileForm = (
  user: AuthUser,
  onValid: (values: UpdateProfileFormState) => void,
) => {
  const [values, setValues] = useState<UpdateProfileFormState>(() =>
    valuesFromUser(user),
  );
  const [errors, setErrors] = useState<UpdateProfileFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof UpdateProfileFormState, boolean>>
  >({});

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = event.target;
      setValues((previous) => ({ ...previous, [name]: value }));
    },
    [],
  );

  const handleBlur = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setTouched((previous) => ({ ...previous, [event.target.name]: true }));
    },
    [],
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validateUpdateProfileForm(values);
    setErrors(validationErrors);
    setTouched({
      firstName: true,
      lastName: true,
      phoneNumber: true,
      selectedLanguage: true,
      deliveryAddress: true,
    });
    if (Object.keys(validationErrors).length === 0) onValid(values);
  };

  const reset = () => {
    setValues(valuesFromUser(user));
    setErrors({});
    setTouched({});
  };

  return { values, errors, touched, handleChange, handleBlur, handleSubmit, reset };
};
