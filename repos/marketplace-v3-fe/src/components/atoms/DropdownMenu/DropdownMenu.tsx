"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { useClickOutside } from "@/lib/hooks/useClickOutside";

import { ChevronDown } from "lucide-react";

interface DropdownItem {
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "destructive";
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
}

const DropdownMenu = ({
  trigger,
  items,
  align = "left",
}: DropdownMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const itemClassName = (tone: DropdownItem["tone"]) =>
    `block w-full px-4 py-3 text-left text-sm font-medium transition-colors border-b border-muted last:border-0 ${
      tone === "destructive"
        ? "text-red-500 hover:bg-red-50"
        : "hover:bg-(--orange-light) hover:text-(--orange)"
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-sm font-medium hover:text-(--orange) transition-colors duration-300 py-1"
        aria-expanded={open}
      >
        {trigger}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 w-52 bg-background rounded-xl shadow-xl border border-border overflow-hidden z-50 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ animation: "dropIn 0.18s ease" }}
        >
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={itemClassName(item.tone)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={itemClassName(item.tone)}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;
