import { useTranslations } from "next-intl";

import { useGetAllRoutes } from "./useGetAllRoutes";
import { useRequestLogout } from "@/features/auth/hooks/useLogout";

export const useAccountLinks = () => {
  const t = useTranslations("Nav");
  const { routes } = useGetAllRoutes();
  const { requestLogout } = useRequestLogout();

  const authLinks = [
    { label: t("login"), href: routes?.login },
    { label: t("join"), href: routes?.register },
  ];

  const dashboardLinks = [
    { label: t("dashboard"), href: routes?.dashboard },
    { label: t("orders"), href: routes?.orders },
    { label: t("settings"), href: routes?.profileSettings },
    { label: t("logout"), onClick: requestLogout, tone: "destructive" as const },
  ];

  return { authLinks, dashboardLinks };
};
