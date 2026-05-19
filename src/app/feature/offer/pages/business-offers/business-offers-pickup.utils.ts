import { PickupCalendarCell, PickupTimeFieldName } from './business-offers.models';

export interface BusinessOfferPickupDraft {
  baseDate: string;
  fromTime: string;
  toTime: string;
}

export interface BusinessOfferDateTimeLocalParts {
  date: string;
  time: string;
}

export function parseBusinessOfferDateTimeLocalParts(value: string): BusinessOfferDateTimeLocalParts {
  if (!value) {
    return { date: '', time: '' };
  }

  const [datePart = '', timePart = ''] = value.split('T');
  return { date: datePart, time: timePart.slice(0, 5) };
}

export function toBusinessOfferDateTimeLocalValue(value: string): string {
  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return '';
  }

  const localDate = new Date(parsedValue.getTime() - parsedValue.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function toBusinessOfferIsoString(value: string): string {
  return new Date(value).toISOString();
}

export function parseBusinessOfferDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  const parsedDate = new Date(year, monthIndex, day);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function formatBusinessOfferDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveBusinessOfferTodayDateString(referenceDate = new Date()): string {
  return formatBusinessOfferDateOnly(referenceDate);
}

export function resolveBusinessOfferStartOfMonthString(value: string, fallbackDate = new Date()): string {
  const parsedDate = parseBusinessOfferDateOnly(value) ?? fallbackDate;
  return formatBusinessOfferDateOnly(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
}

export function resolveBusinessOfferPickupCalendarDays(
  monthValue: string,
  selectedDate: string,
  todayDate: string,
): PickupCalendarCell[] {
  const monthDate = parseBusinessOfferDateOnly(monthValue);
  if (!monthDate) {
    return [];
  }

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthIndex = monthStart.getMonth();
  const firstWeekdayIndex = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekdayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    const value = formatBusinessOfferDateOnly(cellDate);

    return {
      date: value,
      dayOfMonth: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === monthIndex,
      isSelected: value === selectedDate,
      isToday: value === todayDate,
    };
  });
}

export function parseBusinessOfferTimeToMinutes(value: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function businessOfferPickupWindowRollsToNextDay(fromTime: string, toTime: string): boolean {
  const fromMinutes = parseBusinessOfferTimeToMinutes(fromTime);
  const toMinutes = parseBusinessOfferTimeToMinutes(toTime);

  if (fromMinutes === null || toMinutes === null) {
    return false;
  }

  return toMinutes < fromMinutes;
}

export function resolveBusinessOfferPickupWindowSummary(draft: BusinessOfferPickupDraft): string | null {
  const { baseDate, fromTime, toTime } = draft;

  if (!baseDate || !fromTime || !toTime) {
    return null;
  }

  const from = new Date(`${baseDate}T${fromTime}`);
  const toDate = businessOfferPickupWindowRollsToNextDay(fromTime, toTime)
    ? addDaysToBusinessOfferDateString(baseDate, 1)
    : baseDate;
  const to = new Date(`${toDate}T${toTime}`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }

  const sameDay = from.toDateString() === to.toDateString();
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (sameDay) {
    return `${dateFormatter.format(from)}, ${timeFormatter.format(from)} - ${timeFormatter.format(to)}`;
  }

  return `${dateFormatter.format(from)}, ${timeFormatter.format(from)} - ${dateFormatter.format(to)}, ${timeFormatter.format(to)}`;
}

export function resolveBusinessOfferPickupBaseDateLabel(value: string): string {
  if (!value) {
    return 'Choose pickup day';
  }

  const parsedDate = parseBusinessOfferDateOnly(value);
  if (!parsedDate) {
    return 'Choose pickup day';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate);
}

export function buildBusinessOfferPickupControlValues(
  draft: BusinessOfferPickupDraft,
): { pickupFromValue: string; pickupToValue: string } {
  const { baseDate, fromTime, toTime } = draft;
  const pickupFromValue = baseDate && fromTime ? `${baseDate}T${fromTime}` : '';
  const pickupToDate = businessOfferPickupWindowRollsToNextDay(fromTime, toTime)
    ? addDaysToBusinessOfferDateString(baseDate, 1)
    : baseDate;
  const pickupToValue = baseDate && toTime ? `${pickupToDate}T${toTime}` : '';

  return {
    pickupFromValue,
    pickupToValue,
  };
}

export function resolveBusinessOfferPickupTimePart(
  value: string,
  part: 'hour' | 'minute',
): string | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(':');
  return part === 'hour' ? hour : minute;
}

export function resolveBusinessOfferDefaultPickupTime(
  fieldName: PickupTimeFieldName,
  currentValue: string,
  relatedValue: string,
): string {
  if (currentValue) {
    return currentValue;
  }

  if (relatedValue) {
    return relatedValue;
  }

  return fieldName === 'pickupFrom' ? '10:00' : '12:00';
}

export function addDaysToBusinessOfferDateString(value: string, days: number): string {
  if (!value) {
    return value;
  }

  const parsedDate = parseBusinessOfferDateOnly(value);
  if (!parsedDate) {
    return value;
  }

  parsedDate.setDate(parsedDate.getDate() + days);
  return formatBusinessOfferDateOnly(parsedDate);
}
