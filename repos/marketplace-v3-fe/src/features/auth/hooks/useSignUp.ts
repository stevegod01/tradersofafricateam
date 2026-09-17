"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { signUp } from "../api";
import { SignUpFormState } from "../types";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useSignUp = () => {
  const router = useRouter();
  const { routes } = useGetAllRoutes();

  const { mutate, isPending: isSubmitting } = useMutation({
    mutationFn: signUp,
    onSuccess: (data) => {
      toast.success("Account created!", {
        description: "We've sent a verification code to your email.",
      });

      const query = new URLSearchParams({
        token: data.token,
        email: data.user.email,
      });
      router.push(`${routes.verifyEmail}?${query.toString()}`);
    },
    onError: (error) =>
      promiseErrorFunction(error, "We couldn't create your account. Please try again."),
  });

  const submit = (values: SignUpFormState) => {
    mutate({
      email: values.email,
      password: values.password,
      termsOfUse: values.termsOfUse,
      ...(values.referralCode.trim()
        ? { referralCode: values.referralCode.trim() }
        : {}),
    });
  };

  return { submit, isSubmitting };
};
