"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { googleAuth, updateTerms } from "../api";
import { setAuthToken } from "../helpers/session";
import { promiseErrorFunction } from "@/lib/helpers/promiseError";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useGoogleAuth = ({ returnUrl }: { returnUrl?: string } = {}) => {
  const router = useRouter();
  const { routes } = useGetAllRoutes();
  const destination = returnUrl || routes.dashboard;

  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const { mutate: authenticate, isPending: isAuthenticating } = useMutation({
    mutationFn: googleAuth,
    onSuccess: (data) => {
      setAuthToken(data.token);

      if (!data.user.termsOfUse) {
        setPendingUserId(data.user.id);
        return;
      }

      router.push(destination);
    },
    onError: (error) =>
      promiseErrorFunction(
        error,
        "Couldn't continue with Google. Please try again.",
      ),
  });

  const { mutate: acceptTerms, isPending: isAcceptingTerms } = useMutation({
    mutationFn: updateTerms,
    onSuccess: () => {
      setPendingUserId(null);
      router.push(destination);
    },
    onError: (error) =>
      promiseErrorFunction(
        error,
        "Couldn't save your acceptance. Please try again.",
      ),
  });

  const handleCredential = (googleToken: string) => authenticate({ googleToken });

  const handleAcceptTerms = () => {
    if (pendingUserId) acceptTerms({ userId: pendingUserId, termsOfUse: true });
  };

  const handleDeclineTerms = () => setPendingUserId(null);

  return {
    handleCredential,
    isAuthenticating,
    showTermsModal: Boolean(pendingUserId),
    handleAcceptTerms,
    handleDeclineTerms,
    isAcceptingTerms,
  };
};
