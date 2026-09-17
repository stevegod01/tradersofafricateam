import MainLayout from "@/components/templates/MainLayout/MainLayout";
import ProductInfoSkeleton from "@/features/products/components/templates/ProductInfoSkeleton/ProductInfoSkeleton";

export default function ProductInfoLoading() {
  return (
    <MainLayout>
      <ProductInfoSkeleton />
    </MainLayout>
  );
}
