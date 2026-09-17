import Link from "next/link";
import { cn } from "@/lib/utils";

const SellerCta = ({
  href,
  children,
  variant = "orange",
  fullWidth = false,
}: {
  href: string;
  children: string;
  variant?: "orange" | "outline";
  fullWidth?: boolean;
}) => (
  <Link
    href={href}
    className={cn(
      "inline-flex min-h-10 items-center justify-center rounded-lg px-7 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
      variant === "outline"
        ? "border border-border text-foreground hover:border-(--orange)/40 hover:bg-(--orange-light) focus-visible:outline-(--orange)"
        : "bg-(--orange) text-white hover:bg-(--orange-dark) focus-visible:outline-(--orange)",
      fullWidth && "w-full",
    )}
  >
    {children}
  </Link>
);

export default SellerCta;
