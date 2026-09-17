"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import DashboardTextField from "@/features/dashboard/components/atoms/DashboardTextField/DashboardTextField";
import { useSellerUpgradeForm } from "@/features/dashboard/hooks/useSellerUpgradeForm";
import { useSellerUpgrade } from "@/features/dashboard/hooks/useSellerUpgrade";

const BecomeSellerModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useTranslations("Dashboard.becomeSellerModal");

  const { submit, isSubmitting } = useSellerUpgrade({
    onSuccess: () => {
      onOpenChange(false);
      reset();
    },
  });

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
  } = useSellerUpgradeForm(submit);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-7">
          <Dialog.Title className="heading-font text-lg font-bold text-foreground">
            {t("title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            {t("description")}
          </Dialog.Description>

          <form
            onSubmit={handleSubmit}
            className="mt-6 flex flex-col gap-4"
            noValidate
          >
            <DashboardTextField
              id="storeName"
              name="storeName"
              label={t("storeName")}
              placeholder={t("storeNamePlaceholder")}
              value={values.storeName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.storeName ? errors.storeName : undefined}
            />
            <DashboardTextField
              id="businessCategory"
              name="businessCategory"
              label={t("businessCategory")}
              placeholder={t("businessCategoryPlaceholder")}
              value={values.businessCategory}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.businessCategory ? errors.businessCategory : undefined}
            />
            <DashboardTextField
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              label={t("phoneNumber")}
              placeholder={t("phoneNumberPlaceholder")}
              value={values.phoneNumber}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.phoneNumber ? errors.phoneNumber : undefined}
            />
            <DashboardTextField
              id="country"
              name="country"
              label={t("country")}
              placeholder={t("countryPlaceholder")}
              value={values.country}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.country ? errors.country : undefined}
            />

            <div className="mt-2 flex gap-3">
              <Dialog.Close className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                {t("cancel")}
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 flex-1 rounded-xl bg-(--orange) text-sm font-semibold text-white transition-colors duration-200 hover:bg-(--orange-dark) disabled:pointer-events-none disabled:opacity-60"
              >
                {isSubmitting ? t("submitting") : t("submit")}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default BecomeSellerModal;
