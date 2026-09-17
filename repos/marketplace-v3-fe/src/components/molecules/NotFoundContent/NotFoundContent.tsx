import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";

const NotFoundContent = () => {
  const locale = useLocale();
  const t = useTranslations("notFound");

  return (
    <SectionWrapper className="bg-background py-10 sm:py-14 lg:py-16">
      <div className="grid min-h-125 items-center gap-10 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:py-4">
        <ScrollReveal>
          <div className="max-w-lg space-y-7">
            <h1 className="heading-font text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              {t("title")}
            </h1>
            <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
              {t("description")}
            </p>
            <Link
              href={`/${locale}`}
              className="inline-flex min-h-11 min-w-58 items-center justify-center rounded-sm bg-(--orange) px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-(--orange-dark) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--orange)"
            >
              {t("backHome")}
            </Link>
          </div>
        </ScrollReveal>
        <ScrollReveal>
          <div className="mx-auto w-full max-w-2xl">
            <Image
              src="/assets/images/404-img.svg"
              alt={t("imageAlt")}
              width={898}
              height={679}
              priority
              className="h-auto w-full"
            />
          </div>
        </ScrollReveal>
      </div>
    </SectionWrapper>
  );
};

export default NotFoundContent;
