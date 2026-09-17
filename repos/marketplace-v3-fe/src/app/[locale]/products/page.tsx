import { Suspense } from "react";
import type { Metadata } from "next";

import ProductCatalogue from "@/components/organisms/ProductCatalogue/ProductCatalogue";
import MainLayout from "@/components/templates/MainLayout/MainLayout";

export const metadata: Metadata = {
  title: "African Products",
  description: "Search and filter products from verified African suppliers.",
};

export default function ProductsPage() {
  return (
    <MainLayout>
      <Suspense fallback={<div className="min-h-[60vh] bg-background" />}>
        <ProductCatalogue />
      </Suspense>
    </MainLayout>
  );
}
