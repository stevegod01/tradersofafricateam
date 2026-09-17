"use client";

import Link from "next/link";
import { Toaster } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import Logo from "@/components/atoms/Logo/Logo";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const AuthLayout = ({
  children,
  showcase,
}: {
  children: React.ReactNode;
  showcase: React.ReactNode;
}) => {
  const { routes } = useGetAllRoutes();
  const t = useTranslations("Auth.signUp");

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      <Toaster position="top-center" richColors closeButton />

      <div className="flex w-full flex-col lg:w-[52%] xl:w-[46%]">
        <div className="flex items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
          <Logo />
          <Link
            href={routes.home}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-(--orange)"
          >
            <ArrowLeft size={15} />
            {t("backHome")}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-10 lg:px-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>

      <div className="hidden lg:block lg:w-[48%] xl:w-[54%] lg:p-3">
        <div className="h-full w-full overflow-hidden rounded-3xl">
          {showcase}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
