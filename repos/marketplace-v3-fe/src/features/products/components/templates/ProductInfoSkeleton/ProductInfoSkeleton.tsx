import Container from "@/components/atoms/Container/Container";
import { Skeleton } from "@/components/ui/skeleton";

const ProductInfoSkeleton = () => (
  <Container className="space-y-6 py-6 sm:py-8">
    <Skeleton className="h-4 w-64" />

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,620px)_minmax(360px,1fr)] xl:grid-cols-[minmax(0,680px)_minmax(400px,1fr)]">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="aspect-square w-full max-w-150 rounded-2xl" />
        <div className="flex gap-2 sm:flex-col">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="size-16 shrink-0 rounded-lg sm:size-18" />
          ))}
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-background p-5 sm:p-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-10 w-52" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-16 rounded-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="flex gap-2.5">
          <Skeleton className="h-11 w-32 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </div>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  </Container>
);

export default ProductInfoSkeleton;
