"use client";

import { useMemo } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useLocale, useTranslations } from "next-intl";

import DashboardSelectField from "@/features/dashboard/components/atoms/DashboardSelectField/DashboardSelectField";
import DashboardTextareaField from "@/features/dashboard/components/atoms/DashboardTextareaField/DashboardTextareaField";
import DashboardTextField from "@/features/dashboard/components/atoms/DashboardTextField/DashboardTextField";
import { useUpdateProfile } from "@/features/dashboard/hooks/useUpdateProfile";
import { useUpdateProfileForm } from "@/features/dashboard/hooks/useUpdateProfileForm";
import type { AuthUser } from "@/features/auth/types";
import { routing } from "@/i18n/routing";

const UpdateProfileModal = ({
  user,
  open,
  onOpenChange,
}: {
  user: AuthUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useTranslations("Dashboard.profileModal");
  const locale = useLocale();
  const languageOptions = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "language" });
    return [
      { value: "", label: t("languagePlaceholder") },
      ...routing.locales.map((value) => ({
        value,
        label: names.of(value) ?? value.toUpperCase(),
      })),
    ];
  }, [locale, t]);

  const { submit, isSubmitting } = useUpdateProfile({
    onSuccess: () => onOpenChange(false),
  });
  const { values, errors, touched, handleChange, handleBlur, handleSubmit, reset } =
    useUpdateProfileForm(user, submit);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-7">
          <Dialog.Title className="heading-font text-lg font-bold text-foreground">
            {t("title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            {t("description")}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <DashboardTextField id="firstName" name="firstName" label={t("firstName")} placeholder={t("firstNamePlaceholder")} value={values.firstName} onChange={handleChange} onBlur={handleBlur} error={touched.firstName ? errors.firstName : undefined} />
              <DashboardTextField id="lastName" name="lastName" label={t("lastName")} placeholder={t("lastNamePlaceholder")} value={values.lastName} onChange={handleChange} onBlur={handleBlur} error={touched.lastName ? errors.lastName : undefined} />
            </div>
            <DashboardTextField id="phoneNumber" name="phoneNumber" type="tel" label={t("phoneNumber")} placeholder={t("phoneNumberPlaceholder")} value={values.phoneNumber} onChange={handleChange} onBlur={handleBlur} error={touched.phoneNumber ? errors.phoneNumber : undefined} />
            <DashboardSelectField id="selectedLanguage" name="selectedLanguage" label={t("language")} options={languageOptions} value={values.selectedLanguage} onChange={handleChange} onBlur={handleBlur} error={touched.selectedLanguage ? errors.selectedLanguage : undefined} />
            <DashboardTextField id="deliveryAddress" name="deliveryAddress" label={t("deliveryAddress")} placeholder={t("deliveryAddressPlaceholder")} value={values.deliveryAddress} onChange={handleChange} onBlur={handleBlur} error={touched.deliveryAddress ? errors.deliveryAddress : undefined} />
            <DashboardTextareaField id="companyBio" name="companyBio" label={t("companyBio")} placeholder={t("companyBioPlaceholder")} value={values.companyBio} onChange={handleChange} onBlur={handleBlur} />

            <div className="mt-2 flex gap-3">
              <Dialog.Close disabled={isSubmitting} className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60">
                {t("cancel")}
              </Dialog.Close>
              <button type="submit" disabled={isSubmitting} className="h-11 flex-1 rounded-xl bg-(--orange) text-sm font-semibold text-white transition-colors hover:bg-(--orange-dark) disabled:pointer-events-none disabled:opacity-60">
                {isSubmitting ? t("submitting") : t("submit")}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default UpdateProfileModal;
