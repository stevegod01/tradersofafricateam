"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { useStore } from "@/store/authStore";
import { useRequestLogout } from "@/features/auth/hooks/useLogout";

const UserMenu = ({ align = "right" }: { align?: "left" | "right" }) => {
  const t = useTranslations("Nav");
  const { routes } = useGetAllRoutes();
  const currentUser = useStore((state) => state.currentUser);
  const { requestLogout } = useRequestLogout();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  if (!currentUser) return null;

  const displayName =
    currentUser.firstName || currentUser.email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-2"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--orange) text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden text-sm font-medium lg:inline">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-background shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ animation: "dropIn 0.18s ease" }}
        >
          <div className="border-b border-muted px-4 py-3">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {currentUser.email}
            </p>
          </div>
          <Link
            href={routes.dashboard}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-(--orange-light) hover:text-(--orange)"
          >
            {t("dashboard")}
          </Link>
          <Link
            href={routes.orders}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-(--orange-light) hover:text-(--orange)"
          >
            {t("orders")}
          </Link>
          <Link
            href={routes.profileSettings}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-(--orange-light) hover:text-(--orange)"
          >
            {t("settings")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              requestLogout();
            }}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
