"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { login } from "../api";
import { LoginFormState } from "../types";
import { setAuthToken } from "../helpers/session";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useLogin = ({ returnUrl }: { returnUrl?: string } = {}) => {
  const t = useTranslations("Auth.login");
  const router = useRouter();
  const { routes } = useGetAllRoutes();

  const { mutate, isPending: isSubmitting } = useMutation({
    mutationFn: (values: LoginFormState) =>
      login({ email: values.email.trim(), password: values.password }),
    onSuccess: (data, variables) => {
      if (data.requiresEmailVerification) {
        toast.info(t("verificationRequired"));
        const query = new URLSearchParams({
          token: data.token,
          email: variables.email.trim(),
        });
        router.push(`${routes.verifyEmail}?${query.toString()}`);
        return;
      }

      setAuthToken(data.token, variables.rememberMe);
      toast.success(t("success"));
      router.push(returnUrl || routes.dashboard);
    },
    onError: (error) => promiseErrorFunction(error, t("loginError")),
  });

  const submit = (values: LoginFormState) => mutate(values);

  return { submit, isSubmitting };
};
