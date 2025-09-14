// Helper functions for time conversion and formatting

// Regex for validating "HH:mm" time format (24-hour)
const TIME_24H_REGEX = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;

// Regex for validating strict "HH:MM" format (two-digit hours and minutes)
const TIME_STRICT_REGEX = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

export const convertTo12Hour = (hour24: number): number => {
  if (hour24 === 0) {
    return 12;
  }
  if (hour24 > 12) {
    return hour24 - 12;
  }
  return hour24;
};

export const convertTo24Hour = (hour12: number, ampm: string): number => {
  if (ampm === "AM") {
    return hour12 === 12 ? 0 : hour12;
  }
  return hour12 === 12 ? 12 : hour12 + 12;
};

// Return type interface for formatTime12Hour function
export type Time12HourFormat = {
  hour12: string;
  minute: string;
  ampm: "AM" | "PM";
};

export const formatTime12Hour = (time24: string): Time12HourFormat => {
  // Validate input format using regex - expects "HH:mm" format
  if (!TIME_24H_REGEX.test(time24)) {
    throw new Error(
      `Invalid time format. Expected "HH:mm" format, received: "${time24}"`
    );
  }

  const [hour, minute] = time24.split(":");
  const hour24 = Number.parseInt(hour, 10);

  // Additional validation for hour range (0-23)
  if (hour24 < 0 || hour24 > 23) {
    throw new Error(`Invalid hour value. Expected 0-23, received: ${hour24}`);
  }

  // Additional validation for minute range (0-59)
  const minuteValue = Number.parseInt(minute, 10);
  if (minuteValue < 0 || minuteValue > 59) {
    throw new Error(
      `Invalid minute value. Expected 0-59, received: ${minuteValue}`
    );
  }

  const hour12 = convertTo12Hour(hour24);
  const ampm: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";

  return {
    hour12: hour12.toString(),
    minute,
    ampm,
  };
};

export const formatNextRun = (
  date: Date | string,
  timezone: string
): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dateObj);
};

export const formatFrequency = (frequency: string, time: string): string => {
  switch (frequency) {
    case "daily": {
      const { hour12, minute, ampm } = formatTime12Hour(time);
      const displayTime = `${hour12}:${minute} ${ampm}`;
      return `Daily at ${displayTime}`;
    }
    case "weekly": {
      // For weekly tasks, time format is "day:HH:MM"
      const { day, time: timeOnly } = parseWeeklyTime(time);
      const { hour12, minute, ampm } = formatTime12Hour(timeOnly);
      const displayTime = `${hour12}:${minute} ${ampm}`;
      const dayName = getDayName(day);
      return `${dayName}s at ${displayTime}`;
    }
    case "monthly": {
      const { hour12, minute, ampm } = formatTime12Hour(time);
      const displayTime = `${hour12}:${minute} ${ampm}`;
      return `Monthly on the 1st at ${displayTime}`;
    }
    case "once": {
      const { hour12, minute, ampm } = formatTime12Hour(time);
      const displayTime = `${hour12}:${minute} ${ampm}`;
      return `Once at ${displayTime}`;
    }
    default: {
      const { hour12, minute, ampm } = formatTime12Hour(time);
      const displayTime = `${hour12}:${minute} ${ampm}`;
      return `${frequency} at ${displayTime}`;
    }
  }
};

export const formatRelativeTime = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  // Handle future dates (negative diff)
  const isFuture = diffInSeconds < 0;
  const absDiffInSeconds = Math.abs(diffInSeconds);

  if (absDiffInSeconds < 60) {
    return isFuture ? "In a moment" : "Just now";
  }
  if (absDiffInSeconds < 3600) {
    const minutes = Math.floor(absDiffInSeconds / 60);
    return isFuture ? `In ${minutes}m` : `${minutes}m ago`;
  }
  if (absDiffInSeconds < 86_400) {
    const hours = Math.floor(absDiffInSeconds / 3600);
    return isFuture ? `In ${hours}h` : `${hours}h ago`;
  }
  if (absDiffInSeconds < 604_800) {
    const days = Math.floor(absDiffInSeconds / 86_400);
    return isFuture ? `In ${days}d` : `${days}d ago`;
  }

  return dateObj.toLocaleDateString();
};

export const isTimeInPast = (time: string, selectedDate?: Date): boolean => {
  if (!selectedDate) {
    return false;
  }

  const [hours, minutes] = time.split(":").map(Number);
  const targetDateTime = new Date(selectedDate);
  targetDateTime.setHours(hours, minutes, 0, 0);

  return targetDateTime < new Date();
};

