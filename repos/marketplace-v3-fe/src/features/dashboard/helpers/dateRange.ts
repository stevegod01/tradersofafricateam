import type { BuyerAnalyticsDateRange } from "@/features/dashboard/types";

export const formatApiDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseApiDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getCurrentMonthRange = (today = new Date()): BuyerAnalyticsDateRange => ({
  dateFrom: formatApiDate(new Date(today.getFullYear(), today.getMonth(), 1)),
  dateTo: formatApiDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
});

export const getTrailingDayRange = (
  days: number,
  today = new Date(),
): BuyerAnalyticsDateRange => {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  from.setDate(from.getDate() - (days - 1));
  return { dateFrom: formatApiDate(from), dateTo: formatApiDate(today) };
};

export const getCalendarDays = (visibleMonth: Date) => {
  const firstDay = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

export const getLocalizedWeekDays = (locale: string) => {
  const sunday = new Date(2026, 0, 4);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + index);
    return formatter.format(day);
  });
};
