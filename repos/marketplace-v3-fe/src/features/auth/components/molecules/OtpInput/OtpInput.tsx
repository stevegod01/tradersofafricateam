"use client";

import { ClipboardEvent, KeyboardEvent, useRef } from "react";

import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;

const OtpInput = ({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label: string;
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, index) => value[index] ?? "");

  const updateDigit = (index: number, digit: string) => {
    const next = [...digits];
    next[index] = digit.slice(-1);
    onChange(next.join(""));
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={invalid}>
      <legend className="mb-1 text-sm font-semibold text-foreground">{label}</legend>
      <div className="grid grid-cols-6 gap-2 sm:gap-3" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => { inputRefs.current[index] = element; }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            aria-label={`${label} ${index + 1}`}
            aria-invalid={invalid}
            onChange={(event) => updateDigit(index, event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={cn(
              "aspect-square min-w-0 rounded-xl border border-border bg-background text-center text-lg font-bold text-foreground outline-none transition-all",
              "focus:border-(--orange) focus:ring-4 focus:ring-(--orange)/12",
              invalid && "border-destructive focus:ring-destructive/15",
            )}
          />
        ))}
      </div>
    </fieldset>
  );
};

export default OtpInput;
