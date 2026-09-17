import AuthCheckbox from "@/features/auth/components/atoms/AuthCheckbox/AuthCheckbox";
import AuthErrorText from "@/features/auth/components/atoms/AuthErrorText/AuthErrorText";

const TermsCheckboxField = ({
  checked,
  onCheckedChange,
  error,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-2.5">
        <AuthCheckbox
          id="termsOfUse"
          checked={checked}
          onCheckedChange={onCheckedChange}
          invalid={Boolean(error)}
        />
        <span className="text-sm leading-snug text-muted-foreground select-none">
          {children}
        </span>
      </label>
      <AuthErrorText>{error}</AuthErrorText>
    </div>
  );
};

export default TermsCheckboxField;
