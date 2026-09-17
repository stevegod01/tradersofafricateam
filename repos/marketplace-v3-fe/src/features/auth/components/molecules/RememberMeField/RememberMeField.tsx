import AuthCheckbox from "@/features/auth/components/atoms/AuthCheckbox/AuthCheckbox";

const RememberMeField = ({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) => {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <AuthCheckbox
        id="rememberMe"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <span className="text-sm text-muted-foreground select-none">
        {label}
      </span>
    </label>
  );
};

export default RememberMeField;
