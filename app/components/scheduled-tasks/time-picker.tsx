"use client";

import { CalendarIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { memo, useMemo } from "react";
import {
  convertTo24Hour,
  formatTime12Hour,
  getDayOptions,
} from "@/app/utils/time-utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Pre-generated time options for performance - 144 options (12 hours × 12 five-minute intervals)
const TIME_OPTIONS = (() => {
  const options: Array<{ value: string; label: string }> = [];
  // Generate hours in correct 12-hour order: 12, 1, 2, 3, ..., 11
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [
    "00",
    "05",
    "10",
    "15",
    "20",
    "25",
    "30",
    "35",
    "40",
    "45",
    "50",
    "55",
  ];

  for (const hour of hours) {
    for (const minute of minutes) {
      options.push({
        value: `${hour}:${minute}`,
        label: `${hour}:${minute}`,
      });
    }
  }
  return options;
})();

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  name: string;
  selectedDate?: Date;
  onDateChange?: (date: Date | undefined) => void;
  filterPastTimes?: boolean;
  showDatePicker?: boolean;
  selectedDay?: number;
  onDayChange?: (day: number) => void;
  showDayPicker?: boolean;
};

function TimePickerComponent({
  value,
  onChange,
  name,
  selectedDate,
  onDateChange,
  filterPastTimes = false,
  showDatePicker = false,
  selectedDay = 1,
  onDayChange,
  showDayPicker = false,
}: TimePickerProps) {
  const now = new Date();
  const isToday =
    selectedDate &&
    selectedDate.getDate() === now.getDate() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getFullYear() === now.getFullYear();

  // If filterPastTimes is true and no date is selected, assume today for filtering
  const shouldFilterPastTimes = filterPastTimes && (isToday || !selectedDate);

  // Enhanced past time filtering - also consider if selected date is in the past
  const isSelectedDateInPast =
    selectedDate && selectedDate < new Date(new Date().setHours(0, 0, 0, 0));
  const shouldDisableAllTimes = isSelectedDateInPast;

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Memoize filtered options based on current time if needed
  const getFilteredOptions = useMemo(() => {
    return (amPeriod: string) => {
      // If selected date is in the past, disable all times
      if (shouldDisableAllTimes) {
        return [];
      }

      if (!shouldFilterPastTimes) {
        return TIME_OPTIONS;
      }

      const currentAmPm = currentHour < 12 ? "AM" : "PM";

      // If current time is PM and we're showing AM options, all AM times are for tomorrow (valid)
      // If current time is AM and we're showing PM options, all PM times are for today (valid)
      if (amPeriod !== currentAmPm) {
        if (currentAmPm === "PM" && amPeriod === "AM") {
          return TIME_OPTIONS; // All AM times are for tomorrow
        }
        if (currentAmPm === "AM" && amPeriod === "PM") {
          return TIME_OPTIONS; // All PM times are for today
        }
      }

      // Same period, filter based on current time
      return TIME_OPTIONS.filter((option) => {
        const [hourStr, minuteStr] = option.value.split(":");
        const optionHour12 = Number.parseInt(hourStr, 10);
        const optionMinute = Number.parseInt(minuteStr, 10);

        // Convert option time to 24-hour format for proper comparison
        const optionHour24 = convertTo24Hour(optionHour12, amPeriod);
        const optionTimeInMinutes = optionHour24 * 60 + optionMinute;
        const currentTimeInMinutes = currentHour * 60 + currentMinute;

        return optionTimeInMinutes > currentTimeInMinutes;
      });
    };
  }, [
    shouldDisableAllTimes,
    shouldFilterPastTimes,
    currentHour,
    currentMinute,
  ]);

  const { hour12, minute, ampm } = formatTime12Hour(value || "09:00");

  // Memoize AM/PM options based on current time if needed
  const availableAmPmOptions = useMemo(() => {
    if (!shouldFilterPastTimes) {
      return ["AM", "PM"];
    }

    const currentAmPm = currentHour < 12 ? "AM" : "PM";

    // If current time is PM, only show PM (AM times have passed)
    if (currentAmPm === "PM") {
      return ["PM"];
    }

    // If current time is AM, show both AM and PM
    return ["AM", "PM"];
  }, [shouldFilterPastTimes, currentHour]);

  // Auto-correct AM/PM if current selection is not available
  const correctedAmPm = availableAmPmOptions.includes(ampm)
    ? ampm
    : availableAmPmOptions[0];
  const { hour12: correctedHour12, minute: correctedMinute } = formatTime12Hour(
    correctedAmPm !== ampm
      ? `${convertTo24Hour(Number.parseInt(hour12, 10), correctedAmPm).toString().padStart(2, "0")}:${minute}`
      : value || "09:00"
  );

  const currentHourMinute = `${correctedHour12}:${correctedMinute}`;
  const filteredHourMinuteOptions = getFilteredOptions(correctedAmPm);

  const handleHourMinuteChange = (newHourMinute: string) => {
    const [newHour, newMinute] = newHourMinute.split(":");
    const hour24 = convertTo24Hour(Number.parseInt(newHour, 10), correctedAmPm);
    const timeString = `${hour24.toString().padStart(2, "0")}:${newMinute}`;
    onChange(timeString);
  };

  const handleAmPmChange = (newAmPm: string) => {
    const hour24 = convertTo24Hour(
      Number.parseInt(correctedHour12, 10),
      newAmPm
    );
    const timeString = `${hour24.toString().padStart(2, "0")}:${correctedMinute}`;
    onChange(timeString);
  };

  return (
    <>
      <input name={name} type="hidden" value={value} />
      <div className="flex gap-2">
        <Select
          onValueChange={handleHourMinuteChange}
          value={currentHourMinute}
        >
          <SelectTrigger className="h-9 flex-1">
            <SelectValue placeholder="Time" />
          </SelectTrigger>
          <SelectContent className="z-[101] max-h-[200px]">
            {filteredHourMinuteOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={handleAmPmChange} value={correctedAmPm}>
          <SelectTrigger className="h-9 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[101]">
            {availableAmPmOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date Picker */}
        {showDatePicker && (
          <div className="flex-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className={cn(
                    "h-9 w-full justify-between border-input bg-transparent text-left font-normal shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    !selectedDate && "text-muted-foreground"
                  )}
                  size="sm"
                  variant="outline"
                >
                  {selectedDate ? (
                    dayjs(selectedDate).format("MMM D, YYYY")
                  ) : (
                    <span>Pick date</span>
                  )}
                  <CalendarIcon
                    className="ml-auto h-3 w-3 opacity-50"
                    weight="duotone"
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="z-[101] w-auto p-0">
                <Calendar
                  autoFocus
                  className="rounded-md"
                  disabled={(date) =>
                    date < new Date(new Date().setHours(0, 0, 0, 0))
                  }
                  mode="single"
                  onSelect={onDateChange}
                  selected={selectedDate}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Day Picker for Weekly Tasks */}
        {showDayPicker && (
          <div className="flex-1">
            <Select
              onValueChange={(dayValue) =>
                onDayChange?.(Number.parseInt(dayValue, 10))
              }
              value={selectedDay.toString()}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select day" />
              </SelectTrigger>
              <SelectContent className="z-[101]">
                {getDayOptions().map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value.toString()}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </>
  );
}

// Memoize TimePicker component to prevent unnecessary re-renders
export const TimePicker = memo(TimePickerComponent);
