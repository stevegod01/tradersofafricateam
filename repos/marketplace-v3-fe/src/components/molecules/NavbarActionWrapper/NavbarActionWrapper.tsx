"use client";

import { useTranslations } from "next-intl";

import { useAboutUs } from "@/lib/hooks/useAboutUs";
import { useAccountLinks } from "@/lib/hooks/useAccountLinks";
import { useStore } from "@/store/authStore";

import { Menu, X } from "lucide-react";

import CartIcon from "@/components/atoms/CartIcon/CartIcon";
import DropdownMenu from "@/components/atoms/DropdownMenu/DropdownMenu";
import { Skeleton } from "@/components/ui/skeleton";

const NavbarActionWrapper = ({
  mobileOpen,
  toggle,
}: {
  mobileOpen: boolean;
  toggle: () => void;
}) => {
  const t = useTranslations("Nav");

  const { aboutItems } = useAboutUs();
  const { authLinks, dashboardLinks } = useAccountLinks();

  const isUserSignedIn = Boolean(useStore((state) => state.currentUser));
  const isAuthInitialized = useStore((state) => state.isAuthInitialized);

  return (
    <div className="flex items-center gap-2 sm:gap-6 shrink-0">
      <div className="hidden lg:block">
        <DropdownMenu
          trigger={
            <span className="text-sm font-medium">{t("about.label")}</span>
          }
          items={aboutItems}
          align="right"
        />
      </div>
      <div className="hidden md:block">
        {!isAuthInitialized ? (
          <div className="flex items-center gap-1.5 py-1" aria-hidden="true">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="hidden h-4 w-16 lg:block" />
          </div>
        ) : (
          <DropdownMenu
            trigger={
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <svg
                  width="16"
                  viewBox="0 0 23 25"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M11.4978 12.5C14.3066 12.5 16.6089 10.2477 16.6089 7.5C16.6089 4.75225 14.3297 2.5 11.4978 2.5C8.68902 2.5 6.38672 4.75225 6.38672 7.5C6.38672 10.2477 8.68902 12.5 11.4978 12.5ZM11.4978 3.82883C13.5699 3.82883 15.2506 5.47297 15.2506 7.5C15.2506 9.52703 13.5699 11.1712 11.4978 11.1712C9.42576 11.1712 7.74508 9.52703 7.74508 7.5C7.74508 5.47297 9.42576 3.82883 11.4978 3.82883Z"
                    fill="currentColor"
                  />
                  <path
                    d="M15.984 12.5C15.5556 12.8895 15.0517 13.201 14.5478 13.4607C16.9162 14.5512 18.6547 16.9139 18.9318 19.6921H4.09162C4.34358 16.9139 6.08207 14.5512 8.47566 13.4607C7.94655 13.201 7.46783 12.8895 7.03951 12.5C4.36877 14.0838 2.55469 17.0697 2.55469 20.4711V21.25H20.4436V20.4711C20.4436 17.0697 18.6547 14.0838 15.984 12.5Z"
                    fill="currentColor"
                  />
                </svg>
                <span className="hidden lg:inline">
                  {t(isUserSignedIn ? "dashboard" : "login")}
                </span>
              </span>
            }
            items={isUserSignedIn ? dashboardLinks : authLinks}
            align="right"
          />
        )}
      </div>
      <CartIcon />
      <button
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-border  hover:bg-primary-foreground transition-colors"
        onClick={toggle}
        aria-label={t("menu")}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
    </div>
  );
};

export default NavbarActionWrapper;
