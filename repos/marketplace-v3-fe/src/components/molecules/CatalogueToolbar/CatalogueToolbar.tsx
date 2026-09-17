import { Grid2X2, List, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ProductView } from "@/features/products/types";
import { productSortOptions } from "@/lib/hooks/useProductCatalogue/useProductCatalogue";

const CatalogueToolbar = ({ sort, view, filterCount, onSort, onView, onOpenFilters }: { sort: string; view: ProductView; filterCount: number; onSort: (value: string) => void; onView: (view: ProductView) => void; onOpenFilters: () => void }) => {
  const t = useTranslations("ProductCatalogue");

  return (
  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
    <button onClick={onOpenFilters} className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold lg:hidden">
      <SlidersHorizontal size={17} /> {t("filters.title")}
      {filterCount > 0 && <span className="rounded-full bg-(--orange) px-1.5 text-xs text-white">{filterCount}</span>}
    </button>
    <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
      <span className="hidden sm:inline">{t("sortBy")}</span>
      <select value={sort} onChange={(event) => onSort(event.target.value)} className="min-w-0 bg-transparent font-medium text-foreground outline-none">
        {productSortOptions.map((option) => <option key={option} value={option}>{t(`sort.${option}`)}</option>)}
      </select>
    </label>
    <div className="hidden h-10 rounded-md border border-border p-1 sm:flex">
      <button onClick={() => onView("grid")} aria-label={t("galleryView")} className={`flex items-center gap-1 rounded px-2 text-xs ${view === "grid" ? "bg-orange-50 text-(--orange)" : "text-muted-foreground"}`}><Grid2X2 size={16} /> {t("gallery")}</button>
      <button onClick={() => onView("list")} aria-label={t("listView")} className={`flex items-center gap-1 rounded px-2 text-xs ${view === "list" ? "bg-orange-50 text-(--orange)" : "text-muted-foreground"}`}><List size={17} /> {t("list")}</button>
    </div>
  </div>
  );
};

export default CatalogueToolbar;
