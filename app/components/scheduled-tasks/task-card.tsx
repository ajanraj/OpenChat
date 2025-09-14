"use client";

import {
  ArchiveIcon,
  ClockIcon,
  DotsThreeVerticalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RepeatOnceIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import dayjs from "dayjs";
import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pill, PillIndicator } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { ExecutionHistoryTrigger } from "./execution-history-trigger";
import { TaskTrigger } from "./task-trigger";
import type { ScheduledTask } from "./types";

// Static constants moved outside component for better performance
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SCHEDULE_TYPE_DISPLAY_MAP = {
  onetime: "One-time",
  daily: "Daily",
  weekly: "Weekly",
} as const;

type TaskCardProps = {
  task: ScheduledTask;
  isMobile?: boolean;
};

function TaskCardComponent({ task, isMobile = false }: TaskCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const deleteTask = useMutation(api.scheduled_tasks.deleteScheduledTask);
  const updateTask = useMutation(api.scheduled_tasks.updateScheduledTask);
  const triggerTask = useMutation(api.scheduled_tasks.triggerScheduledTask);

  const handleDelete = async () => {
    try {
      await deleteTask({ taskId: task._id });
      toast.success("Background Agent deleted successfully");
    } catch (_error) {
      toast.error("Failed to delete task");
    }
    setShowDeleteDialog(false);
  };

  const handlePauseResume = async () => {
    try {
      const newStatus = task.status === "active" ? "paused" : "active";
      await updateTask({
        taskId: task._id,
        status: newStatus,
      });
      toast.success(
        task.status === "active"
          ? "Background Agent paused"
          : "Background Agent resumed"
      );
    } catch (_error) {
      toast.error(
        `Failed to ${task.status === "active" ? "pause" : "resume"} task`
      );
    }
  };

  // const handleCopy = () => {
  //   navigator.clipboard.writeText(task.prompt);
  //   toast.success('Task prompt copied to clipboard');
  // };

  const handleTriggerNow = async () => {
    try {
      await triggerTask({ taskId: task._id });
      toast.success("Background Agent triggered successfully");
    } catch (_error) {
      toast.error("Failed to trigger task");
    }
  };

  // Memoized schedule display computation
  const scheduleDisplay = useMemo(() => {
    return (
      SCHEDULE_TYPE_DISPLAY_MAP[
        task.scheduleType as keyof typeof SCHEDULE_TYPE_DISPLAY_MAP
      ] || task.scheduleType
    );
  }, [task.scheduleType]);

  // Memoized weekly day computation
  const weeklyDay = useMemo(() => {
    if (task.scheduleType !== "weekly") {
      return null;
    }

    const parts = task.scheduledTime.split(":");
    if (parts.length < 3) {
      return null;
    }

    const dayNumber = Number.parseInt(parts[0], 10);
    return DAY_NAMES[dayNumber] || null;
  }, [task.scheduleType, task.scheduledTime]);

  // Memoized time formatting function
  const formatTime = useCallback((timestamp: number | undefined) => {
    if (!timestamp) {
      return "Never";
    }
    return dayjs(timestamp).format("MMM D, h:mm a");
  }, []);

  // Memoized next execution display
  const nextExecutionDisplay = useMemo(() => {
    switch (task.status) {
      case "active":
        return formatTime(task.nextExecution);
      case "running":
        return "Currently running";
      case "paused":
        return "Paused";
      case "archived":
        return "Archived";
      default:
        return "Unknown";
    }
  }, [task.status, task.nextExecution, formatTime]);

  // Memoized last execution display
  const lastExecutionDisplay = useMemo(() => {
    return formatTime(task.lastExecuted);
  }, [task.lastExecuted, formatTime]);

  // Memoized tooltip content
  const tooltipContent = useMemo(() => {
    switch (task.status) {
      case "active":
        return "Pause task";
      case "paused":
        return "Resume task";
      case "running":
        return "Background Agent is running";
      case "archived":
        return "Background Agent is archived";
      default:
        return "Unknown status";
    }
  }, [task.status]);

  // Memoized trigger tooltip content
  const triggerTooltipContent = useMemo(() => {
    switch (task.status) {
      case "running":
        return "Cannot trigger - task is running";
      case "paused":
        return "Cannot trigger - task is paused";
      default:
        return "Run task once now";
    }
  }, [task.status]);

  // Memoized archive handler
  const handleArchive = useCallback(async () => {
    try {
      await updateTask({
        taskId: task._id,
        status: "archived",
      });
      toast.success("Background Agent archived successfully");
    } catch (_error) {
      toast.error("Failed to archive task");
    }
  }, [updateTask, task._id]);

  // Memoized TaskDialog initialData to prevent recreating object on every render
  const taskDialogInitialData = useMemo(
    () => ({
      taskId: task._id,
      title: task.title,
      prompt: task.prompt,
      scheduleType: task.scheduleType,
      scheduledTime: task.scheduledTime,
      timezone: task.timezone,
      enableSearch: task.enableSearch,
      enabledToolSlugs: task.enabledToolSlugs,
      emailNotifications: task.emailNotifications,
    }),
    [
      task._id,
      task.title,
      task.prompt,
      task.scheduleType,
      task.scheduledTime,
      task.timezone,
      task.enableSearch,
      task.enabledToolSlugs,
      task.emailNotifications,
    ]
  );

  // Mobile layout component
  const mobileLayout = isMobile ? (
    // biome-ignore lint/a11y/useSemanticElements: <soh>
    <div
      aria-expanded={isExpanded}
      aria-label={`${task.title} task card${isExpanded ? ", expanded" : ", collapsed"}`}
      className="w-full cursor-pointer rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-sm"
      onClick={() => setIsExpanded(!isExpanded)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsExpanded(!isExpanded);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Mobile: Primary information always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <h3
                className={`font-medium text-lg leading-tight ${task.status === "active" || task.status === "running" ? "" : "opacity-60"}`}
              >
                {task.title}
              </h3>
              {/* Main status pill */}
              {task.status === "paused" && (
                <Pill className="text-xs" variant="outline">
                  <PillIndicator pulse={false} variant="warning" />
                  Paused
                </Pill>
              )}
              {task.status === "running" && (
                <Pill className="text-xs" variant="outline">
                  <PillIndicator pulse={true} variant="success" />
                  Running
                </Pill>
              )}
              {task.status === "archived" && (
                <Pill className="text-xs" variant="outline">
                  <PillIndicator pulse={false} variant="info" />
                  Archived
                </Pill>
              )}
            </div>

            {/* Primary info: Next run time */}
            <p className="text-muted-foreground text-sm">
              Next Run: {nextExecutionDisplay}
            </p>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2">
            {/* Primary action button - larger for touch */}
            <Button
              aria-label={
                task.status === "active" ? "Pause task" : "Resume task"
              }
              className="h-11 w-11"
              disabled={task.status === "running" || task.status === "archived"}
              onClick={(e) => {
                e.stopPropagation();
                handlePauseResume();
              }}
              size="icon"
              variant="ghost"
            >
              {task.status === "active" ? (
                <PauseIcon className="h-5 w-5" />
              ) : (
                <PlayIcon className="h-5 w-5" />
              )}
            </Button>

            {/* More actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="More task actions"
                  className="h-11 w-11"
                  onClick={(e) => e.stopPropagation()}
                  size="icon"
                  variant="ghost"
                >
                  <DotsThreeVerticalIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={
                    task.status === "archived" ||
                    task.status === "running" ||
                    task.status === "paused"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTriggerNow();
                  }}
                >
                  <RepeatOnceIcon className="mr-2 h-4 w-4" />
                  Run once now
                </DropdownMenuItem>
                <ExecutionHistoryTrigger
                  taskId={task._id}
                  taskTitle={task.title}
                  trigger={
                    <DropdownMenuItem
                      onClick={(e) => e.stopPropagation()}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <ClockIcon className="mr-2 h-4 w-4" />
                      View history
                    </DropdownMenuItem>
                  }
                />
                <TaskTrigger
                  disabled={
                    task.status === "archived" || task.status === "running"
                  }
                  initialData={taskDialogInitialData}
                  mode="edit"
                  trigger={
                    <DropdownMenuItem
                      disabled={
                        task.status === "archived" || task.status === "running"
                      }
                      onClick={(e) => e.stopPropagation()}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <PencilIcon className="mr-2 h-4 w-4" />
                      Edit task
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem
                  disabled={
                    task.status === "archived" || task.status === "running"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchive();
                  }}
                >
                  <ArchiveIcon className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={task.status === "running"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expandable secondary information */}
        {isExpanded && (
          <div className="mt-4 space-y-3 border-border/50 border-t pt-4">
            {/* Schedule and settings pills */}
            <div className="flex flex-wrap gap-2">
              <Pill className="text-xs" variant="outline">
                {scheduleDisplay}
              </Pill>
              {weeklyDay && (
                <Pill className="text-xs" variant="outline">
                  {weeklyDay}
                </Pill>
              )}
              {task.emailNotifications && (
                <Pill className="text-xs" variant="outline">
                  Email
                </Pill>
              )}
            </div>

            {/* Additional info */}
            <div className="space-y-1 text-muted-foreground text-sm">
              <p>Last Run: {lastExecutionDisplay}</p>
            </div>

            {/* View results link */}
            {task.lastExecuted && task.chatId && (
              <div className="pt-2">
                <Link
                  className="text-primary text-sm hover:underline"
                  href={`/c/${task.chatId}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  View Results
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Desktop layout (original)
  const desktopLayout = (
    <div className="group rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3
              className={`font-medium text-lg ${task.status === "active" || task.status === "running" ? "" : "opacity-60"}`}
            >
              {task.title}
            </h3>
            <Pill className="text-xs" variant="outline">
              {scheduleDisplay}
            </Pill>
            {weeklyDay && (
              <Pill className="text-xs" variant="outline">
                {weeklyDay}
              </Pill>
            )}
            {task.emailNotifications && (
              <Pill className="text-xs" variant="outline">
                Email
              </Pill>
            )}
            {task.status === "paused" && (
              <Pill className="text-xs" variant="outline">
                <PillIndicator pulse={false} variant="warning" />
                Paused
              </Pill>
            )}
            {task.status === "running" && (
              <Pill className="text-xs" variant="outline">
                <PillIndicator pulse={true} variant="success" />
                Running
              </Pill>
            )}
            {task.status === "archived" && (
              <Pill className="text-xs" variant="outline">
                <PillIndicator pulse={false} variant="info" />
                Archived
              </Pill>
            )}
          </div>

          <div className="mt-4 space-y-1 text-muted-foreground text-sm">
            <p>Next Run: {nextExecutionDisplay}</p>
            <p>Last Run: {lastExecutionDisplay}</p>
          </div>
        </div>

        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger
                asChild
                className={
                  task.status === "running" || task.status === "archived"
                    ? "cursor-not-allowed"
                    : ""
                }
              >
                <Button
                  aria-label={
                    task.status === "active" ? "Pause task" : "Resume task"
                  }
                  className="h-8 w-8"
                  disabled={
                    task.status === "running" || task.status === "archived"
                  }
                  onClick={handlePauseResume}
                  size="icon"
                  variant="ghost"
                >
                  {task.status === "active" ? (
                    <PauseIcon className="h-4 w-4" />
                  ) : (
                    <PlayIcon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltipContent}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                asChild
                className={
                  task.status === "archived" ||
                  task.status === "running" ||
                  task.status === "paused"
                    ? "cursor-not-allowed"
                    : ""
                }
              >
                <Button
                  aria-label="Run task once now"
                  className="h-8 w-8"
                  disabled={
                    task.status === "archived" ||
                    task.status === "running" ||
                    task.status === "paused"
                  }
                  onClick={handleTriggerNow}
                  size="icon"
                  variant="ghost"
                >
                  <RepeatOnceIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{triggerTooltipContent}</p>
              </TooltipContent>
            </Tooltip>

            <ExecutionHistoryTrigger
              taskId={task._id}
              taskTitle={task.title}
              trigger={
                <span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="View execution history"
                        className="h-8 w-8"
                        size="icon"
                        variant="ghost"
                      >
                        <ClockIcon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View execution history</p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              }
            />

            <TaskTrigger
              disabled={task.status === "archived" || task.status === "running"}
              initialData={taskDialogInitialData}
              mode="edit"
              trigger={
                <span
                  className={
                    task.status === "archived" || task.status === "running"
                      ? "cursor-not-allowed"
                      : ""
                  }
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Edit task"
                        className="h-8 w-8"
                        disabled={
                          task.status === "archived" ||
                          task.status === "running"
                        }
                        size="icon"
                        variant="ghost"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {task.status === "running"
                          ? "Cannot edit - task is running"
                          : "Edit task"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              }
            />

            <Tooltip>
              <TooltipTrigger
                asChild
                className={
                  task.status === "archived" || task.status === "running"
                    ? "cursor-not-allowed"
                    : ""
                }
              >
                <Button
                  aria-label="Archive task"
                  className="h-8 w-8"
                  disabled={
                    task.status === "archived" || task.status === "running"
                  }
                  onClick={handleArchive}
                  size="icon"
                  variant="ghost"
                >
                  <ArchiveIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {task.status === "running"
                    ? "Cannot archive - task is running"
                    : "Archive task"}
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Delete task"
                  className="h-8 w-8"
                  disabled={task.status === "running"}
                  onClick={() => setShowDeleteDialog(true)}
                  size="icon"
                  variant="ghost"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {task.status === "running"
                    ? "Cannot delete - task is running"
                    : "Delete task"}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-10 flex justify-end">
            {task.lastExecuted && task.chatId && (
              <Link
                className="text-primary text-xs hover:underline"
                href={`/c/${task.chatId}`}
              >
                View Results
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileLayout}
      {!isMobile && desktopLayout}

      {/* Shared dialogs/drawers for both mobile and desktop */}
      <Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scheduled task?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              scheduled task &quot;{task.title}&quot;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleDelete} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Memoize TaskCard component to prevent unnecessary re-renders
// Only re-render when task data actually changes
export const TaskCard = memo(TaskCardComponent, (prevProps, nextProps) => {
  const prevTask = prevProps.task;
  const nextTask = nextProps.task;

  // Deep comparison of relevant task properties
  return (
    prevProps.isMobile === nextProps.isMobile &&
    prevTask._id === nextTask._id &&
    prevTask.title === nextTask.title &&
    prevTask.status === nextTask.status &&
    prevTask.scheduleType === nextTask.scheduleType &&
    prevTask.scheduledTime === nextTask.scheduledTime &&
    prevTask.nextExecution === nextTask.nextExecution &&
    prevTask.lastExecuted === nextTask.lastExecuted &&
    prevTask.emailNotifications === nextTask.emailNotifications &&
    prevTask.chatId === nextTask.chatId &&
    prevTask.prompt === nextTask.prompt &&
    prevTask.timezone === nextTask.timezone &&
    prevTask.enableSearch === nextTask.enableSearch &&
    JSON.stringify(prevTask.enabledToolSlugs) ===
      JSON.stringify(nextTask.enabledToolSlugs)
  );
});
