"use client";

import { InputHTMLAttributes, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import AuthInput from "@/features/auth/components/atoms/AuthInput/AuthInput";
import AuthLabel from "@/features/auth/components/atoms/AuthLabel/AuthLabel";
import AuthErrorText from "@/features/auth/components/atoms/AuthErrorText/AuthErrorText";

interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const PasswordField = ({ label, error, id, ...inputProps }: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <AuthLabel htmlFor={id as string}>{label}</AuthLabel>
      <AuthInput
        id={id}
        type={visible ? "text" : "password"}
        icon={<Lock size={16} />}
        invalid={Boolean(error)}
        endAdornment={
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            tabIndex={-1}
            aria-label={visible ? "Hide password" : "Show password"}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
        {...inputProps}
      />
      <AuthErrorText>{error}</AuthErrorText>
    </div>
  );
};

export default PasswordField;
