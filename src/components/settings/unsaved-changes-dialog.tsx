import { useRef } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnsavedChangesDialogProps {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({ open, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const discardedRef = useRef(false);

  return (
    <AlertDialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          if (discardedRef.current) {
            discardedRef.current = false;
          } else {
            onCancel();
          }
        }
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to leave?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              discardedRef.current = true;
              onDiscard();
            }}
          >
            Leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
