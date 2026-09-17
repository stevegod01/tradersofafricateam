"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";

import Logo from "@/components/atoms/Logo/Logo";
import SidebarSection from "@/features/dashboard/components/molecules/SidebarSection/SidebarSection";
import SellerPromoCard from "@/features/dashboard/components/molecules/SellerPromoCard/SellerPromoCard";
import SellerReviewStatusCard from "@/features/dashboard/components/molecules/SellerReviewStatusCard/SellerReviewStatusCard";
import { useStore } from "@/store/authStore";
import { DashboardNavSection } from "@/features/dashboard/types";

const BecomeSellerModal = dynamic(
  () =>
    import(
      "@/features/dashboard/components/organisms/BecomeSellerModal/BecomeSellerModal"
    ),
  { ssr: false },
);

const DashboardSidebar = ({
  sections,
  onNavigate,
  onClose,
}: {
  sections: DashboardNavSection[];
  onNavigate?: () => void;
  onClose?: () => void;
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const sellerStatus =
    useStore((state) => state.currentUser?.sellerVerificationStatus) ??
    "not_requested";

  const handleOpenModal = useCallback(() => setModalOpen(true), []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between px-3.5 pb-6">
        <Logo />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-1">
        {sections.map((section) => (
          <SidebarSection
            key={section.label}
            section={section}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {sellerStatus !== "approved" && (
        <div className="p-3.5">
          {sellerStatus === "pending" ? (
            <SellerReviewStatusCard />
          ) : (
            <SellerPromoCard onOpen={handleOpenModal} />
          )}
        </div>
      )}

      <BecomeSellerModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
};

export default DashboardSidebar;
