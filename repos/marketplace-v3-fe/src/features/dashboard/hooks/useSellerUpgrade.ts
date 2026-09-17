"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { submitSellerUpgrade } from "../api";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useStore } from "@/store/authStore";

export const useSellerUpgrade = ({ onSuccess }: { onSuccess?: () => void } = {}) => {
  const t = useTranslations("Dashboard.becomeSellerModal");
  const currentUser = useStore((state) => state.currentUser);
  const setCurrentUser = useStore((state) => state.setCurrentUser);

  const { mutate: submit, isPending: isSubmitting } = useMutation({
    mutationFn: submitSellerUpgrade,
    onSuccess: () => {
      toast.success(t("success"));
      if (currentUser) {
        setCurrentUser({ ...currentUser, sellerVerificationStatus: "pending" });
      }
      onSuccess?.();
    },
    onError: (error) => promiseErrorFunction(error, t("submitError")),
  });

  return { submit, isSubmitting };
};
