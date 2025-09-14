"use client";

import { Info } from "@phosphor-icons/react";
import dayjs from "dayjs";
import calendar from "dayjs/plugin/calendar";
import isToday from "dayjs/plugin/isToday";
import isTomorrow from "dayjs/plugin/isTomorrow";
import React, { useCallback } from "react";
import { useUser } from "@/app/providers/user-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PREMIUM_CREDITS } from "@/lib/config";

dayjs.extend(calendar);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);

function MessageUsageCardComponent() {
  const { user, rateLimitStatus, hasPremium } = useUser();

  // Memoize the format date function
  const formatResetDate = useCallback(
    (timestamp: number | null | undefined) => {
      if (!timestamp) {
        return "Not available";
      }
      try {
        const resetDate = dayjs(timestamp);

        // Use dayjs calendar plugin with custom formats
        return resetDate.calendar(null, {
          sameDay: "[today at] h:mm A",
          nextDay: "[tomorrow at] h:mm A",
          nextWeek() {
            return resetDate.format("MMM D [at] h:mm A");
          },
          lastDay: "[yesterday at] h:mm A",
          lastWeek() {
            return resetDate.format("MMM D [at] h:mm A");
          },
          sameElse() {
            // Check if same year
            if (resetDate.year() === dayjs().year()) {
              return resetDate.format("MMM D [at] h:mm A");
            }
            return resetDate.format("MMM D, YYYY [at] h:mm A");
          },
        });
      } catch {
        return "Error calculating reset time";
      }
    },
    []
  );

  if (!(user && rateLimitStatus)) {
    return null;
  }

  // Use the appropriate reset timestamp based on premium status
  const resetTimestamp = hasPremium
    ? rateLimitStatus.monthlyReset
    : rateLimitStatus.dailyReset;
  const nextResetDateStr = formatResetDate(resetTimestamp);

  // Use rate limit status data
  const standardLimit = hasPremium
    ? rateLimitStatus.monthlyLimit
    : rateLimitStatus.dailyLimit;
  const standardCount = hasPremium
    ? rateLimitStatus.monthlyCount
    : rateLimitStatus.dailyCount;
  const standardRemaining = hasPremium
    ? rateLimitStatus.monthlyRemaining
    : rateLimitStatus.dailyRemaining;

  const premiumLimit = PREMIUM_CREDITS;
  // Use actual premium credits from rate limit status
  const premiumCount = rateLimitStatus.premiumCount || 0;
  const premiumRemaining = rateLimitStatus.premiumRemaining || premiumLimit;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-0.5 space-y-0">
        <CardTitle className="font-semibold text-sm">Message Usage</CardTitle>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-muted-foreground text-xs">
              Resets {nextResetDateStr}
            </p>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {resetTimestamp
                ? dayjs(resetTimestamp).format("M/D/YYYY, h:mm:ss A")
                : "Not available"}
            </p>
          </TooltipContent>
        </Tooltip>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Standard</span>
            <span>
              {standardCount} / {standardLimit}
            </span>
          </div>
          <Progress
            value={Math.min((standardCount / standardLimit) * 100, 100)}
          />
          <p className="mt-1 text-muted-foreground text-xs">
            {standardRemaining} messages remaining
          </p>
        </div>
        {hasPremium && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="flex items-center gap-1">
                Premium
                <Tooltip>
                  <TooltipTrigger>
                    <Info size={14} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Premium credits are used for Claude 4 Sonnet and Grok 3.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span>
                {premiumCount} / {premiumLimit}
              </span>
            </div>
            <Progress
              value={Math.min((premiumCount / premiumLimit) * 100, 100)}
            />
            <p className="mt-1 text-muted-foreground text-xs">
              {premiumRemaining} messages remaining
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Export memoized component to prevent unnecessary re-renders
export const MessageUsageCard = React.memo(MessageUsageCardComponent);
