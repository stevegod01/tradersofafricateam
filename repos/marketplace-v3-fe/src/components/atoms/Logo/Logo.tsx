"use client";

import Link from "next/link";
import Image from "next/image";

import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const Logo = ({
  imgUrl = "/assets/images/logo.png",
  width = 80,
  height = 40,
}: {
  height?: number;
  width?: number;
  imgUrl?: string;
}) => {
  const { routes } = useGetAllRoutes();

  return (
    <Link href={routes?.home} className="flex items-center gap-2 shrink-0">
      <Image
        src={imgUrl}
        alt="TOFA-logo"
        width={width}
        height={height}
        className="object-contain"
      />
    </Link>
  );
};

export default Logo;
