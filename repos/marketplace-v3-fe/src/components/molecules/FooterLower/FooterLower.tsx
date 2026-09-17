import Logo from "@/components/atoms/Logo/Logo";
import { useTranslations } from "next-intl";

const FooterLower = () => {
  const t = useTranslations("HomePage");

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <Logo />
      <p className="md:text-sm max-sm:text-xs text-background">
        ©2022 Traders of Africa. {t("allRightsReserved")}
      </p>
    </div>
  );
};

export default FooterLower;
