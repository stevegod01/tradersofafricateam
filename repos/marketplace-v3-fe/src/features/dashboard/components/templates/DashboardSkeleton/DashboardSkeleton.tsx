import { Skeleton } from "@/components/ui/skeleton";

const DashboardSkeleton = () => (
  <div className="flex min-h-screen bg-muted/30">
    <aside className="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
      <div className="flex h-screen flex-col py-6">
        <div className="px-3.5 pb-6">
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="flex-1 space-y-5 px-3.5">
          {[2, 4, 3, 2].map((itemCount, sectionIndex) => (
            <div key={sectionIndex} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              {Array.from({ length: itemCount }).map((_, itemIndex) => (
                <div key={itemIndex} className="flex items-center gap-3 px-2 py-1.5">
                  <Skeleton className="size-5 rounded-md" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-3.5 pt-5">
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="size-8 rounded-full" />
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-11 w-full rounded-xl sm:w-72" />
          </div>
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </main>
    </div>
  </div>
);

export default DashboardSkeleton;
