"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import DashboardSidebar from "@/features/dashboard/components/organisms/DashboardSidebar/DashboardSidebar";
import DashboardTopbar from "@/features/dashboard/components/organisms/DashboardTopbar/DashboardTopbar";
import DashboardContainer from "@/features/dashboard/components/atoms/DashboardContainer/DashboardContainer";
import { DashboardNavSection } from "@/features/dashboard/types";

const DashboardLayout = ({
  sections,
  title,
  children,
}: {
  sections: DashboardNavSection[];
  title: string;
  children: React.ReactNode;
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
        <div className="sticky top-0 h-screen py-6">
          <DashboardSidebar sections={sections} />
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 cursor-default bg-black/40 lg:hidden"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 h-dvh w-[min(18rem,85vw)] overflow-y-auto bg-background py-6 shadow-xl lg:hidden"
            >
              <DashboardSidebar
                sections={sections}
                onNavigate={() => setMobileOpen(false)}
                onClose={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar title={title} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <DashboardContainer>{children}</DashboardContainer>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
