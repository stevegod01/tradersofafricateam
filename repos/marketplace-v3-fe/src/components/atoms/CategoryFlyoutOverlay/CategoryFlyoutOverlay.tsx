"use client";

import { useTranslations } from "next-intl";

import { Category } from "@/lib/types/category";

import PointerArrow from "../PointerArrow/PointerArrow";
import Link from "next/link";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

const CategoryFlyoutOverlay = ({
  onMouseEnter,
  onMouseLeave,
  subCategories,
}: {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  subCategories: Category[];
}) => {
  const t = useTranslations("Hero.categories");

  const { routes } = useGetAllRoutes();

  return (
    <div
      className="absolute left-[calc(100%+6px)] top-0 z-20 grid h-full max-h-full w-[calc(280%+12px)] grid-cols-2 gap-6 overflow-y-auto overscroll-contain rounded-xl border border-muted bg-background p-4 shadow-lg lg:grid-cols-3"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <PointerArrow />

      {subCategories?.map((cat) => (
        <div key={cat.id} className="w-full min-w-0">
          <Link
            href={routes?.categoryInfo(cat?.id)}
            className="text-[11px] font-medium text-muted-foreground uppercase pb-4 mb-2  hover:underline transition-all duration-300"
          >
            {t.has(cat.category) ? t(cat.category) : cat.category}
          </Link>
          {cat?.children?.map((sub) => (
            <Link
              key={sub.id}
              href={routes?.categoryInfo(sub?.id)}
              className="block text-xs text-foreground hover:text-(--orange)  py-1 rounded-md hover:bg-muted/50 transition-colors"
            >
              {t.has(sub.category) ? t(sub.category) : sub.category}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
};

export default CategoryFlyoutOverlay;
