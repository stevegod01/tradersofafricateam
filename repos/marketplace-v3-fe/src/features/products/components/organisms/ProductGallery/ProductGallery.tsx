"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import ThumbnailRail from "@/features/products/components/molecules/ThumbnailRail/ThumbnailRail";
import GalleryThumbnail from "@/features/products/components/atoms/GalleryThumbnail/GalleryThumbnail";
import { getUniqueVariantImages } from "@/features/products/helpers";
import { ProductDetail, ProductVariant } from "@/features/products/types";

const ProductGallery = ({
  product,
  activeVariant,
  onSelectVariantByImage,
}: {
  product: ProductDetail;
  activeVariant?: ProductVariant;
  onSelectVariantByImage?: (variant: ProductVariant) => void;
}) => {
  const t = useTranslations("ProductInfo");
  const [manualImage, setManualImage] = useState<{
    src: string;
    variantImage?: string;
  } | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const variantImage = activeVariant?.image;
  const activeImage =
    manualImage && manualImage.variantImage === variantImage
      ? manualImage.src
      : variantImage ?? product.images[0];
  const setActiveImage = (src: string) => setManualImage({ src, variantImage });
  const activeIndex = Math.max(product.images.indexOf(activeImage), 0);
  const variantImages = getUniqueVariantImages(product.variants);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div
          ref={frameRef}
          onMouseEnter={() => setIsZooming(true)}
          onMouseLeave={() => setIsZooming(false)}
          onMouseMove={handleMouseMove}
          onClick={() => setLightboxOpen(true)}
          className="group relative aspect-square w-full max-w-150 flex-1 cursor-zoom-in overflow-hidden rounded-2xl border border-border bg-muted/30"
        >
          <Image
            src={activeImage}
            alt={product.productName.en ?? ""}
            fill
            priority
            sizes="(max-width: 639px) 100vw, 50vw"
            className={`object-cover transition-transform duration-200 ${isZooming ? "scale-150" : "scale-100"}`}
            style={isZooming ? { transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%` } : undefined}
          />
          <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100">
            {t("clickToZoom")}
          </span>
        </div>

        <ThumbnailRail
          images={product.images}
          activeIndex={activeIndex}
          onSelect={(index) => setActiveImage(product.images[index])}
          productName={product.productName.en ?? ""}
        />
      </div>

      {product.productType === "VARIABLE" && variantImages.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("variantImages")}</p>
          <div className="flex gap-2 overflow-x-auto">
            {variantImages.map((variant) => (
              <GalleryThumbnail
                key={variant.image}
                src={variant.image}
                alt={Object.values(variant.attributes).join(" / ")}
                isActive={variant.image === activeVariant?.image}
                onSelect={() => onSelectVariantByImage?.(variant)}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog.Root open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <Dialog.Title className="sr-only">{product.productName.en}</Dialog.Title>
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
              <Image
                src={activeImage}
                alt={product.productName.en ?? ""}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
            <div className="flex justify-center gap-2 overflow-x-auto">
              {product.images.map((src, index) => (
                <GalleryThumbnail
                  key={src + index}
                  src={src}
                  alt={`${product.productName.en} ${index + 1}`}
                  isActive={index === activeIndex}
                  onSelect={() => setActiveImage(src)}
                />
              ))}
            </div>
            <Dialog.Close className="mx-auto rounded-full bg-background px-5 py-2 text-sm font-semibold text-foreground">
              {t("close")}
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default ProductGallery;
