"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";

import AuthSubmitButton from "@/features/auth/components/atoms/AuthSubmitButton/AuthSubmitButton";

const TermsPromptModal = ({
  open,
  onAccept,
  onDecline,
  isPending,
}: {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}) => {
  const t = useTranslations("Auth.termsModal");

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onDecline()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-(--orange-light) text-(--orange)">
              <ShieldCheck size={26} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="heading-font text-lg font-bold text-foreground">
                {t("title")}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {t("description")}
              </Dialog.Description>
            </div>

            <div className="flex w-full flex-col gap-2.5 pt-2">
              <AuthSubmitButton
                type="button"
                onClick={onAccept}
                loading={isPending}
              >
                {t("accept")}
              </AuthSubmitButton>
              <button
                type="button"
                onClick={onDecline}
                disabled={isPending}
                className="h-12 w-full rounded-xl border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              >
                {t("decline")}
              </button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TermsPromptModal;
