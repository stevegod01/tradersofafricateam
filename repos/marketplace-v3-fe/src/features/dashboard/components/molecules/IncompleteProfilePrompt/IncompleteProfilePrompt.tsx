import { UserRoundPen } from "lucide-react";

const IncompleteProfilePrompt = ({
  title,
  description,
  actionLabel,
  onOpen,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onOpen: () => void;
}) => (
  <div className="flex flex-col gap-4 rounded-2xl border border-(--orange)/25 bg-(--orange-light)/45 p-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--orange) text-white">
        <UserRoundPen size={19} />
      </span>
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
    <button
      type="button"
      onClick={onOpen}
      className="h-10 shrink-0 rounded-xl bg-(--orange) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--orange-dark)"
    >
      {actionLabel}
    </button>
  </div>
);

export default IncompleteProfilePrompt;
