"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { forgotPassword } from "../api";
import { ForgotPasswordFormState } from "../types";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useForgotPassword = () => {
  const t = useTranslations("Auth.forgotPassword");
  const router = useRouter();
  const { routes } = useGetAllRoutes();

  const { mutate, isPending: isSubmitting } = useMutation({
    mutationFn: forgotPassword,
    onSuccess: (_data, variables) => {
      toast.success(t("success"));
      const query = new URLSearchParams({ email: variables.email });
      router.push(`${routes.resetPassword}?${query.toString()}`);
    },
    onError: (error) => promiseErrorFunction(error, t("submitError")),
  });

  const submit = (values: ForgotPasswordFormState) => mutate(values);

  return { submit, isSubmitting };
};
