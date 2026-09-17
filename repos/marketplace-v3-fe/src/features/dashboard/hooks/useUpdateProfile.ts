"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { updateUserProfile } from "../api";
import type { UpdateProfilePayload } from "../types";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useStore } from "@/store/authStore";

export const useUpdateProfile = ({
  onSuccess,
}: {
  onSuccess?: () => void;
} = {}) => {
  const t = useTranslations("Dashboard.profileModal");
  const queryClient = useQueryClient();
  const currentUser = useStore((state) => state.currentUser);
  const setCurrentUser = useStore((state) => state.setCurrentUser);

  const mutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: (responseUser, values) => {
      if (currentUser) {
        const nextUser = {
          ...currentUser,
          ...values,
          ...responseUser,
          isProfileUpdated: true,
          isProfileComplete: true,
        };
        setCurrentUser(nextUser);
        queryClient.setQueryData(["currentUser"], nextUser);
      }
      toast.success(t("success"));
      onSuccess?.();
    },
    onError: (error) => promiseErrorFunction(error, t("submitError")),
  });

  const submit = (values: UpdateProfilePayload) =>
    mutation.mutate({
      ...values,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phoneNumber: values.phoneNumber.replace(/\s/g, ""),
      deliveryAddress: values.deliveryAddress.trim(),
      ...(values.companyBio?.trim()
        ? { companyBio: values.companyBio.trim() }
        : { companyBio: undefined }),
    });

  return { submit, isSubmitting: mutation.isPending };
};
