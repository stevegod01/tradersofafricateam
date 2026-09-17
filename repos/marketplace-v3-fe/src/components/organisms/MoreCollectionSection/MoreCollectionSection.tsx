"use client";

import { useTranslations } from "next-intl";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";

import { moreCollectionOptions } from "@/lib/constants";

import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import MoreCollectionCard from "@/components/atoms/MoreCollectionCard/MoreCollectionCard";

const MoreCollectionSection = () => {
  const t = useTranslations("HomePage");
  const { routes } = useGetAllRoutes();

  return (
    <SectionWrapper paddingX="xl:px-14" className="sm:py-14 py-10">
      <div className="bg-background rounded-xl overflow-hidden">
        <div className="bg-[#FFF4F0] w-full sm:h-17.5 h-15 flex justify-center items-center">
          <h6 className="text-center w-full font-semibold sm:text-xl text-lg">
            {t("moreCollection")}
          </h6>
        </div>
        <div className="sm:px-6 px-4 py-8 flex justify-evenly gap-6 w-full overflow-x-auto">
          {moreCollectionOptions?.map((collection) => (
            <MoreCollectionCard
              href={routes?.categoryInfo(collection?.id)}
              key={collection?.id}
              imgUrl={collection?.imgUrl}
              title={collection?.title}
            />
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
};

export default MoreCollectionSection;
