"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { Globe, MapPin, Package, ShieldCheck, TrendingUp } from "lucide-react";

import DotPattern from "@/components/atoms/DotPattern/DotPattern";

const PINS = [
  { top: "18%", left: "48%", delay: 0 },
  { top: "42%", left: "74%", delay: 0.6 },
  { top: "66%", left: "40%", delay: 1.2 },
  { top: "38%", left: "24%", delay: 1.8 },
];

const ROUTES = [
  "M 130 90 Q 210 60 280 155",
  "M 280 155 Q 260 230 150 205",
  "M 150 205 Q 90 150 130 90",
];

const TradeShowcase = ({
  badge,
  title,
  subtitle,
}: {
  badge: string;
  title: string;
  subtitle: string;
}) => {
  const t = useTranslations("Auth.signUp");
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex h-full w-full flex-col justify-end overflow-hidden bg-linear-to-br from-(--orange) via-(--orange-dark) to-(--brown) px-10 py-12">
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-16 size-80 rounded-full bg-black/15 blur-3xl"
      />
      <DotPattern
        count={9}
        columns={3}
        color="orange"
        className="right-8 bottom-40 opacity-20 [&>span]:bg-white"
      />

      <div className="relative mx-auto mb-6 aspect-square w-full max-w-90 shrink-0">
        <motion.svg
          viewBox="0 0 400 400"
          className="absolute inset-0 h-full w-full"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="200"
            cy="200"
            r="150"
            stroke="white"
            strokeOpacity="0.18"
            strokeWidth="1"
            fill="none"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="150"
            ry="55"
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="1"
            fill="none"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="150"
            ry="55"
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="1"
            fill="none"
            transform="rotate(60 200 200)"
          />
          <ellipse
            cx="200"
            cy="200"
            rx="150"
            ry="55"
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="1"
            fill="none"
            transform="rotate(120 200 200)"
          />
        </motion.svg>

        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
          {ROUTES.map((d, index) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeDasharray="2 8"
              strokeLinecap="round"
              strokeOpacity="0.55"
              initial={{ strokeDashoffset: 0 }}
              animate={reduceMotion ? undefined : { strokeDashoffset: -40 }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
                delay: index * 0.4,
              }}
            />
          ))}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Globe className="size-8 text-white" strokeWidth={1.5} />
          </div>
        </div>

        {PINS.map((pin, index) => (
          <div
            key={index}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: pin.top, left: pin.left }}
          >
            <span className="relative flex size-2.5">
              {!reduceMotion && (
                <motion.span
                  className="absolute inline-flex size-full rounded-full bg-white"
                  animate={{ scale: [1, 2.4], opacity: [0.6, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: pin.delay,
                    ease: "easeOut",
                  }}
                />
              )}
              <span className="relative inline-flex size-2.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" />
            </span>
          </div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: [0, -6, 0] }}
          transition={{
            opacity: { duration: 0.5, delay: 0.3 },
            y: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.3 },
          }}
          className="absolute top-2 -left-2 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white shadow-lg backdrop-blur-md sm:-left-6"
        >
          <Package size={16} />
          <div className="leading-tight">
            <p className="text-xs font-bold">12,000+</p>
            <p className="text-[10px] text-white/75">
              {t("showcase.suppliers")}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: [0, -6, 0] }}
          transition={{
            opacity: { duration: 0.5, delay: 0.5 },
            y: {
              duration: 4.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.8,
            },
          }}
          className="absolute top-1/3 -right-2 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white shadow-lg backdrop-blur-md sm:-right-8"
        >
          <MapPin size={16} />
          <div className="leading-tight">
            <p className="text-xs font-bold">40+</p>
            <p className="text-[10px] text-white/75">
              {t("showcase.countries")}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: [0, -6, 0] }}
          transition={{
            opacity: { duration: 0.5, delay: 0.7 },
            y: {
              duration: 5.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1.1,
            },
          }}
          className="absolute bottom-4 left-1/4 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white shadow-lg backdrop-blur-md"
        >
          <TrendingUp size={16} />
          <div className="leading-tight">
            <p className="text-xs font-bold">$2.3M+</p>
            <p className="text-[10px] text-white/75">{t("showcase.volume")}</p>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative flex flex-col gap-3"
      >
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <ShieldCheck size={13} />
          {badge}
        </span>
        <h2 className="heading-font text-2xl leading-tight font-bold text-white sm:text-3xl">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-white/80">{subtitle}</p>
      </motion.div>
    </div>
  );
};

export default TradeShowcase;
