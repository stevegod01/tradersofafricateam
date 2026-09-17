"use client";

import Image from "next/image";
import Link from "next/link";

import { useTranslations } from "next-intl";

const MoreCollectionCard = ({
  title,
  imgUrl,
  href,
}: {
  title: string;
  imgUrl: string;
  href: string;
}) => {
  const t = useTranslations();

  return (
    <Link href={href}>
      <div className="relative h-67 min-w-52.75 w-52.75 bg-muted/70 rounded-[8px] overflow-hidden group">
        <Image
          src={imgUrl}
          width={211}
          height={268}
          alt=""
          className="object-cover group-hover:scale-110 transition-all duration-300 ease-out"
        />
        <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center">
          <h6 className="sm:text-3xl text-center text-xl text-background font-semibold">
            {t(title)}
          </h6>
        </div>
      </div>
    </Link>
  );
};

export default MoreCollectionCard;
