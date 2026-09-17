"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { useAboutUs } from "@/lib/hooks/useAboutUs";
import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { useStore } from "@/store/authStore";
import { useRequestLogout } from "@/features/auth/hooks/useLogout";

import { motion } from "framer-motion";
import { LogIn, User, UserPlus, X } from "lucide-react";

import Container from "@/components/atoms/Container/Container";
import MainSearchbar from "../MainSearchbar/MainSearchbar";

const Sidebar = ({ toggle }: { toggle: () => void }) => {
  const t = useTranslations("Nav");

  const { aboutItems } = useAboutUs();
  const { routes } = useGetAllRoutes();
  const { requestLogout } = useRequestLogout();

  const isUserSignedIn = Boolean(useStore((state) => state.currentUser));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggle();
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [toggle]);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <motion.button
        type="button"
        aria-label={t("closeMenu")}
        onClick={toggle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={t("menu")}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="absolute inset-y-0 right-0 h-dvh w-[min(24rem,90vw)] overflow-y-auto border-l border-border bg-background shadow-xl"
      >
        <Container>
          <div className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">{t("menu")}</p>
              <button
                type="button"
                onClick={toggle}
                aria-label={t("closeMenu")}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>
            <div className="pb-6">
              <MainSearchbar />
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 pt-2 pb-1">
                {t("about.label")}
              </p>
              {aboutItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={toggle}
                  className="px-3 py-2.5 rounded-lg text-sm hover:bg-(--orange-light) hover:text-(--orange) font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              <div className="border-t border-slate-100 my-2" />
              <Link
                href={routes?.becomeSeller}
                onClick={toggle}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-(--orange-light) hover:text-(--orange) font-medium transition-colors"
              >
                {t("sellOnTofa")}
              </Link>
              {isUserSignedIn ? (
                <Link
                  href={routes?.dashboard}
                  onClick={toggle}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-(--orange-light) hover:text-(--orange) font-medium transition-colors"
                >
                  <User size={16} /> {t("dashboard")}
                </Link>
              ) : (
                <Link
                  href={routes?.login}
                  onClick={toggle}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-(--orange-light) hover:text-(--orange) font-medium transition-colors"
                >
                  <LogIn size={16} /> {t("login")}
                </Link>
              )}

              <div className="border-t border-slate-100 my-2" />

              {!isUserSignedIn ? (
                <Link
                  href={routes?.register}
                  onClick={toggle}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-(--orange) hover:bg-(--orange-dark) text-white font-semibold text-sm transition-colors"
                >
                  <UserPlus size={16} /> {t("join")}
                </Link>
              ) : (
                <button
                  onClick={() => {
                    toggle();
                    requestLogout();
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:text-red-700 text-red-500 font-medium transition-colors"
                >
                  <LogIn size={16} /> {t("logout")}
                </button>
              )}
            </div>
          </div>
        </Container>
      </motion.aside>
    </div>
  );
};

export default Sidebar;
