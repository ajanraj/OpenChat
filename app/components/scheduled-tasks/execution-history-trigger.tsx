"use client";

import { memo } from "react";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";
import type { Id } from "@/convex/_generated/dataModel";
import { ExecutionHistoryDialog } from "./execution-history-dialog";
import { ExecutionHistoryDrawer } from "./execution-history-drawer";

type ExecutionHistoryTriggerProps = {
  trigger: React.ReactNode;
  taskId: Id<"scheduled_tasks">;
  taskTitle: string;
};

function ExecutionHistoryTriggerComponent({
  trigger,
  taskId,
  taskTitle,
}: ExecutionHistoryTriggerProps) {
  const isMobile = useBreakpoint(896); // Use consistent breakpoint

  if (isMobile) {
    return (
      <ExecutionHistoryDrawer
        taskId={taskId}
        taskTitle={taskTitle}
        trigger={trigger}
      />
    );
  }

  return (
    <ExecutionHistoryDialog
      taskId={taskId}
      taskTitle={taskTitle}
      trigger={trigger}
    />
  );
}

// Memoize ExecutionHistoryTrigger component to prevent unnecessary re-renders
export const ExecutionHistoryTrigger = memo(ExecutionHistoryTriggerComponent);
