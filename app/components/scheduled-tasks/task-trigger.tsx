"use client";

import type { ReactNode } from "react";
import { cloneElement, isValidElement, memo } from "react";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskDialog } from "./task-dialog";
import { TaskDrawer } from "./task-drawer";
import type { CreateTaskForm } from "./types";

// Minimal common props many interactive triggers support
type CommonTriggerProps = {
  disabled?: boolean;
  "aria-disabled"?: boolean;
  className?: string;
  tabIndex?: number;
  onClick?: (e: React.MouseEvent) => void;
};

type TaskTriggerProps = {
  trigger: ReactNode;
  initialData?: Partial<CreateTaskForm> & { taskId?: Id<"scheduled_tasks"> };
  mode?: "create" | "edit";
  disabled?: boolean;
};

function TaskTriggerComponent({
  trigger,
  initialData,
  mode = "create",
  disabled = false,
}: TaskTriggerProps) {
  const isMobileOrTablet = useBreakpoint(896); // Same breakpoint as settings

  // If disabled, render a non-interactive trigger with clear disabled semantics
  if (disabled) {
    if (isValidElement<CommonTriggerProps>(trigger)) {
      const t = trigger;
      return cloneElement(t, {
        disabled: true,
        "aria-disabled": true,
        tabIndex: -1,
        // Visually and interactively indicate disabled (Tailwind)
        className: [t.props.className, "pointer-events-none opacity-50"]
          .filter(Boolean)
          .join(" "),
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
        },
      });
    }
    // Fallback for non-elements
    return <>{trigger}</>;
  }

  if (isMobileOrTablet) {
    return (
      <TaskDrawer initialData={initialData} mode={mode} trigger={trigger} />
    );
  }

  return <TaskDialog initialData={initialData} mode={mode} trigger={trigger} />;
}

// Memoize TaskTrigger component to prevent unnecessary re-renders
// Only re-render when trigger prop changes
export const TaskTrigger = memo(TaskTriggerComponent);
