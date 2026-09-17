"use client";

import GalleryThumbnail from "@/features/products/components/atoms/GalleryThumbnail/GalleryThumbnail";

const ThumbnailRail = ({
  images,
  activeIndex,
  onSelect,
  productName,
  orientation = "vertical",
}: {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  productName: string;
  orientation?: "vertical" | "horizontal";
}) => {
  return (
    <div
      className={
        orientation === "vertical"
          ? "flex max-h-[420px] flex-row gap-2 overflow-x-auto sm:max-h-none sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
          : "flex flex-row gap-2 overflow-x-auto"
      }
    >
      {images.map((src, index) => (
        <GalleryThumbnail
          key={src + index}
          src={src}
          alt={`${productName} ${index + 1}`}
          isActive={index === activeIndex}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
};

export default ThumbnailRail;
