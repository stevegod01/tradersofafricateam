"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

import { products } from "@/features/products/constants/dummy";
import type { CatalogueFilters, ProductView } from "@/features/products/types";
import { categories } from "@/lib/constants/dummyData";
import { convertCurrency } from "@/lib/helpers/currency/currency";

export const PRODUCT_PRICE_LIMIT = 1000000;

const emptyFilters: CatalogueFilters = {
  category: "",
  minPrice: "0",
  maxPrice: String(PRODUCT_PRICE_LIMIT),
  rating: "",
  verified: false,
  inStock: false,
  minOrder: "",
};

export const productSortOptions = [
  "relevance",
  "newest",
  "oldest",
  "price-low",
  "price-high",
  "rating",
  "reviews",
  "name-asc",
] as const;

export const useProductCatalogue = () => {
  const params = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("ProductCatalogue");
  const tCategories = useTranslations("Hero.categories");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [view, setView] = useState<ProductView>("grid");
  const [draftFilters, setDraftFilters] = useState<CatalogueFilters>({
    ...emptyFilters,
    category: params.get("category") ?? "",
    minPrice: params.get("minPrice") ?? emptyFilters.minPrice,
    maxPrice: params.get("maxPrice") ?? emptyFilters.maxPrice,
    rating: params.get("rating") ?? "",
    minOrder: params.get("minOrder") ?? "",
    verified: params.get("verified") === "1",
    inStock: params.get("inStock") === "1",
  });

  const query = params.get("q")?.trim() ?? "";
  const collection = params.get("collection") ?? "";
  const sort = params.get("sort") ?? "relevance";
  const appliedCategory = params.get("category") ?? "";
  const category = categories.find((item) => item.id === appliedCategory);
  const contextTitle =
    query ||
    (category?.category && tCategories.has(category.category)
      ? tCategories(category.category)
      : category?.category) ||
    (collection === "popular"
      ? t("collections.popular")
      : collection === "new"
        ? t("collections.new")
        : t("collections.all"));

  const visibleProducts = useMemo(() => {
    const minPrice = Number(params.get("minPrice") ?? 0);
    const maxPrice = Number(params.get("maxPrice") ?? PRODUCT_PRICE_LIMIT);
    const minimumRating = Number(params.get("rating") ?? 0);
    const maximumMinimumOrder = Number(
      params.get("minOrder") || Number.POSITIVE_INFINITY,
    );
    const verifiedOnly = params.get("verified") === "1";
    const inStockOnly = params.get("inStock") === "1";
    const needle = query.toLowerCase();

    const filtered = products.filter((product) => {
      const productNumber = Number(product.id) || 1;
      const rating = 3 + (productNumber % 3);
      const minimumOrder = productNumber * 10;
      const matchesQuery =
        !needle ||
        `${product.productName} ${product.storeName}`
          .toLowerCase()
          .includes(needle);
      const matchesCategory = !appliedCategory || appliedCategory === "1";

      return (
        matchesQuery &&
        matchesCategory &&
        convertCurrency(product.amount, product.currency, "NGN") >= minPrice &&
        convertCurrency(product.amount, product.currency, "NGN") <= maxPrice &&
        rating >= minimumRating &&
        minimumOrder <= maximumMinimumOrder &&
        (!verifiedOnly || productNumber % 2 === 0) &&
        (!inStockOnly || productNumber % 3 !== 0)
      );
    });

    return [...filtered].sort((a, b) => {
      if (collection === "popular" || sort === "reviews") return b.totalReviews - a.totalReviews;
      if (collection === "new" || sort === "newest") return Number(b.id) - Number(a.id);
      if (sort === "oldest") return Number(a.id) - Number(b.id);
      if (sort === "price-low") return a.amount - b.amount;
      if (sort === "price-high") return b.amount - a.amount;
      if (sort === "rating") return (Number(b.id) % 3) - (Number(a.id) % 3);
      if (sort === "name-asc") return a.productName.localeCompare(b.productName);
      return 0;
    });
  }, [appliedCategory, collection, params, query, sort]);

  const changeFilters = (next: Partial<CatalogueFilters>) => {
    setDraftFilters((current) => ({ ...current, ...next }));
  };

  const applyFilters = (filters = draftFilters) => {
    const next = new URLSearchParams(params.toString());
    const values: Record<string, string> = {
      category: filters.category,
      minPrice: filters.minPrice === emptyFilters.minPrice ? "" : filters.minPrice,
      maxPrice: filters.maxPrice === emptyFilters.maxPrice ? "" : filters.maxPrice,
      rating: filters.rating,
      minOrder: filters.minOrder,
      verified: filters.verified ? "1" : "",
      inStock: filters.inStock ? "1" : "",
    };
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    next.delete("page");
    router.push(`/${locale}/products${next.size ? `?${next.toString()}` : ""}`);
    setMobileFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(emptyFilters);
    applyFilters(emptyFilters);
  };

  const changeSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "relevance") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    router.push(`/${locale}/products${next.size ? `?${next.toString()}` : ""}`);
  };

  const activeFilterCount = [
    draftFilters.category,
    draftFilters.minPrice !== emptyFilters.minPrice,
    draftFilters.maxPrice !== emptyFilters.maxPrice,
    draftFilters.rating,
    draftFilters.minOrder,
    draftFilters.verified,
    draftFilters.inStock,
  ].filter(Boolean).length;

  return {
    locale,
    contextTitle,
    visibleProducts,
    draftFilters,
    activeFilterCount,
    sort,
    view,
    mobileFiltersOpen,
    changeFilters,
    applyFilters,
    clearFilters,
    changeSort,
    setView,
    openMobileFilters: () => setMobileFiltersOpen(true),
    closeMobileFilters: () => setMobileFiltersOpen(false),
  };
};
