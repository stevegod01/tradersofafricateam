"use client";

import Link from "next/link";

import { useFooterLinks } from "@/lib/hooks/useFooterLinks";
import { useTranslations } from "next-intl";

import AppBtn from "@/components/atoms/AppBtn/AppBtn";

const FooterUpper = () => {
  const { footerItems } = useFooterLinks();
  const t = useTranslations("HomePage");

  return (
    <div className="flex flex-wrap justify-between gap-10 text-background">
      {footerItems?.map((caption) => (
        <div className="space-y-4" key={caption?.title}>
          <h4 className="sm:text-xl text-lg font-semibold">{caption?.title}</h4>
          <ul className="space-y-2">
            {caption?.subItems?.map((link) => (
              <li key={link?.label}>
                <Link
                  href={link?.href}
                  className="max-sm:text-sm hover:text-(--orange) transition-all duration-300 ease-out cursor-pointer"
                >
                  {link?.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="space-y-4">
        <h4 className="sm:text-xl text-lg font-semibold">{t("ourApp")}</h4>
        <div className="space-y-2 flex flex-col gap-1">
          <AppBtn
            url="#"
            imgUrl="/assets/images/appstore.svg"
            alt="Download from appstore"
          />
          <AppBtn
            url="#"
            imgUrl="/assets/images/playstore.svg"
            alt="Download from play store"
          />
        </div>
      </div>
    </div>
  );
};

export default FooterUpper;
