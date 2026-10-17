import { ConvexError } from "convex/values";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { ERROR_CODES } from "../../src/lib/error-codes";

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

/** The schedule fields stored on a scheduled task (a task document satisfies this type). */
export interface TaskSchedule {
  scheduleType: "onetime" | "daily" | "weekly";
  /** "HH:MM" for onetime/daily, "D:HH:MM" for weekly (D: 0 = Sunday ... 6 = Saturday). */
  scheduledTime: string;
  /** IANA time zone the wall-clock time is expressed in. */
  timezone: string;
  /** "YYYY-MM-DD", onetime tasks only. */
  scheduledDate?: string;
}

interface ParsedSchedule {
  /** Zero-padded "HH:MM" wall-clock time. */
  time: string;
  weekday?: number;
  date?: string;
}

// Hours may be unpadded to stay compatible with stored tasks (matches the client's TIME_24H_REGEX).
const TIME_PATTERN = /^(?<hour>[01]?\d|2[0-3]):(?<minute>[0-5]\d)$/u;
const WEEKLY_PATTERN =
  /^(?<weekday>[0-6]):(?<hour>[01]?\d|2[0-3]):(?<minute>[0-5]\d)$/u;
const DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

// Explicitly typed so TypeScript treats calls as never returning
const invalidInput: () => never = () => {
  throw new ConvexError(ERROR_CODES.INVALID_INPUT);
};

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    return Boolean(
      new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone
    );
  } catch {
    return false;
  }
};

const isCalendarDate = (date: string): boolean => {
  const groups = DATE_PATTERN.exec(date)?.groups;
  if (groups === undefined) {
    return false;
  }
  const [year, month, day] = [groups.year, groups.month, groups.day].map(
    Number
  );
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const parseSchedule = (schedule: TaskSchedule): ParsedSchedule => {
  if (!isValidTimeZone(schedule.timezone)) {
    invalidInput();
  }

  const weekly = schedule.scheduleType === "weekly";
  const groups = (weekly ? WEEKLY_PATTERN : TIME_PATTERN).exec(
    schedule.scheduledTime
  )?.groups;
  if (groups === undefined) {
    invalidInput();
  }
  const { hour, minute } = groups;
  const time = `${hour.padStart(2, "0")}:${minute}`;

  if (
    schedule.scheduleType === "onetime" &&
    schedule.scheduledDate !== undefined
  ) {
    if (!isCalendarDate(schedule.scheduledDate)) {
      invalidInput();
    }
    return { time, date: schedule.scheduledDate };
  }
  return { time, weekday: weekly ? Number(groups.weekday) : undefined };
};

/** Calendar date ("YYYY-MM-DD") of `timestamp` in `timeZone`, independent of the process zone. */
const zonedDate = (timestamp: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/** Pure calendar arithmetic on "YYYY-MM-DD" strings (no time zone involved). */
const addDays = (date: string, days: number): string =>
  dayjs.utc(date).add(days, "day").format("YYYY-MM-DD");

/**
 * Validates a task schedule, throwing `ConvexError(INVALID_INPUT)` for a malformed
 * time, date, or time zone. Use when storing a schedule without computing a run time.
 */
export const validateSchedule = (schedule: TaskSchedule): void => {
  parseSchedule(schedule);
};

/**
 * Returns the UTC timestamp of the task's next run, validating the schedule first.
 *
 * Recurring tasks return the first occurrence strictly after `now`, computed on the user's
 * local calendar: each candidate "date + HH:MM" is resolved with `dayjs.tz(string, tz)`, so the
 * wall-clock time and weekday hold across DST changes. Times skipped by a DST jump resolve to
 * the equivalent instant after the jump (02:30 -> 03:30). One-time tasks return their exact
 * moment even if it has passed (the scheduler then runs them immediately); legacy one-time
 * tasks without a date run tomorrow in the user's zone.
 *
 * Used by create, update, resume, and every recurring reschedule.
 */
export const calculateNextExecution = (
  schedule: TaskSchedule,
  now = Date.now()
): number => {
  const { time, weekday, date } = parseSchedule(schedule);
  const at = (day: string) =>
    dayjs.tz(`${day}T${time}`, schedule.timezone).valueOf();
  const today = zonedDate(now, schedule.timezone);

  if (schedule.scheduleType === "onetime") {
    return at(date ?? addDays(today, 1));
  }

  const step = schedule.scheduleType === "weekly" ? 7 : 1;
  let day =
    weekday === undefined
      ? today
      : addDays(today, (weekday - dayjs.utc(today).day() + 7) % 7);
  let next = at(day);
  while (next <= now) {
    day = addDays(day, step);
    next = at(day);
  }
  return next;
};