export const getNextAvailableTime = (): string => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Find the next 5-minute interval (always in the future)
  // Add 1 minute first to ensure we get the NEXT interval, then round up
  const nextMinuteTarget = currentMinute + 1;
  const roundedMinute = Math.ceil(nextMinuteTarget / 5) * 5;

  let nextHour = currentHour;
  let nextMinute = roundedMinute;

  // If rounded minute is 60 or more, move to next hour
  if (nextMinute >= 60) {
    nextHour++;
    nextMinute = 0;
  }

  // If we've gone past 23:59, it means next available time is tomorrow at 00:00
  if (nextHour >= 24) {
    nextHour = 0;
    nextMinute = 0;
  }

  return `${nextHour.toString().padStart(2, "0")}:${nextMinute.toString().padStart(2, "0")}`;
};

export const getNextAvailableDate = (): Date => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Calculate if the next available time would be tomorrow
  // Use same logic as getNextAvailableTime
  const nextMinuteTarget = currentMinute + 1;
  const roundedMinute = Math.ceil(nextMinuteTarget / 5) * 5;
  const nextHour = roundedMinute >= 60 ? currentHour + 1 : currentHour;

  // If next available time would be tomorrow (past 23:59), default to tomorrow
  if (nextHour >= 24) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  return now;
};

// Helper functions for weekly task time formatting
export const parseWeeklyTime = (
  scheduledTime: string
): { day: number; time: string } => {
  // Validate input is a string
  if (typeof scheduledTime !== "string") {
    throw new Error("scheduledTime must be a string");
  }

  const trimmedTime = scheduledTime.trim();
  if (!trimmedTime) {
    throw new Error("scheduledTime cannot be empty");
  }

  const parts = trimmedTime.split(":");

  if (parts.length === 3) {
    // Format is "day:HH:MM"
    const dayStr = parts[0];
    const hourStr = parts[1];
    const minuteStr = parts[2];

    // Validate day part
    const day = Number.parseInt(dayStr, 10);
    if (Number.isNaN(day) || day < 0 || day > 6) {
      throw new Error("Day must be a number between 0 and 6 (Sunday-Saturday)");
    }

    // Validate hour part
    const hour = Number.parseInt(hourStr, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23 || hourStr.length !== 2) {
      throw new Error(
        "Hour must be a valid two-digit number between 00 and 23"
      );
    }

    // Validate minute part
    const minute = Number.parseInt(minuteStr, 10);
    if (
      Number.isNaN(minute) ||
      minute < 0 ||
      minute > 59 ||
      minuteStr.length !== 2
    ) {
      throw new Error(
        "Minute must be a valid two-digit number between 00 and 59"
      );
    }

    const time = `${hourStr}:${minuteStr}`;
    return { day, time };
  }

  // Fallback for regular time format (HH:MM) - validate and default to Monday
  if (parts.length === 2) {
    const hourStr = parts[0];
    const minuteStr = parts[1];

    // Validate hour part
    const hour = Number.parseInt(hourStr, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23 || hourStr.length !== 2) {
      throw new Error(
        "Hour must be a valid two-digit number between 00 and 23"
      );
    }

    // Validate minute part
    const minute = Number.parseInt(minuteStr, 10);
    if (
      Number.isNaN(minute) ||
      minute < 0 ||
      minute > 59 ||
      minuteStr.length !== 2
    ) {
      throw new Error(
        "Minute must be a valid two-digit number between 00 and 59"
      );
    }

    return { day: 1, time: trimmedTime };
  }

  throw new Error('scheduledTime must be in format "day:HH:MM" or "HH:MM"');
};

export const formatWeeklyTime = (day: number, time: string): string => {
  // Validate day parameter
  if (typeof day !== "number") {
    throw new Error("day must be a number");
  }

  if (Number.isNaN(day) || day < 0 || day > 6 || !Number.isInteger(day)) {
    throw new Error("day must be an integer between 0 and 6 (Sunday-Saturday)");
  }

  // Validate time parameter
  if (typeof time !== "string") {
    throw new Error("time must be a string");
  }

  const trimmedTime = time.trim();
  if (!trimmedTime) {
    throw new Error("time cannot be empty");
  }

  // Validate time format (HH:MM)
  if (!TIME_STRICT_REGEX.test(trimmedTime)) {
    throw new Error(
      'time must be in format "HH:MM" with valid hours (00-23) and minutes (00-59)'
    );
  }

  // Format: "day:HH:MM" where day is 0-6 (Sunday-Saturday)
  return `${day}:${trimmedTime}`;
};

export const getDayName = (dayNumber: number): string => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dayNumber] || "Monday";
};

export const getDayOptions = (): Array<{ value: number; label: string }> => {
  return [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
  ];
};
