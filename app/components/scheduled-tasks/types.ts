import type { Doc } from "@/convex/_generated/dataModel";

export type ScheduledTask = Doc<"scheduled_tasks">;

export type ScheduleType = "onetime" | "daily" | "weekly";

export type CreateTaskForm = {
  title: string;
  prompt: string;
  scheduleType: ScheduleType;
  scheduledTime: string;
  scheduledDate?: string; // For onetime tasks
  selectedDay?: number; // For weekly tasks (0-6, Sunday-Saturday)
  timezone: string;
  enableSearch?: boolean;
  enabledToolSlugs?: string[];
  emailNotifications?: boolean;
};

export type TaskStatus = "active" | "paused" | "archived" | "running";
