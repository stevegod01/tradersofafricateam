"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { resetPassword } from "../api";
import { ResetPasswordFormState } from "../types";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useResetPassword = () => {
  const t = useTranslations("Auth.resetPassword");
  const router = useRouter();
  const { routes } = useGetAllRoutes();

  const { mutate, isPending: isSubmitting } = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      toast.success(t("success"));
      router.push(routes.login);
    },
    onError: (error) => promiseErrorFunction(error, t("submitError")),
  });

  const submit = (values: ResetPasswordFormState) => mutate(values);

  return { submit, isSubmitting };
};
