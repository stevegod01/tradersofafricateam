import { InputHTMLAttributes } from "react";

import AuthInput from "@/features/auth/components/atoms/AuthInput/AuthInput";
import AuthLabel from "@/features/auth/components/atoms/AuthLabel/AuthLabel";
import AuthErrorText from "@/features/auth/components/atoms/AuthErrorText/AuthErrorText";

interface AuthFormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: React.ReactNode;
  optional?: boolean;
}

const AuthFormField = ({
  label,
  error,
  icon,
  optional,
  id,
  ...inputProps
}: AuthFormFieldProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <AuthLabel htmlFor={id as string} optional={optional}>
        {label}
      </AuthLabel>
      <AuthInput id={id} icon={icon} invalid={Boolean(error)} {...inputProps} />
      <AuthErrorText>{error}</AuthErrorText>
    </div>
  );
};

export default AuthFormField;
