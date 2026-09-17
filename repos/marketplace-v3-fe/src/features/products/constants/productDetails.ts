import { ProductData, ProductDetail } from "../types";
import { products } from "./dummy";

export const productDetails: ProductDetail[] = [
  {
    id: "11",
    slug: "dangote-cement",
    productName: {
      en: "Dangote Cement (Dangocem 3X) - 50kg Bag",
      fr: "Ciment Dangote (Dangocem 3X) - Sac de 50kg",
    },
    productDescription: {
      en: "Dangocem 3X is a premium grade Portland-Limestone cement engineered for superior strength, workability, and durability. Manufactured to NIS 444-1 and BS EN 197-1 standards, it's the trusted choice for foundations, block work, plastering, and structural concrete across residential and commercial projects. Each bag is sealed at the point of production to guarantee freshness and moisture protection during transit.",
    },
    categoryIds: ["building-materials", "cement"],
    countryOfOrigin: "Nigeria",
    currency: "NGN",
    productType: "SIMPLE",

    price: 9500,
    discount: 5,
    quantity: 48000,

    supplyCapacity: 500000,
    unitForSupplyCapacity: "bags/month",
    minOrdersAllowed: 100,
    unitForMinOrder: "bags",
    minDuration: 7,
    maxDuration: 14,
    durationUnit: "days",

    barcode: "6156000090012",
    images: [
      "/assets/dummy/Frame 31.png",
      "/assets/dummy/Frame 33.png",
      "/assets/dummy/Frame 34.png",
      "/assets/dummy/Frame 35.png",
      "/assets/dummy/Produt img3.png",
    ],
    variantOptions: [],
    variants: [],

    seller: {
      id: "s-101",
      slug: "dangote-industries",
      storeName: "Dangote Industries",
      logoUrl: "/assets/dummy/Frame 31.png",
      isVerified: true,
      country: "Nigeria",
      responseRate: 98,
      totalProducts: 34,
      totalReviewCount: 1284,
      totalAverageReviews: 4.7,
      memberSince: "2016",
    },
    totalReviewCount: 128,
    totalAverageReviews: 4.6,
    reviews: [
      {
        id: "r-1",
        authorName: "Emeka O.",
        rating: 5,
        title: "Consistent quality, every batch",
        comment:
          "We've ordered from this supplier six times this year for our site in Lekki. Setting time and strength have been consistent across every batch. Delivery was on schedule both times.",
        createdAt: "2026-06-02",
        helpfulCount: 24,
      },
      {
        id: "r-2",
        authorName: "Amara N.",
        rating: 5,
        title: "Great for bulk orders",
        comment:
          "Ordered 2,000 bags for a housing estate project. Packaging was intact, no moisture damage, and the supplier's team helped coordinate logistics to our site.",
        createdAt: "2026-05-18",
        helpfulCount: 17,
      },
      {
        id: "r-3",
        authorName: "Chinedu A.",
        rating: 4,
        title: "Good quality, slight delay",
        comment:
          "Cement quality was excellent, but delivery took two extra days beyond the quoted lead time. Would still recommend given the product quality.",
        createdAt: "2026-04-27",
        helpfulCount: 9,
      },
      {
        id: "r-4",
        authorName: "Fatima B.",
        rating: 5,
        comment:
          "Reliable supplier, responsive to messages on RFQs. This is our go-to for structural concrete work now.",
        createdAt: "2026-03-11",
        helpfulCount: 12,
      },
      {
        id: "r-5",
        authorName: "Tunde S.",
        rating: 3,
        title: "Average packaging",
        comment:
          "A few bags arrived with torn packaging, though the cement inside was unaffected. Supplier promptly credited us for the affected bags.",
        createdAt: "2026-02-20",
        helpfulCount: 5,
      },
    ],
  },
  {
    id: "12",
    slug: "premium-polo-shirt",
    productName: {
      en: "Premium Cotton Polo Shirt - Custom Branding Available",
    },
    productDescription: {
      en: "A breathable, 220gsm combed-cotton polo shirt built for comfort and durability in wholesale runs. Reinforced collar and cuffs resist stretching after repeated washing, and the fabric holds custom embroidery or screen-print branding cleanly. Available across multiple sizes and colors to suit corporate wear, uniforms, or retail resale.",
    },
    categoryIds: ["apparel", "workwear"],
    countryOfOrigin: "Nigeria",
    currency: "USD",
    productType: "VARIABLE",

    price: null,
    discount: null,
    quantity: null,

    supplyCapacity: 20000,
    unitForSupplyCapacity: "pieces/month",
    minOrdersAllowed: 12,
    unitForMinOrder: "pieces",
    minDuration: 5,
    maxDuration: 10,
    durationUnit: "days",

    barcode: null,
    images: [
      "/assets/dummy/Frame 32.png",
      "/assets/dummy/Produt img.png",
      "/assets/dummy/Produt img1.png",
      "/assets/dummy/Produt img2.png",
    ],
    variantOptions: [
      { name: "Size", values: ["S", "M", "L", "XL"] },
      { name: "Color", values: ["Black", "Navy", "White"] },
    ],
    variants: [
      {
        sku: "PPS-S-BLK",
        attributes: { Size: "S", Color: "Black" },
        price: 12,
        discount: null,
        quantity: 340,
        image: "/assets/dummy/Produt img.png",
      },
      {
        sku: "PPS-M-BLK",
        attributes: { Size: "M", Color: "Black" },
        price: 12,
        discount: 8,
        quantity: 512,
        image: "/assets/dummy/Produt img.png",
      },
      {
        sku: "PPS-L-BLK",
        attributes: { Size: "L", Color: "Black" },
        price: 13,
        discount: 8,
        quantity: 289,
        image: "/assets/dummy/Produt img.png",
      },
      {
        sku: "PPS-XL-BLK",
        attributes: { Size: "XL", Color: "Black" },
        price: 13,
        discount: null,
        quantity: 96,
        image: "/assets/dummy/Produt img.png",
      },
      {
        sku: "PPS-S-NVY",
        attributes: { Size: "S", Color: "Navy" },
        price: 12,
        discount: null,
        quantity: 210,
        image: "/assets/dummy/Produt img1.png",
      },
      {
        sku: "PPS-M-NVY",
        attributes: { Size: "M", Color: "Navy" },
        price: 12,
        discount: 8,
        quantity: 401,
        image: "/assets/dummy/Produt img1.png",
      },
      {
        sku: "PPS-L-NVY",
        attributes: { Size: "L", Color: "Navy" },
        price: 13,
        discount: 8,
        quantity: 178,
        image: "/assets/dummy/Produt img1.png",
      },
      {
        sku: "PPS-XL-NVY",
        attributes: { Size: "XL", Color: "Navy" },
        price: 13,
        discount: null,
        quantity: 0,
        image: "/assets/dummy/Produt img1.png",
      },
      {
        sku: "PPS-S-WHT",
        attributes: { Size: "S", Color: "White" },
        price: 11,
        discount: null,
        quantity: 150,
        image: "/assets/dummy/Produt img2.png",
      },
      {
        sku: "PPS-M-WHT",
        attributes: { Size: "M", Color: "White" },
        price: 11,
        discount: null,
        quantity: 260,
        image: "/assets/dummy/Produt img2.png",
      },
      {
        sku: "PPS-L-WHT",
        attributes: { Size: "L", Color: "White" },
        price: 12,
        discount: null,
        quantity: 140,
        image: "/assets/dummy/Produt img2.png",
      },
      {
        sku: "PPS-XL-WHT",
        attributes: { Size: "XL", Color: "White" },
        price: 12,
        discount: null,
        quantity: 60,
        image: "/assets/dummy/Produt img2.png",
      },
    ],

    seller: {
      id: "s-102",
      slug: "naija-threads",
      storeName: "Naija Threads",
      logoUrl: "/assets/dummy/Frame 32.png",
      isVerified: true,
      country: "Nigeria",
      responseRate: 94,
      totalProducts: 58,
      totalReviewCount: 612,
      totalAverageReviews: 4.4,
      memberSince: "2019",
    },
    totalReviewCount: 46,
    totalAverageReviews: 4.3,
    reviews: [
      {
        id: "r-1",
        authorName: "Grace I.",
        rating: 5,
        title: "Fabric feels premium",
        comment:
          "Ordered 200 pieces in navy for our staff uniforms. The cotton feels thick and holds embroidery really well. Sizing runs true.",
        createdAt: "2026-07-14",
        helpfulCount: 11,
      },
      {
        id: "r-2",
        authorName: "Michael T.",
        rating: 4,
        title: "Good value for wholesale",
        comment:
          "Solid quality for the price point. A couple of pieces had slightly uneven stitching on the collar but nothing major.",
        createdAt: "2026-06-30",
        helpfulCount: 6,
      },
      {
        id: "r-3",
        authorName: "Blessing K.",
        rating: 5,
        comment:
          "Second time ordering. Colors are consistent batch to batch, which matters a lot for our retail resale.",
        createdAt: "2026-05-22",
        helpfulCount: 8,
      },
      {
        id: "r-4",
        authorName: "Samuel D.",
        rating: 3,
        title: "Shipping took longer than quoted",
        comment:
          "Shirts were fine, true to size, but production ran a few days past the quoted lead time during a bulk order.",
        createdAt: "2026-04-09",
        helpfulCount: 3,
      },
    ],
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Catalogue cards only carry a flat ProductData shape. Until every product has a
 * hand-authored ProductDetail record, synthesize a reasonable one from the card
 * data so any product in the catalogue is clickable instead of 404ing.
 */
const buildFallbackProductDetail = (product: ProductData): ProductDetail => ({
  id: product.id,
  slug: product.slug,
  productName: { en: product.productName },
  productDescription: {
    en: `${product.productName} from ${product.storeName}. Full product specifications and seller details are being finalized — reach out to the seller for detailed sourcing information.`,
  },
  categoryIds: [],
  countryOfOrigin: "Nigeria",
  currency: product.currency,
  productType: "SIMPLE",

  price: product.amount,
  discount: null,
  quantity: 500,

  supplyCapacity: 5000,
  unitForSupplyCapacity: `units of ${product.unit}/month`,
  minOrdersAllowed: 10,
  unitForMinOrder: "units",
  minDuration: 5,
  maxDuration: 10,
  durationUnit: "days",

  barcode: null,
  images: [product.imgUrl],
  variantOptions: [],
  variants: [],

  seller: {
    id: `s-${slugify(product.storeName)}`,
    slug: slugify(product.storeName),
    storeName: product.storeName,
    logoUrl: product.imgUrl,
    isVerified: true,
    country: "Nigeria",
    responseRate: 90,
    totalProducts: 12,
    totalReviewCount: product.totalReviews,
    totalAverageReviews: 4.5,
    memberSince: "2021",
  },
  totalReviewCount: product.totalReviews,
  totalAverageReviews: 4.5,
  reviews: [],
});

export const getProductDetailBySlug = (slug: string): ProductDetail | undefined => {
  const authored = productDetails.find((product) => product.slug === slug);
  if (authored) return authored;

  const catalogueEntry = products.find((product) => product.slug === slug);
  return catalogueEntry ? buildFallbackProductDetail(catalogueEntry) : undefined;
};
