"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

import GoogleGlyph from "@/features/auth/components/atoms/GoogleGlyph/GoogleGlyph";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const GoogleAuthButton = ({
  label,
  onCredential,
  loading,
}: {
  label: string;
  onCredential: (credential: string) => void;
  loading?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const rendered = useRef(false);

  useEffect(() => {
    if (!scriptReady || !GOOGLE_CLIENT_ID || rendered.current) return;
    const container = containerRef.current;
    if (!container || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => onCredential(response.credential),
    });

    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      logo_alignment: "center",
      width: container.clientWidth || 360,
    });

    rendered.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  return (
    <div className="relative">
      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
        />
      )}

      {GOOGLE_CLIENT_ID ? (
        <div
          ref={containerRef}
          className="flex h-12 w-full items-center justify-center overflow-hidden"
        />
      ) : (
        <button
          type="button"
          disabled
          title="Google sign-in is not configured"
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-muted-foreground opacity-70"
        >
          <GoogleGlyph />
          {label}
        </button>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
          <Loader2 size={18} className="animate-spin text-(--orange)" />
        </div>
      )}
    </div>
  );
};

export default GoogleAuthButton;
