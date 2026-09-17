"use client";

import { useCallback, useState } from "react";

import { formatApiDate, parseApiDate } from "@/features/dashboard/helpers/dateRange";
import type { BuyerAnalyticsDateRange } from "@/features/dashboard/types";

export const useAnalyticsDateRangePicker = (
  value: BuyerAnalyticsDateRange,
  onChange: (value: BuyerAnalyticsDateRange) => void,
) => {
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.dateFrom);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const from = parseApiDate(value.dateFrom);
    return new Date(from.getFullYear(), from.getMonth(), 1);
  });

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    setDraftFrom(value.dateFrom);
    setSelectingEnd(false);
    setOpen((current) => !current);
  };

  const selectDay = (day: Date) => {
    const selected = formatApiDate(day);
    if (!selectingEnd) {
      setDraftFrom(selected);
      setSelectingEnd(true);
      return;
    }

    const next =
      selected < draftFrom
        ? { dateFrom: selected, dateTo: draftFrom }
        : { dateFrom: draftFrom, dateTo: selected };
    onChange(next);
    setDraftFrom(next.dateFrom);
    setSelectingEnd(false);
    close();
  };

  const applyPreset = (range: BuyerAnalyticsDateRange) => {
    const from = parseApiDate(range.dateFrom);
    onChange(range);
    setDraftFrom(range.dateFrom);
    setSelectingEnd(false);
    setVisibleMonth(new Date(from.getFullYear(), from.getMonth(), 1));
    close();
  };

  const showPreviousMonth = () =>
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1),
    );
  const showNextMonth = () =>
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1),
    );

  return {
    open,
    close,
    toggle,
    selectingEnd,
    draftFrom,
    visibleMonth,
    selectDay,
    applyPreset,
    showPreviousMonth,
    showNextMonth,
  };
};
