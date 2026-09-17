"use client";

import { BadgeCheck, Check, PackageCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";

import PriceRange from "@/components/atoms/PriceRange/PriceRange";
import RatingStar from "@/components/atoms/RatingStar/RatingStar";
import type { CatalogueFilters } from "@/features/products/types";
import { categories } from "@/lib/constants/dummyData";
import { usePriceFilterCurrency } from "@/lib/hooks/usePriceFilterCurrency/usePriceFilterCurrency";

const ProductFilters = ({ filters, onChange, onApply, onClear, onClose }: { filters: CatalogueFilters; onChange: (next: Partial<CatalogueFilters>) => void; onApply: () => void; onClear: () => void; onClose?: () => void }) => {
  const price = usePriceFilterCurrency(filters, onChange);
  const t = useTranslations("ProductCatalogue");
  const tCategories = useTranslations("Hero.categories");

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
      <h2 className="text-base font-bold">{t("filters.title")}</h2>
      <div className="flex items-center gap-2">
        <button onClick={onClear} className="text-xs font-semibold text-(--orange) hover:underline">{t("filters.reset")}</button>
        {onClose && <button onClick={onClose} aria-label={t("filters.close")} className="rounded-full p-1.5 hover:bg-muted"><X size={19} /></button>}
      </div>
    </div>

    <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
      <fieldset className="px-4 pb-4 pt-5">
        <legend className="mb-2 pt-2 text-sm font-bold">{t("filters.categories")}</legend>
        <div className="space-y-0.5">
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm text-muted-foreground hover:bg-muted/60">
            <input type="radio" name="category" checked={!filters.category} onChange={() => onChange({ category: "" })} className="accent-(--orange)" /> {t("filters.allCategories")}
          </label>
          {categories.slice(0, 9).map((category) => (
            <label key={category.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground">
              <input type="radio" name="category" checked={filters.category === category.id} onChange={() => onChange({ category: category.id })} className="accent-(--orange)" />
              <span className="truncate">{tCategories.has(category.category) ? tCategories(category.category) : category.category}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="px-4 pb-4 pt-5">
        <legend className="mb-5 pt-2 text-sm font-bold">{t("filters.price")}</legend>
        <PriceRange min={price.displayMin} max={price.displayMax} limit={price.displayLimit} symbol={price.symbol} minLabel={t("filters.min")} maxLabel={t("filters.max")} onChange={price.changeDisplayRange} />
      </fieldset>

      <fieldset className="px-4 pb-4 pt-5">
        <legend className="mb-3 pt-2 text-sm font-bold">{t("filters.rating")}</legend>
        <div className="grid grid-cols-1 gap-1.5">
          {[4, 3, 2, 1].map((rating) => {
            const selected = filters.rating === String(rating);
            return (
              <label key={rating} className={`flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-2 transition-colors ${selected ? "border-(--orange) bg-orange-50/70" : "border-transparent hover:bg-muted/60"}`}>
                <input type="radio" name="rating" checked={selected} onChange={() => onChange({ rating: String(rating) })} className="sr-only" />
                <span className="flex items-center gap-0.5">{Array.from({ length: 5 }, (_, index) => <RatingStar key={index} filled={index < rating} size={15} className={index < rating ? "text-[#FDD037]" : "text-border"} />)}</span>
                <span className="text-xs font-medium text-muted-foreground">{t("filters.ratingUp", { rating })}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2 px-4 pb-4 pt-5">
        <legend className="mb-1 pt-2 text-sm font-bold">{t("filters.availability")}</legend>
        {[
          { key: "verified" as const, label: t("filters.verified"), icon: BadgeCheck },
          { key: "inStock" as const, label: t("filters.readyToShip"), icon: PackageCheck },
        ].map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/50">
            <Icon size={17} className="text-(--orange)" />
            <span className="flex-1">{label}</span>
            <input type="checkbox" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} className="peer sr-only" />
            <span className="flex size-4 items-center justify-center rounded border border-input peer-checked:border-(--orange) peer-checked:bg-(--orange) peer-checked:text-white"><Check size={11} /></span>
          </label>
        ))}
      </fieldset>

      <label className="block px-4 pb-4 pt-6 text-sm font-bold">
        {t("filters.maximumMinimumOrder")}
        <span className="mt-2 flex items-center rounded-md border border-input focus-within:border-(--orange)">
          <input inputMode="numeric" placeholder={t("filters.anyQuantity")} value={filters.minOrder} onChange={(event) => onChange({ minOrder: event.target.value })} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal outline-none" />
          <span className="pr-3 text-xs font-normal text-muted-foreground">{t("filters.units")}</span>
        </span>
      </label>
    </div>

    <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 border-t border-border bg-background p-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)]">
      <button onClick={onApply} className="rounded-md bg-(--orange) px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-(--orange-dark) hover:shadow-md active:translate-y-0 active:scale-[0.98]">{t("filters.apply")}</button>
      <button onClick={onClear} className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-muted active:scale-[0.98]">{t("filters.clear")}</button>
    </div>
  </div>;
};

export default ProductFilters;
