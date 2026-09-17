"use client";

import { useTranslations } from "next-intl";

const NewsLetter = () => {
  const t = useTranslations("HomePage");

  return (
    <div className="border-y border-background py-6 flex flex-wrap items-center justify-between gap-6 my-10">
      <div className="text-background space-y-1">
        <p className="text-xs">{t("subscribeNews")}</p>
        <p className="">{t("subscribeDesc")}</p>
      </div>

      <form
        action=""
        className="flex flex-wrap justify-end flex-1 w-full gap-1"
      >
        <input
          type="email"
          className="sm:h-12 h-10 max-w-115 w-full min-w-62.5 bg-background rounded-md placeholder:text-gray-500 sm:px-4 px-2 border border-background focus:border-(--orange) outline-none"
          placeholder={t("emailPlaceholder")}
        />
        <button
          type="submit"
          className="rounded-md bg-(--orange) hover:bg-(--orange-dark) cursor-pointer transition-all duration-300 px-8 sm:h-12 h-10 text-center flex justify-center items-center text-white "
        >
          {t("subscribe")}
        </button>
      </form>
    </div>
  );
};

export default NewsLetter;
