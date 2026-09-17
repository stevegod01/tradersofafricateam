"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

import Container from "@/components/atoms/Container/Container";
import ProductCard from "@/components/atoms/ProductCard/ProductCard";
import CatalogueToolbar from "@/components/molecules/CatalogueToolbar/CatalogueToolbar";
import ProductFilters from "@/components/molecules/ProductFilters/ProductFilters";

import { useProductCatalogue } from "@/lib/hooks/useProductCatalogue/useProductCatalogue";

const ProductCatalogue = () => {
  const catalogue = useProductCatalogue();
  const t = useTranslations("ProductCatalogue");

  return (
    <section className="bg-background py-6 sm:py-10 lg:py-12">
      <Container>
        <motion.nav
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-8 flex items-center gap-2 text-xs text-muted-foreground"
          aria-label={t("breadcrumbLabel")}
        >
          <Link
            href={`/${catalogue.locale}`}
            className="text-(--orange) hover:underline"
          >
            {t("home")}
          </Link>
          <span>/</span>
          <span>{t("searchResult")}</span>
        </motion.nav>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between lg:mb-9"
        >
          <h1 className="text-xl font-semibold sm:text-2xl">
            {t("foundResults", { count: catalogue.visibleProducts.length })}{" "}
            <span className="text-(--orange)">{catalogue.contextTitle}</span>
          </h1>
          <CatalogueToolbar
            sort={catalogue.sort}
            view={catalogue.view}
            filterCount={catalogue.activeFilterCount}
            onSort={catalogue.changeSort}
            onView={catalogue.setView}
            onOpenFilters={catalogue.openMobileFilters}
          />
        </motion.div>

        <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:gap-9">
          <motion.aside
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="hidden h-[calc(100vh-7rem)] min-h-150 overflow-hidden rounded-md border border-border lg:sticky lg:top-24 lg:block"
          >
            <ProductFilters
              filters={catalogue.draftFilters}
              onChange={catalogue.changeFilters}
              onApply={catalogue.applyFilters}
              onClear={catalogue.clearFilters}
            />
          </motion.aside>

          <div className="min-w-0">
            {catalogue.activeFilterCount > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {t("selectedFilters", { count: catalogue.activeFilterCount })}
                </span>
                <button
                  onClick={catalogue.clearFilters}
                  className="flex items-center gap-1 text-xs font-semibold text-(--orange)"
                >
                  {t("clearAll")} <X size={12} />
                </button>
              </div>
            )}

            {catalogue.visibleProducts.length ? (
              <motion.div
                layout
                className={`grid gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-10 ${catalogue.view === "list" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}
              >
                {catalogue.visibleProducts.map((product, index) => (
                  <motion.div
                    layout
                    key={product.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      duration: 0.28,
                      delay: Math.min(index * 0.035, 0.25),
                    }}
                    className="h-full"
                  >
                    <ProductCard {...product} />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
                <h2 className="text-xl font-bold">{t("empty.title")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("empty.description")}
                </p>
                <button
                  onClick={catalogue.clearFilters}
                  className="mt-5 rounded-md bg-(--orange) px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {t("filters.clear")}
                </button>
              </div>
            )}

            {catalogue.visibleProducts.length > 0 && (
              <nav
                aria-label={t("pagination.label")}
                className="mt-12 flex items-center justify-end gap-1 border-t border-border pt-6 text-xs"
              >
                <span className="mr-3 text-muted-foreground">
                  {t("pagination.pageOf", { page: 1, total: 10 })}
                </span>
                <button
                  className="rounded border border-border px-3 py-2 text-muted-foreground"
                  disabled
                >
                  {t("pagination.previous")}
                </button>
                <button className="rounded bg-(--orange) px-3 py-2 text-white">
                  1
                </button>
                <button className="rounded border border-border px-3 py-2">
                  2
                </button>
                <button className="rounded border border-border px-3 py-2">
                  3
                </button>
                <button className="rounded border border-border px-3 py-2">
                  {t("pagination.next")}
                </button>
              </nav>
            )}
          </div>
        </div>
      </Container>

      <AnimatePresence>
        {catalogue.mobileFiltersOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-70 lg:hidden"
          >
            <motion.button
              aria-label={t("filters.close")}
              onClick={catalogue.closeMobileFilters}
              className="absolute inset-0 bg-black/45"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="absolute inset-y-0 right-0 w-[min(92vw,390px)] shadow-2xl"
            >
              <ProductFilters
                filters={catalogue.draftFilters}
                onChange={catalogue.changeFilters}
                onApply={catalogue.applyFilters}
                onClear={catalogue.clearFilters}
                onClose={catalogue.closeMobileFilters}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ProductCatalogue;
