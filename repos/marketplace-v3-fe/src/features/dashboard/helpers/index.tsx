import { SellerUpgradeFormErrors, SellerUpgradeFormState } from "../types";
import type { AuthUser } from "@/features/auth/types";
import type {
  UpdateProfileFormErrors,
  UpdateProfileFormState,
} from "../types";

export const validateSellerUpgradeForm = (
  values: SellerUpgradeFormState,
): SellerUpgradeFormErrors => {
  const errors: SellerUpgradeFormErrors = {};

  if (!values.storeName.trim()) {
    errors.storeName = "Store name is required";
  }

  if (!values.businessCategory.trim()) {
    errors.businessCategory = "Business category is required";
  }

  if (!values.phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required";
  }

  if (!values.country.trim()) {
    errors.country = "Country is required";
  }

  return errors;
};

export const validateUpdateProfileForm = (
  values: UpdateProfileFormState,
): UpdateProfileFormErrors => {
  const errors: UpdateProfileFormErrors = {};

  if (!values.firstName.trim()) errors.firstName = "First name is required";
  if (!values.lastName.trim()) errors.lastName = "Last name is required";
  if (!/^\+?[1-9]\d{7,14}$/.test(values.phoneNumber.replace(/\s/g, ""))) {
    errors.phoneNumber = "Enter a valid phone number";
  }
  if (!values.selectedLanguage) errors.selectedLanguage = "Select a language";
  if (!values.deliveryAddress.trim()) {
    errors.deliveryAddress = "Delivery address is required";
  }

  return errors;
};

export const isUserProfileIncomplete = (user: AuthUser) => {
  if (typeof user.isProfileUpdated === "boolean") {
    return !user.isProfileUpdated;
  }
  if (typeof user.isProfileComplete === "boolean") {
    return !user.isProfileComplete;
  }

  return ![
    user.firstName,
    user.lastName,
    user.phoneNumber,
    user.selectedLanguage,
    user.deliveryAddress,
  ].every((value) => value?.trim());
};
