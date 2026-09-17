"use client";

import Image from "next/image";

const GalleryThumbnail = ({
  src,
  alt,
  isActive,
  onSelect,
}: {
  src: string;
  alt: string;
  isActive: boolean;
  onSelect: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={alt}
      aria-current={isActive}
      className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-muted/40 transition-colors duration-200 sm:w-18 ${
        isActive ? "border-(--orange)" : "border-transparent hover:border-border"
      }`}
    >
      <Image src={src} alt={alt} fill sizes="72px" className="object-cover" />
    </button>
  );
};

export default GalleryThumbnail;
