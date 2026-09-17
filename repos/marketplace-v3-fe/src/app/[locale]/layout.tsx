import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Mulish, Poppins, Geist } from "next/font/google";

import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import "./../globals.css";
import { cn } from "@/lib/utils";

import QueryProvider from "@/components/QueryProvider";
import AuthProvider from "@/components/providers/AuthProvider/AuthProvider";
import CurrencyProvider from "@/components/providers/CurrencyProvider/CurrencyProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const mulish = Mulish({
  subsets: ["latin"],
  variable: "--font-mulish",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default:
      "Traders of Africa Marketplace | Connecting African Suppliers to Global Buyers",
    template: "%s | Traders of Africa",
  },
  description:
    "Traders of Africa (TOFA) is a digital B2B and B2C marketplace connecting African businesses and buyers to trade products seamlessly across borders. Discover verified suppliers, shop products, request quotes, and grow your business globally.",

  keywords: [
    "Africa marketplace",
    "B2B marketplace Africa",
    "B2C marketplace Africa",
    "import export Africa",
    "trade platform Africa",
    "African suppliers",
    "bulk buying Africa",
    "TOFA marketplace",
  ],

  authors: [{ name: "Traders of Africa" }],
  creator: "Traders of Africa",
  publisher: "Traders of Africa",

  metadataBase: new URL("https://www.tradersofafrica.com"),

  openGraph: {
    title: "Traders of Africa Marketplace",
    description:
      "Connect with verified African suppliers and buyers. Trade seamlessly across Africa with TOFA.",
    url: "https://www.tradersofafrica.com",
    siteName: "Traders of Africa",
    images: [
      {
        url: "/og-image.png", // make sure you add this
        width: 1200,
        height: 630,
        alt: "Traders of Africa Marketplace",
      },
    ],
    locale: "en_US",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Traders of Africa Marketplace",
    description:
      "Africa’s leading B2B and B2C marketplace for seamless trade and business growth.",
    images: ["/og-image.png"],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },

  category: "business",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (
    !routing.locales.includes(locale as "en" | "fr" | "es" | "pt" | "sw")
  ) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir="ltr"
      className={cn(
        "h-full",
        "antialiased",
        mulish.variable,
        poppins.variable,
        "font-sans",
        geist.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>
              <CurrencyProvider>{children}</CurrencyProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
