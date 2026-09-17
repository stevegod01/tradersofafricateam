"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";

import { useLogout } from "@/features/auth/hooks/useLogout";
import { useStore } from "@/store/authStore";

const LogoutConfirmDialog = () => {
  const t = useTranslations("Nav.logoutConfirm");
  const open = useStore((state) => state.isLogoutConfirmOpen);
  const closeLogoutConfirm = useStore((state) => state.closeLogoutConfirm);
  const { logout, logoutAllDevices, isProcessing } = useLogout();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !next && closeLogoutConfirm()}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Title className="heading-font text-lg font-bold text-foreground">
            {t("title")}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
            {t("description")}
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => logout()}
              disabled={isProcessing}
              className="h-11 w-full rounded-xl bg-(--orange) text-sm font-semibold text-white transition-colors duration-200 hover:bg-(--orange-dark) disabled:pointer-events-none disabled:opacity-60"
            >
              {t("confirm")}
            </button>
            <Dialog.Close
              disabled={isProcessing}
              className="h-11 w-full rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
            >
              {t("cancel")}
            </Dialog.Close>
            <button
              type="button"
              onClick={() => logoutAllDevices()}
              disabled={isProcessing}
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60"
            >
              {t("confirmAllDevices")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default LogoutConfirmDialog;
