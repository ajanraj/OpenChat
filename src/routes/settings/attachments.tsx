import { convexQuery } from "@convex-dev/react-query";
import { ArrowSquareOut, FileText, Trash } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/attachments")({
  component: AttachmentsSettingsPage,
});

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

export function AttachmentsSettingsPage() {
  const { data: rawAttachments } = useTanStackQuery({
    ...convexQuery(api.files.getAttachmentsForUser, {}),
  });

  const attachments = rawAttachments?.sort(
    (a, b) => new Date(b._creationTime).getTime() - new Date(a._creationTime).getTime(),
  );
  const deleteAttachments = useMutation(api.files.deleteAttachments);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"chat_attachments">>>(new Set());
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);
  const [showDeleteSingleDialog, setShowDeleteSingleDialog] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<Id<"chat_attachments"> | null>(null);

  const isSelected = (id: Id<"chat_attachments">) => selectedIds.has(id);
  const toggleSelect = (id: Id<"chat_attachments">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const selectAll = () => {
    if (!attachments) {
      return;
    }
    setSelectedIds(new Set(attachments.map((a) => a._id as Id<"chat_attachments">)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const deleteSelected = () => {
    if (selectedIds.size === 0) {
      return;
    }
    setShowDeleteSelectedDialog(true);
  };

  const confirmDeleteSelected = async () => {
    await deleteAttachments({ attachmentIds: Array.from(selectedIds) })
      .then(() => {
        toast({ title: "Selected attachments deleted", status: "success" });
        setSelectedIds(new Set());
      })
      .catch(() => {
        toast({ title: "Failed to delete some attachments", status: "error" });
      })
      .finally(() => {
        setShowDeleteSelectedDialog(false);
      });
  };

  const handleDelete = (attachmentId: Id<"chat_attachments">) => {
    setAttachmentToDelete(attachmentId);
    setShowDeleteSingleDialog(true);
  };

  const confirmDeleteSingle = async () => {
    if (!attachmentToDelete) {
      return;
    }
    await deleteAttachments({ attachmentIds: [attachmentToDelete] })
      .then(() => {
        toast({ title: "Attachment deleted", status: "success" });
      })
      .catch(() => {
        toast({ title: "Failed to delete attachment", status: "error" });
      })
      .finally(() => {
        setShowDeleteSingleDialog(false);
        setAttachmentToDelete(null);
      });
  };

  const totalSize = attachments?.reduce((acc, att) => acc + (att.fileSize ?? 0), 0);

  const renderAttachmentsList = () => {
    if (!attachments) {
      return (
        <div className="flex flex-col gap-3">
          {["skeleton-1", "skeleton-2", "skeleton-3"].map((skeletonId) => (
            <div className="flex items-center gap-4 rounded-xl border bg-card p-4" key={skeletonId}>
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </div>
          ))}
        </div>
      );
    }

    if (attachments.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border-2 border-muted-foreground/30 border-dashed">
            <FileText className="size-5 text-muted-foreground/60" />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-muted-foreground">No attachments</h3>
            <p className="max-w-sm text-muted-foreground/80 text-sm">
              Files you upload in chats will appear here for management.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {attachments.map((att) => {
          const selected = isSelected(att._id as Id<"chat_attachments">);
          return (
            <div
              className={cn(
                "group flex items-center gap-4 rounded-xl border bg-card p-4",
                "hover:border-border/80 hover:shadow-sm",
                selected && "border-primary/20 bg-primary/[0.02]",
              )}
              key={att._id}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={() => toggleSelect(att._id as Id<"chat_attachments">)}
              />
              {(att.fileType?.startsWith("image/") ?? false) && att.url ? (
                <div className="size-10 shrink-0 overflow-hidden rounded-lg border">
                  <img
                    alt={att.fileName ?? "attachment"}
                    className="size-full object-cover"
                    height={40}
                    src={att.url}
                    width={40}
                  />
                </div>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <a
                  className="flex items-center gap-1 truncate text-sm hover:text-primary"
                  href={att.url ?? undefined}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="truncate font-medium">{att.fileName ?? att.key}</span>
                  <ArrowSquareOut className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
                <span className="text-muted-foreground text-xs">
                  {att.fileType ?? "file"} · {formatBytes(att.fileSize ?? 0)}
                </span>
              </div>
              <Button
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(att._id as Id<"chat_attachments">)}
                size="icon"
                variant="ghost"
              >
                <Trash className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };
  const attachmentsList = renderAttachmentsList();

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">Attachments</h1>
          {Boolean(attachments && attachments.length > 0) && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
                {attachments?.length} file{attachments?.length === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
                {formatBytes(totalSize ?? 0)}
              </span>
            </div>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Manage your uploaded files and attachments. Deleting files here will remove them from the
          relevant chats but won't delete those chats.
        </p>
      </header>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-1.5 hover:bg-accent/25 has-aria-checked:border-primary/30 has-aria-checked:bg-primary/5">
            <Checkbox
              checked={Boolean(
                attachments && attachments.length > 0 && selectedIds.size === attachments.length,
              )}
              disabled={!attachments || attachments.length === 0}
              id="select-all"
              onCheckedChange={() => {
                if (
                  attachments &&
                  attachments.length > 0 &&
                  selectedIds.size === attachments.length
                ) {
                  clearSelection();
                } else {
                  selectAll();
                }
              }}
            />
            <span className="hidden font-medium text-sm sm:inline">Select All</span>
          </Label>
          {Boolean(selectedIds.size > 0) && (
            <Button onClick={clearSelection} size="sm" type="button" variant="secondary">
              Clear <span className="hidden sm:inline">Selection</span>
            </Button>
          )}
        </div>
        {Boolean(selectedIds.size > 0) && (
          <Button
            className="flex items-center gap-2"
            onClick={deleteSelected}
            size="sm"
            variant="destructive"
          >
            <Trash className="size-4" />
            <span className="hidden sm:inline">Delete</span>
            {` (${selectedIds.size})`}
          </Button>
        )}
      </div>

      {/* Attachments List */}
      {attachmentsList}

      {/* Delete selected attachments dialog */}
      <Dialog onOpenChange={setShowDeleteSelectedDialog} open={showDeleteSelectedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected attachments?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete {selectedIds.size} selected
              attachment
              {selectedIds.size === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowDeleteSelectedDialog(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={confirmDeleteSelected} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete single attachment dialog */}
      <Dialog onOpenChange={setShowDeleteSingleDialog} open={showDeleteSingleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete attachment?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete this attachment and remove
              it from the relevant chats.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowDeleteSingleDialog(false);
                setAttachmentToDelete(null);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={confirmDeleteSingle} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
