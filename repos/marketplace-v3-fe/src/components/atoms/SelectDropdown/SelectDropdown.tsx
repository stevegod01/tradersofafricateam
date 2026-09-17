"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

import { SelectDropdownProps } from "@/lib/types";
import { ChevronDown } from "lucide-react";

const SelectDropdown = ({
  trigger,
  options,
  onSelect,
  selected,
  align = "left",
}: SelectDropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-xs font-medium hover:text-(--orange) transition-colors duration-300 px-2 py-1 rounded-lg hover:bg-(--orange-light)"
        aria-expanded={open}
      >
        {trigger}
        <ChevronDown
          size={11}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1.5 w-44 bg-background rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ animation: "dropIn 0.18s ease" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-b border-muted last:border-0 ${
                selected === opt.value
                  ? "bg-(--orange-light) text-(--orange-dark) font-semibold"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.flag && <span className="text-base">{opt.flag}</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelectDropdown;
