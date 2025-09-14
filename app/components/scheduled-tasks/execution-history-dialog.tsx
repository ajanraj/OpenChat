"use client";

import { convexQuery } from "@convex-dev/react-query";
import { ClockIcon } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pill, PillIndicator } from "@/components/ui/pill";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type ExecutionHistoryDialogProps = {
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

function ExecutionHistoryDialogComponent({
  trigger,
  taskId,
  taskTitle,
}: ExecutionHistoryDialogProps) {
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
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClockIcon className="h-5 w-5" />
            Execution History: {taskTitle}
          </DialogTitle>
          <DialogDescription>
            View detailed execution history and statistics for this scheduled
            task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Statistics Section */}
          {!isStatsLoading && stats && (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 md:grid-cols-5">
              <div className="text-center">
                <div className="font-semibold text-2xl">
                  {stats.totalExecutions}
                </div>
                <div className="text-muted-foreground text-sm">Total Runs</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-2xl text-green-600">
                  {stats.successRate}%
                </div>
                <div className="text-muted-foreground text-sm">
                  Success Rate
                </div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-2xl text-green-600">
                  {stats.successfulExecutions}
                </div>
                <div className="text-muted-foreground text-sm">Successful</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-2xl text-red-600">
                  {stats.failedExecutions}
                </div>
                <div className="text-muted-foreground text-sm">Failed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-2xl text-orange-600">
                  {stats.runningExecutions}
                </div>
                <div className="text-muted-foreground text-sm">Running</div>
              </div>
            </div>
          )}

          {/* History List */}
          <div className="space-y-2">
            <h3 className="font-medium text-lg">Recent Executions</h3>
            <ScrollArea className="h-[400px] w-full">
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
                        className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/20"
                        key={execution._id}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Pill className="text-xs">
                              <PillIndicator variant={statusConfig.indicator} />
                              {statusConfig.label}
                            </Pill>
                            {execution.isManualTrigger && (
                              <Pill className="text-xs" variant="outline">
                                Manual
                              </Pill>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">
                              {formatTime(execution.startTime)}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              Duration: {duration}
                            </div>
                            {execution.metadata?.totalTokens !== undefined && (
                              <div className="text-muted-foreground text-xs">
                                Tokens:{" "}
                                {execution.metadata.totalTokens.toLocaleString()}
                              </div>
                            )}
                            {execution.errorMessage && (
                              <div className="mt-1 break-words text-red-600 text-xs">
                                Error: {execution.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {execution.chatId && (
                            <Button
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
      </DialogContent>
    </Dialog>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const ExecutionHistoryDialog = memo(
  ExecutionHistoryDialogComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.taskId === nextProps.taskId &&
      prevProps.taskTitle === nextProps.taskTitle &&
      prevProps.trigger === nextProps.trigger
    );
  }
);
