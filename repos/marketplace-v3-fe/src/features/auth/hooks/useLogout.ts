"use client";

import { useMutation } from "@tanstack/react-query";

import {
  logout as logoutRequest,
  logoutAllDevices as logoutAllDevicesRequest,
} from "../api";
import { clearAuthToken } from "../helpers/session";
import { useStore } from "@/store/authStore";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

export const useLogout = () => {
  const { routes } = useGetAllRoutes();
  const setIsLoggingOut = useStore((state) => state.setIsLoggingOut);

  const finishLogout = () => {
    clearAuthToken();

    // A hard navigation here (rather than router.push) is deliberate: it
    // guarantees every in-memory bit of client state - the zustand auth
    // store, the React Query cache, any mounted protected-route guard -
    // is torn down atomically with the page itself, so there is no
    // window left for a stale guard effect to race this redirect and
    // send the user somewhere it didn't intend (which is exactly what

    window.location.href = routes.home;
  };

  const { mutate: logout, isPending: isLoggingOutCurrent } = useMutation({
    mutationFn: logoutRequest,
    onMutate: () => setIsLoggingOut(true),
    onSettled: finishLogout,
  });

  const { mutate: logoutAllDevices, isPending: isLoggingOutAll } = useMutation({
    mutationFn: logoutAllDevicesRequest,
    onMutate: () => setIsLoggingOut(true),
    onSettled: finishLogout,
  });

  return {
    logout,
    logoutAllDevices,
    isProcessing: isLoggingOutCurrent || isLoggingOutAll,
  };
};

/** Opens the shared logout confirmation dialog. Safe to call from anywhere. */
export const useRequestLogout = () => {
  const openLogoutConfirm = useStore((state) => state.openLogoutConfirm);
  return { requestLogout: openLogoutConfirm };
};
