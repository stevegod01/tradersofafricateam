"use client";

import { useRef, useState } from "react";

import CategoryCard from "@/components/atoms/CategoryCard/CategoryCard";
import CategoryFlyoutOverlay from "@/components/atoms/CategoryFlyoutOverlay/CategoryFlyoutOverlay";

import { categories } from "@/lib/constants/dummyData";
import { useTranslations } from "next-intl";

const CategoryPanel = () => {
  const t = useTranslations("Hero.categories");

  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleEnter = (idx: number) => {
    setActiveIdx(idx);
  };

  const handleLeave = () => setActiveIdx(null);
  const active = activeIdx !== null ? categories[activeIdx] : null;

  return (
    <div
      ref={panelRef}
      className="relative z-10 flex h-95 max-h-95 flex-col overflow-visible rounded-xl bg-background"
    >
      <h3 className="shrink-0 border-b border-muted px-3 py-2.5 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {t("categories")}
      </h3>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
        {categories.map((cat, idx) => {
          const onEnter = () => handleEnter(idx);

          return (
            <CategoryCard
              key={cat.id}
              isActive={activeIdx === idx}
              onMouseEnter={onEnter}
              onMouseLeave={handleLeave}
              icon={cat?.icon}
              name={t.has(cat.category) ? t(cat.category) : cat.category}
              id={cat.id}
            />
          );
        })}
      </div>

      {active && active?.children?.length > 0 && (
        <CategoryFlyoutOverlay
          onMouseEnter={() => setActiveIdx(activeIdx)}
          onMouseLeave={handleLeave}
          subCategories={active?.children}
        />
      )}
    </div>
  );
};

export default CategoryPanel;
