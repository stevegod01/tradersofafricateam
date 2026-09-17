"use client";

import { useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

const MainSearchbar = () => {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="w-full min-w-0 flex-1 max-w-2xl">
      <form
        className="relative group w-full lg:h-12 h-10 flex items-center justify-between overflow-hidden rounded-full focus-within:border-(--orange) border border-border transition-all duration-300"
        onSubmit={(event) => {
          event.preventDefault();
          const query = searchQuery.trim();
          router.push(
            `/${locale}/products${query ? `?q=${encodeURIComponent(query)}` : ""}`,
          );
        }}
      >
        <button
          type="submit"
          className="block shrink-0 pl-2 text-muted-foreground lg:hidden"
        >
          <Search
            size={16}
            className="group-focus-within:text-(--orange) transition-colors"
          />
        </button>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-full min-w-0 flex-1 bg-background px-2 text-sm outline-none transition-all duration-300 placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="h-full bg-(--orange) hover:bg-(--orange-dark) transition-all duration-300 rounded-r-full px-8 hidden lg:block text-white"
        >
          search
        </button>
      </form>
    </div>
  );
};

export default MainSearchbar;
