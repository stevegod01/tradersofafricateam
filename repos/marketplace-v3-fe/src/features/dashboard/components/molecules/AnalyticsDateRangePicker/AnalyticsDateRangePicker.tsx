"use client";

import { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  formatApiDate,
  getCalendarDays,
  getCurrentMonthRange,
  getLocalizedWeekDays,
  getTrailingDayRange,
  parseApiDate,
} from "@/features/dashboard/helpers/dateRange";
import AnalyticsCalendarDay from "@/features/dashboard/components/atoms/AnalyticsCalendarDay/AnalyticsCalendarDay";
import AnalyticsDatePresetButton from "@/features/dashboard/components/atoms/AnalyticsDatePresetButton/AnalyticsDatePresetButton";
import { useAnalyticsDateRangePicker } from "@/features/dashboard/hooks/useAnalyticsDateRangePicker";
import type { BuyerAnalyticsDateRange } from "@/features/dashboard/types";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

const AnalyticsDateRangePicker = ({
  value,
  onChange,
}: {
  value: BuyerAnalyticsDateRange;
  onChange: (value: BuyerAnalyticsDateRange) => void;
}) => {
  const t = useTranslations("Dashboard.overview.dateRange");
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const picker = useAnalyticsDateRangePicker(value, onChange);
  useClickOutside(containerRef, picker.close);

  const calendarDays = useMemo(
    () => getCalendarDays(picker.visibleMonth),
    [picker.visibleMonth],
  );
  const weekDays = useMemo(() => getLocalizedWeekDays(locale), [locale]);
  const displayDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );
  const displayDate = (date: string) =>
    displayDateFormatter.format(parseApiDate(date));

  return (
    <div ref={containerRef} className="relative z-30 w-full sm:w-auto">
      <button
        type="button"
        onClick={picker.toggle}
        aria-expanded={picker.open}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-background px-3.5 text-left shadow-sm transition hover:border-(--orange)/45 hover:shadow-md sm:w-auto"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--orange-light) text-(--orange)">
          <CalendarDays aria-hidden="true" size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{t("label")}</span>
          <span className="block truncate text-xs font-semibold text-foreground sm:text-sm">
            {displayDate(value.dateFrom)} <span className="px-1 text-muted-foreground">–</span> {displayDate(value.dateTo)}
          </span>
        </span>
      </button>

      <AnimatePresence>
        {picker.open && (
          <motion.div
            role="dialog"
            aria-label={t("label")}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-x-3 top-20 z-50 rounded-2xl border border-border bg-background p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:top-[calc(100%+0.6rem)] sm:right-0 sm:w-[22rem]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{t("title")}</p>
                <p className="text-xs text-muted-foreground">{picker.selectingEnd ? t("endHint") : t("startHint")}</p>
              </div>
              <button type="button" onClick={picker.close} aria-label={t("close")} className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
                <X aria-hidden="true" size={16} />
              </button>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <AnalyticsDatePresetButton label={t("last7Days")} onClick={() => picker.applyPreset(getTrailingDayRange(7))} />
              <AnalyticsDatePresetButton label={t("last30Days")} onClick={() => picker.applyPreset(getTrailingDayRange(30))} />
              <AnalyticsDatePresetButton label={t("thisMonth")} onClick={() => picker.applyPreset(getCurrentMonthRange())} />
            </div>

            <div className="flex items-center justify-between py-2">
              <button type="button" aria-label={t("previousMonth")} onClick={picker.showPreviousMonth} className="flex size-8 items-center justify-center rounded-full hover:bg-muted"><ChevronLeft aria-hidden="true" size={17} /></button>
              <p className="text-sm font-bold capitalize">{monthFormatter.format(picker.visibleMonth)}</p>
              <button type="button" aria-label={t("nextMonth")} onClick={picker.showNextMonth} className="flex size-8 items-center justify-center rounded-full hover:bg-muted"><ChevronRight aria-hidden="true" size={17} /></button>
            </div>

            <div className="grid grid-cols-7 text-center">
              {weekDays.map((day, index) => <span key={`${day}-${index}`} className="py-2 text-[10px] font-bold text-muted-foreground">{day}</span>)}
              {calendarDays.map((day) => {
                const date = formatApiDate(day);
                const outsideMonth = day.getMonth() !== picker.visibleMonth.getMonth();
                const selected = picker.selectingEnd
                  ? date === picker.draftFrom
                  : date === value.dateFrom || date === value.dateTo;
                const inRange = !picker.selectingEnd && date > value.dateFrom && date < value.dateTo;
                return (
                  <AnalyticsCalendarDay
                    key={date}
                    day={day.getDate()}
                    label={displayDate(date)}
                    outsideMonth={outsideMonth}
                    selected={selected}
                    inRange={inRange}
                    onSelect={() => picker.selectDay(day)}
                  />
                );
              })}
            </div>
            <div className="mt-3 rounded-xl bg-(--orange-light) px-3 py-2 text-center text-xs font-semibold text-(--orange-dark)">
              {picker.selectingEnd ? t("chooseEnd") : `${value.dateFrom} → ${value.dateTo}`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnalyticsDateRangePicker;
