"use client";

import { XIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreateTaskForm } from "./types";

// Lazy load TaskFormContent for better performance
const TaskFormContent = lazy(() =>
  import("./task-form").then((module) => ({ default: module.TaskFormContent }))
);

// Loading component for Suspense
const FormLoadingSpinner = () => (
  <div className="flex h-32 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
  </div>
);

type SharedDrawerContentProps = {
  mode: "create" | "edit";
  initialData?: Partial<CreateTaskForm> & { taskId?: Id<"scheduled_tasks"> };
  onClose: () => void;
};

// Extracted shared drawer content component
function SharedDrawerContent({
  mode,
  initialData,
  onClose,
}: SharedDrawerContentProps) {
  return (
    <DrawerContent className="max-h-[90vh]">
      <div className="flex h-full max-h-[80vh] flex-col pb-6">
        <DrawerHeader className="flex-row items-center justify-between border-border border-b px-6 py-4">
          <DrawerTitle className="font-semibold text-base">
            {mode === "edit"
              ? "Edit Scheduled Background Agent"
              : "Create New Scheduled Background Agent"}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {mode === "edit"
              ? "Edit the settings and configuration for this scheduled background agent."
              : "Create a new automated background agent that will run on a schedule."}
          </DrawerDescription>
          <DrawerClose asChild>
            <button
              aria-label="Close dialog"
              className="flex size-11 items-center justify-center rounded-full hover:bg-muted focus:outline-none"
              type="button"
            >
              <XIcon className="size-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <Suspense fallback={<FormLoadingSpinner />}>
          <TaskFormContent
            CloseWrapper={({ children }) => (
              <DrawerClose asChild>{children}</DrawerClose>
            )}
            initialData={initialData}
            mode={mode}
            onCancel={onClose}
            onSuccess={onClose}
          />
        </Suspense>
      </div>
    </DrawerContent>
  );
}

type TaskDrawerProps = {
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  initialData?: Partial<CreateTaskForm> & { taskId?: Id<"scheduled_tasks"> };
  mode?: "create" | "edit";
};

export function TaskDrawer({
  trigger,
  isOpen,
  onClose,
  initialData,
  mode = "create",
}: TaskDrawerProps) {
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = useState(false);

  // Determine if we're in controlled or uncontrolled mode
  const isControlled = isOpen !== undefined;
  const open = isControlled ? isOpen : internalOpen;
  const handleClose = () => {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      if (!newOpen) {
        onClose?.();
      }
    } else {
      setInternalOpen(newOpen);
    }
  };

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <SharedDrawerContent
        initialData={initialData}
        mode={mode}
        onClose={handleClose}
      />
    </Drawer>
  );
}
