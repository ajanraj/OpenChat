"use client";

import { lazy, Suspense, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type TaskDialogProps = {
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
  initialData?: Partial<CreateTaskForm> & { taskId?: Id<"scheduled_tasks"> };
  mode?: "create" | "edit";
};

export function TaskDialog({
  trigger,
  isOpen,
  onClose,
  initialData,
  mode = "create",
}: TaskDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // If using trigger mode (uncontrolled)
  if (trigger) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className="max-h-[90vh] max-w-2xl bg-background"
          hasCloseButton={false}
        >
          {" "}
          <div className="flex h-full max-h-[80vh] flex-col">
            <DialogHeader className="flex-row items-center justify-between border-border border-b px-6 py-4">
              <DialogTitle className="font-semibold text-base">
                {mode === "edit"
                  ? "Edit Scheduled Background Agent"
                  : "Create New Scheduled Background Agent"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {mode === "edit"
                  ? "Edit the settings and configuration for this scheduled background agent."
                  : "Create a new automated background agent that will run on a schedule."}
              </DialogDescription>
            </DialogHeader>

            <Suspense fallback={<FormLoadingSpinner />}>
              <TaskFormContent
                CloseWrapper={({ children }) => (
                  <DialogClose asChild>{children}</DialogClose>
                )}
                initialData={initialData}
                mode={mode}
                onCancel={() => {
                  /* handled by DialogClose wrapper */
                }}
                onSuccess={() => {
                  // Programmatically trigger the close button
                  closeRef.current?.click();
                }}
              />
            </Suspense>
            {/* Hidden close button for programmatic closing */}
            <DialogClose asChild>
              <button
                ref={closeRef}
                style={{ display: "none" }}
                type="button"
              />
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Controlled mode (existing behavior)
  return (
    <Dialog onOpenChange={(open) => !open && onClose?.()} open={isOpen}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl bg-background"
        hasCloseButton={false}
      >
        {" "}
        <div className="flex h-full max-h-[80vh] flex-col">
          <DialogHeader className="flex-row items-center justify-between border-border border-b px-6 py-4">
            <DialogTitle className="font-semibold text-base">
              {mode === "edit"
                ? "Edit Scheduled Background Agent"
                : "Create New Scheduled Background Agent"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {mode === "edit"
                ? "Edit the settings and configuration for this scheduled background agent."
                : "Create a new automated background agent that will run on a schedule."}
            </DialogDescription>
          </DialogHeader>

          <Suspense fallback={<FormLoadingSpinner />}>
            <TaskFormContent
              CloseWrapper={({ children }) => (
                <DialogClose asChild>{children}</DialogClose>
              )}
              initialData={initialData}
              mode={mode}
              onCancel={
                onClose ||
                (() => {
                  // No-op fallback
                })
              }
              onSuccess={() => {
                onClose?.();
              }}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
