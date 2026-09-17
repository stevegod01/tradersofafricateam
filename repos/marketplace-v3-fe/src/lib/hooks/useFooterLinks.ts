import { useTranslations } from "next-intl";
import { useGetAllRoutes } from "./useGetAllRoutes";

export const useFooterLinks = () => {
  const t = useTranslations("Nav");
  const { routes } = useGetAllRoutes();

  const footerItems = [
    {
      title: t("about.label"),
      subItems: [
        { label: t("about.ourStory"), href: routes?.ourStory },
        { label: t("about.whatWeDo"), href: routes?.whatWeDo },
        { label: t("about.ourImpact"), href: routes?.ourImpact },
      ],
    },
    {
      title: t("needHelp.label"),
      subItems: [
        { label: t("needHelp.contactUs"), href: routes?.contact },
        { label: t("needHelp.faq"), href: routes?.faq },
        { label: t("needHelp.support"), href: routes?.support },
      ],
    },
    {
      title: t("buyer.label"),
      subItems: [
        { label: t("buyer.buyComm"), href: routes?.product },
        { label: t("buyer.productInquiry"), href: routes?.rfq },
        { label: t("buyer.goodInStock"), href: routes?.product },
      ],
    },
    {
      title: t("seller.label"),
      subItems: [
        { label: t("seller.marketplace"), href: routes?.product },
        { label: t("seller.howToTrade"), href: routes?.becomeSeller },
        { label: t("seller.searchRFQ"), href: routes?.rfq },
      ],
    },
  ];

  return { footerItems };
};
