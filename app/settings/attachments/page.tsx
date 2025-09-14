"use client";

import { convexQuery } from "@convex-dev/react-query";
import { ArrowSquareOut, FileText, Trash } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

export default function AttachmentsPage() {
  const { data: rawAttachments } = useTanStackQuery({
    ...convexQuery(api.files.getAttachmentsForUser, {}),
  });

  // Sort attachments by creation time (latest first)
  const attachments = rawAttachments?.sort(
    (a, b) =>
      new Date(b._creationTime).getTime() - new Date(a._creationTime).getTime()
  );
  const deleteAttachments = useMutation(api.files.deleteAttachments);
  const [selectedIds, setSelectedIds] = useState<Set<Id<"chat_attachments">>>(
    new Set()
  );
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] =
    useState(false);
  const [showDeleteSingleDialog, setShowDeleteSingleDialog] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<Id<"chat_attachments"> | null>(null);

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
    setSelectedIds(
      new Set(attachments.map((a) => a._id as Id<"chat_attachments">))
    );
  };
  const clearSelection = () => setSelectedIds(new Set());

  const deleteSelected = () => {
    if (selectedIds.size === 0) {
      return;
    }
    setShowDeleteSelectedDialog(true);
  };

  const confirmDeleteSelected = async () => {
    try {
      await deleteAttachments({ attachmentIds: Array.from(selectedIds) });
      toast({ title: "Selected attachments deleted", status: "success" });
      setSelectedIds(new Set());
    } catch {
      toast({ title: "Failed to delete some attachments", status: "error" });
    } finally {
      setShowDeleteSelectedDialog(false);
    }
  };

  const handleDelete = (attachmentId: Id<"chat_attachments">) => {
    setAttachmentToDelete(attachmentId);
    setShowDeleteSingleDialog(true);
  };

  const confirmDeleteSingle = async () => {
    if (!attachmentToDelete) {
      return;
    }
    try {
      await deleteAttachments({ attachmentIds: [attachmentToDelete] });
      toast({ title: "Attachment deleted", status: "success" });
    } catch {
      toast({ title: "Failed to delete attachment", status: "error" });
    } finally {
      setShowDeleteSingleDialog(false);
      setAttachmentToDelete(null);
    }
  };

  return (
    <div className="w-full">
      <div className="space-y-6">
        <h1 className="font-bold text-2xl">Attachments</h1>
        <p className="max-w text-muted-foreground text-sm">
          Manage your uploaded files and attachments. Note that deleting files
          here will remove them from the relevant chats, but will not delete
          those chats. This may lead to unexpected behavior if you delete a file
          that is still referenced in a chat.
        </p>
        <div className="space-y-4">
          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-3 rounded-lg border px-4 py-1.5 hover:bg-accent/25 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950">
                <Checkbox
                  checked={Boolean(
                    attachments &&
                      attachments.length > 0 &&
                      selectedIds.size === attachments.length
                  )}
                  className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
                  disabled={!attachments}
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
                <span className="hidden font-medium text-sm sm:inline">
                  Select All
                </span>
              </Label>
              {selectedIds.size > 0 && (
                <Button
                  onClick={clearSelection}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Clear{" "}
                  <span className="hidden text-sm sm:inline">Selection</span>
                </Button>
              )}
            </div>
            {selectedIds.size > 0 && (
              <Button
                className="flex items-center gap-2"
                onClick={deleteSelected}
                size="sm"
                variant="destructive"
              >
                <Trash className="size-4" />{" "}
                <span className="hidden sm:inline">Delete</span>
                {selectedIds.size > 0 && ` (${selectedIds.size})`}
              </Button>
            )}
          </div>
          {/* Attachments List */}
          {attachments ? (
            attachments.length === 0 ? (
              <p className="text-muted-foreground">No attachments found.</p>
            ) : (
              attachments.map((att) => (
                <Card
                  className={`${isSelected(att._id as Id<"chat_attachments">) ? "bg-muted/50 py-3" : "py-3"}`}
                  key={att._id}
                >
                  <CardContent className="flex items-center gap-4 px-4">
                    <Checkbox
                      checked={isSelected(att._id as Id<"chat_attachments">)}
                      onCheckedChange={() =>
                        toggleSelect(att._id as Id<"chat_attachments">)
                      }
                    />
                    {(att.fileType?.startsWith("image/") ?? false) &&
                    att.url ? (
                      <div className="h-10 w-10 overflow-hidden rounded border">
                        <Image
                          alt={att.fileName ?? "attachment"}
                          className="h-full w-full object-cover"
                          height={40}
                          src={att.url}
                          width={40}
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded border bg-muted/5">
                        <FileText className="size-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <a
                        className="flex items-center gap-1 truncate text-primary hover:underline"
                        href={att.url ?? undefined}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="truncate">
                          {att.fileName ?? att.key}
                        </span>
                        <ArrowSquareOut className="size-4 shrink-0" />
                      </a>
                      <span className="text-muted-foreground text-sm">
                        {att.fileType ?? "file"} •{" "}
                        {formatBytes(att.fileSize ?? 0)}
                      </span>
                    </div>
                    <Button
                      onClick={() =>
                        handleDelete(att._id as Id<"chat_attachments">)
                      }
                      size="icon"
                      variant="destructive"
                    >
                      <Trash className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )
          ) : (
            <div className="space-y-4">
              {["skeleton-1", "skeleton-2", "skeleton-3"].map((skeletonId) => (
                <Card key={skeletonId}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-10 w-10" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-8" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete selected attachments dialog */}
      <Dialog
        onOpenChange={setShowDeleteSelectedDialog}
        open={showDeleteSelectedDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected attachments?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              {selectedIds.size} selected attachment
              {selectedIds.size === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowDeleteSelectedDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={confirmDeleteSelected} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete single attachment dialog */}
      <Dialog
        onOpenChange={setShowDeleteSingleDialog}
        open={showDeleteSingleDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete attachment?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete this
              attachment and remove it from the relevant chats.
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
