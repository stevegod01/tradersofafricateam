import { useTranslations } from "next-intl";
import { useGetAllRoutes } from "./useGetAllRoutes";

export const useAboutUs = () => {
  const t = useTranslations("Nav");
  const { routes } = useGetAllRoutes();

  const aboutItems = [
    { label: t("about.ourStory"), href: routes?.ourStory },
    { label: t("about.whatWeDo"), href: routes?.whatWeDo },
    { label: t("about.ourImpact"), href: routes?.ourImpact },
  ];
  return { aboutItems };
};
