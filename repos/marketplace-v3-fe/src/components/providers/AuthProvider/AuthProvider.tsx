"use client";

import dynamic from "next/dynamic";

import { useGetCurrentUser } from "@/features/auth/hooks/useGetCurrentUser";

const LogoutConfirmDialog = dynamic(
  () =>
    import(
      "@/features/auth/components/organisms/LogoutConfirmDialog/LogoutConfirmDialog"
    ),
  { ssr: false },
);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  useGetCurrentUser();

  return (
    <>
      {children}
      <LogoutConfirmDialog />
    </>
  );
};

export default AuthProvider;
