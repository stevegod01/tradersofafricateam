import ProductCard from "@/components/atoms/ProductCard/ProductCard";
import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";
import Link from "next/link";

import { ProductData } from "@/features/products/types";

const ProductCardWrapper = ({
  title,
  products,
  href,
}: {
  title: string;
  products: ProductData[];
  href?: string;
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <SectionTitle title={title} />
        {href && (
          <Link
            href={href}
            className="shrink-0 text-sm font-semibold text-(--orange) transition-colors hover:text-(--orange-dark) hover:underline"
          >
            See more
          </Link>
        )}
      </div>
      <div className="grid [--product-card-min:150px] [grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--product-card-min)),1fr))] gap-2 bg-background p-3 sm:[--product-card-min:180px] sm:gap-3 sm:p-4 lg:[--product-card-min:210px] lg:gap-4">
        {products?.map((prod: ProductData) => (
          <ProductCard
            key={prod?.id}
            imgUrl={prod?.imgUrl}
            isInWishList={prod?.isInWishList}
            amount={prod.amount}
            unit={prod?.unit}
            productName={prod?.productName}
            storeName={prod?.storeName}
            id={prod?.id}
            slug={prod?.slug}
            totalReviews={prod?.totalReviews}
            currency={prod?.currency}
          />
        ))}
      </div>
    </div>
  );
};

export default ProductCardWrapper;
