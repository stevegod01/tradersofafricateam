"use client";

import Image from "next/image";

import { useTranslations } from "next-intl";

const WhatsappBtn = () => {
  const t = useTranslations("Nav");

  return (
    <a
      href="https://wa.me/+2349166417373"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-xs font-medium hover:text-(--orange) transition-colors group shrink-0"
    >
      <Image
        src="/assets/icons/whatsapp.png"
        alt="WhatsApp-icon"
        width={20}
        height={20}
        className="object-contain"
      />
      <span className="hidden sm:inline">{t("whatsapp")}</span>
    </a>
  );
};

export default WhatsappBtn;
