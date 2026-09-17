"use client";

import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";

import Image from "next/image";
import Link from "next/link";

import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { useTranslations } from "next-intl";

const VisibilityCard = ({
  imgUrl,
  title,
  desc,
}: {
  imgUrl: string;
  title: string;
  desc: string;
}) => {
  const t = useTranslations("whatWeDo");
  const { routes } = useGetAllRoutes();

  return (
    <div className="w-full min-w-full space-y-6">
      <div className="w-full bg-muted/40 h-auto">
        <Image
          src={imgUrl}
          alt={title}
          width={700}
          height={600}
          className="w-full h-auto object-cover"
        />
      </div>
      <SectionTitle title={title} className="font-bold text-xl" />
      <p>{desc}</p>
      <Link
        href={routes?.product}
        className="flex items-center gap-2 text-(--orange) hover:underline font-medium"
      >
        {t("viewProducts")}{" "}
        <Image
          src="/assets/icons/chevron-right-org.svg"
          width={7}
          height={7}
          alt="chevron-right"
        />
      </Link>
    </div>
  );
};

export default VisibilityCard;
