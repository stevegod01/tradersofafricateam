"use client";

import Image from "next/image";
import Link from "next/link";

import AddToCartBtn from "../AddToCartBtn/AddToCartBtn";
import WishListBtn from "../WishListBtn/WishListBtn";
import RatingStar from "../RatingStar/RatingStar";

import { ProductData } from "@/features/products/types";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { useCurrency } from "@/lib/hooks/useCurrency/useCurrency";
import {
  convertCurrency,
  formatAmount,
  getCurrencySymbol,
} from "@/lib/helpers/currency/currency";

const ProductCard = ({
  productName,
  storeName,
  id,
  slug,
  currency,
  amount,
  imgUrl,
  isInWishList = false,
  unit,
  totalReviews,
}: ProductData) => {
  const { routes } = useGetAllRoutes();
  const { currency: selectedCurrency } = useCurrency();
  const convertedAmount = convertCurrency(amount, currency, selectedCurrency);

  return (
    <article className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-background transition-shadow duration-300 hover:shadow">
      <WishListBtn productId={id} isInWishList={isInWishList} />
      <Link
        href={routes?.productInfo(slug)}
        className="group flex min-w-0 flex-1 flex-col"
      >
        <div className="aspect-4/3 w-full overflow-hidden rounded-lg bg-muted/40">
          <Image
            src={imgUrl}
            alt={productName}
            width={500}
            height={500}
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1 px-1 pt-2 sm:px-2">
          <p className="truncate text-[11px] capitalize text-muted-foreground">
            {storeName}
          </p>
          <div className="flex flex-1 flex-col gap-0.5">
            <p className="line-clamp-2 min-h-9 text-sm leading-tight font-medium transition-colors duration-300 group-hover:text-(--orange) sm:text-base">
              {productName}
            </p>
            <p className="mt-auto flex min-w-0 items-baseline text-xs font-medium sm:text-sm">
              <span className="mr-0.5 shrink-0 font-sans font-semibold" aria-label={selectedCurrency}>
                {getCurrencySymbol(selectedCurrency)}
              </span>
              <span className="truncate">{formatAmount(convertedAmount)}</span>{" "}
              <span className="text-[9px] font-light sm:text-[11px]">
                &nbsp;/ {unit}
              </span>
            </p>
          </div>
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between gap-2 px-1 py-2 sm:px-2">
        <AddToCartBtn productId={id} />
        <div
          className="sm:flex items-center gap-1 hidden"
          aria-label="Total reviews"
        >
          <RatingStar />
          <p className="text-sm">({totalReviews})</p>
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
