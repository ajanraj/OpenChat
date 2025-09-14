"use client";

import { convexQuery } from "@convex-dev/react-query";
import { ClockIcon, XIcon } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Pill, PillIndicator } from "@/components/ui/pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type ExecutionHistoryDrawerProps = {
  trigger: React.ReactNode;
  taskId: Id<"scheduled_tasks">;
  taskTitle: string;
};

// Static constants for better performance
const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    indicator: "info" as const,
  },
  running: {
    label: "Running",
    indicator: "warning" as const,
  },
  success: {
    label: "Success",
    indicator: "success" as const,
  },
  failure: {
    label: "Failed",
    indicator: "error" as const,
  },
  cancelled: {
    label: "Cancelled",
    indicator: "info" as const,
  },
  timeout: {
    label: "Timeout",
    indicator: "warning" as const,
  },
} as const;

function ExecutionHistoryDrawerComponent({
  trigger,
  taskId,
  taskTitle,
}: ExecutionHistoryDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // Memoized query configuration
  const historyQueryConfig = useMemo(
    () => ({
      ...convexQuery(api.task_history.getTaskExecutionHistory, { taskId }),
      enabled: isOpen,
      gcTime: 5 * 60 * 1000, // 5 minutes
    }),
    [taskId, isOpen]
  );

  const statsQueryConfig = useMemo(
    () => ({
      ...convexQuery(api.task_history.getTaskExecutionStats, { taskId }),
      enabled: isOpen,
      gcTime: 5 * 60 * 1000, // 5 minutes
    }),
    [taskId, isOpen]
  );

  const { data: history = [], isLoading: isHistoryLoading } =
    useTanStackQuery(historyQueryConfig);
  const { data: stats, isLoading: isStatsLoading } =
    useTanStackQuery(statsQueryConfig);

  // Memoized formatters
  const formatTime = useMemo(() => {
    return (timestamp: number) => dayjs(timestamp).format("MMM D, h:mm a");
  }, []);

  const formatDuration = useMemo(() => {
    return (startTime: number, endTime?: number) => {
      if (!endTime) {
        return "Running...";
      }
      const duration = endTime - startTime;
      const seconds = Math.round(duration / 1000);
      if (seconds < 60) {
        return `${seconds}s`;
      }
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    };
  }, []);

  return (
    <Drawer onOpenChange={setIsOpen} open={isOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="flex-row items-center justify-between border-border border-b pb-4">
          <div className="flex-1">
            <DrawerTitle className="flex items-center gap-2 text-left">
              <ClockIcon className="h-5 w-5" />
              Execution History
            </DrawerTitle>
            <DrawerDescription className="text-left">
              {taskTitle}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              aria-label="Close"
              className="h-8 w-8"
              size="icon"
              variant="ghost"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="space-y-6 p-6">
          {/* Statistics Section - Mobile optimized grid */}
          {!isStatsLoading && stats && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4">
              <div className="text-center">
                <div className="font-semibold text-lg">
                  {stats.totalExecutions}
                </div>
                <div className="text-muted-foreground text-xs">Total Runs</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-green-600 text-lg">
                  {stats.successRate}%
                </div>
                <div className="text-muted-foreground text-xs">
                  Success Rate
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-green-600 text-lg">
                  {stats.successfulExecutions}
                </div>
                <div className="text-muted-foreground text-xs">Successful</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-red-600">
                  {stats.failedExecutions}
                </div>
                <div className="text-muted-foreground text-xs">Failed</div>
              </div>
            </div>
          )}

          {/* History List */}
          <div className="space-y-2">
            <h3 className="font-medium text-base">Recent Executions</h3>
            <ScrollArea className="h-[300px] w-full">
              {isHistoryLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      className="h-16 animate-pulse rounded-lg bg-muted/50"
                      // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items
                      key={i}
                    />
                  ))}
                </div>
              )}

              {!isHistoryLoading && history.length === 0 && (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  No execution history found for this task.
                </div>
              )}

              {!isHistoryLoading && history.length > 0 && (
                <div className="space-y-2">
                  {history.map((execution) => {
                    const statusConfig = STATUS_CONFIG[execution.status];
                    const duration = formatDuration(
                      execution.startTime,
                      execution.endTime
                    );

                    return (
                      <div
                        className="flex items-start justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/20"
                        key={execution._id}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Pill className="text-xs">
                              <PillIndicator variant={statusConfig.indicator} />
                              {statusConfig.label}
                            </Pill>
                          </div>
                          <div className="mt-4 text-muted-foreground text-xs">
                            Duration: {duration}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            Time: {formatTime(execution.startTime)}
                          </div>
                          {execution.metadata?.totalTokens !== undefined && (
                            <div className="text-muted-foreground text-xs">
                              Tokens:{" "}
                              {execution.metadata.totalTokens.toLocaleString()}
                            </div>
                          )}
                          {execution.errorMessage && (
                            <p className="text-destructive text-xs">
                              Error: {execution.errorMessage}
                            </p>
                          )}
                        </div>
                        <div className="ml-2 flex flex-col items-end gap-1">
                          {execution.chatId && (
                            <Button
                              className="h-7 text-xs"
                              onClick={() => {
                                router.push(`/c/${execution.chatId}`);
                                setIsOpen(false);
                              }}
                              size="sm"
                              variant="outline"
                            >
                              View Results
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Memoize ExecutionHistoryDrawer component
export const ExecutionHistoryDrawer = memo(
  ExecutionHistoryDrawerComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.taskId === nextProps.taskId &&
      prevProps.taskTitle === nextProps.taskTitle &&
      prevProps.trigger === nextProps.trigger
    );
  }
);
