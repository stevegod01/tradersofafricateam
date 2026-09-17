export interface ProductData {
  productName: string;
  storeName: string;
  id: string;
  slug: string;
  currency: string;
  amount: number;
  imgUrl: string;
  isInWishList?: boolean;
  unit: string;
  totalReviews: number;
}

export interface CatalogueFilters {
  category: string;
  minPrice: string;
  maxPrice: string;
  rating: string;
  verified: boolean;
  inStock: boolean;
  minOrder: string;
}

export type ProductView = "grid" | "list";

// ---------------------------------------------------------------------------
// Product detail page - matches the backend product schema.
// ---------------------------------------------------------------------------

/** A field the backend stores per-locale, e.g. `{ en: "Dangote Cement" }`. */
export type LocalizedText = Record<string, string>;

export type ProductVariantOption = {
  name: string;
  values: string[];
};

export type ProductVariant = {
  sku?: string;
  attributes: Record<string, string>;
  price: number;
  discount: number | null;
  quantity: number;
  image: string;
};

export type ProductType = "SIMPLE" | "VARIABLE";

export type ProductSeller = {
  id: string;
  slug: string;
  storeName: string;
  logoUrl?: string;
  isVerified?: boolean;
  country?: string;
  responseRate?: number;
  totalProducts?: number;
  totalReviewCount?: number;
  totalAverageReviews?: number;
  memberSince?: string;
};

export type ProductReview = {
  id: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  title?: string;
  comment: string;
  createdAt: string;
  helpfulCount?: number;
};

export type ProductDetail = {
  id: string;
  slug: string;
  productName: LocalizedText;
  productDescription: LocalizedText;
  categoryIds: string[];
  countryOfOrigin: string;
  currency: string;
  productType: ProductType;

  price: number | null;
  discount: number | null;
  quantity: number | null;

  supplyCapacity: number;
  unitForSupplyCapacity: string;
  minOrdersAllowed: number;
  unitForMinOrder: string;
  minDuration: number;
  maxDuration: number;
  durationUnit: string;

  barcode?: string | null;
  images: string[];
  variantOptions: ProductVariantOption[];
  variants: ProductVariant[];

  seller: ProductSeller;
  totalReviewCount: number;
  totalAverageReviews: number;
  reviews: ProductReview[];
};
