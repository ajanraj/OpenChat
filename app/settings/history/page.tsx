"use client";

import { convexQuery } from "@convex-dev/react-query";
import {
  ClockCounterClockwise,
  Copy,
  DownloadSimple,
  Trash,
  UploadSimple,
  XCircle,
} from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useConvex, useMutation } from "convex/react";
import { useRef, useState } from "react";
import superjson from "superjson";
import { z } from "zod";
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
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { APP_BASE_URL, MESSAGE_MAX_LENGTH } from "@/lib/config";

// Schema to validate imported history files (supports both old and new formats)
const ImportSchema = z
  .object({
    exportedAt: z.number().optional(),
    data: z.array(
      z.object({
        chat: z
          .object({
            title: z.string().max(100).optional(),
            model: z.string().max(50).optional(),
          })
          .optional(),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant", "system"]).optional(),
              content: z.string().min(1).max(MESSAGE_MAX_LENGTH),
              parentMessageId: z.string().optional(),
              _id: z.string().optional(),
              id: z.string().optional(),
              // Legacy fields (for backward compatibility)
              model: z.string().max(50).optional(),
              reasoningText: z.string().optional(),
              // New schema fields
              parts: z.array(z.any()).optional(),
              createdAt: z.number().optional(),
              metadata: z
                .object({
                  modelName: z.string().optional(),
                  modelId: z.string().optional(),
                  inputTokens: z.union([z.number(), z.nan()]).optional(),
                  outputTokens: z.union([z.number(), z.nan()]).optional(),
                  reasoningTokens: z.union([z.number(), z.nan()]).optional(),
                  serverDurationMs: z.number().optional(),
                })
                .optional(),
            })
          )
          .optional(),
      })
    ),
  })
  .strict();

function formatDateLines(timestamp?: number | null) {
  if (!timestamp) {
    return { dateTime: "Unknown", ampm: "" };
  }
  try {
    const d = new Date(timestamp);
    const dateStr = d.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    });
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const [time, ampm] = timeStr.split(" ");
    return { dateTime: `${dateStr} ${time}`, ampm };
  } catch {
    return { dateTime: "Invalid", ampm: "" };
  }
}

export default function HistoryPage() {
  const { data: chats } = useTanStackQuery({
    ...convexQuery(api.chats.listChatsForUser, {}),
  });
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteBulkChats = useMutation(api.chats.deleteBulkChats);
  const unpublishChat = useMutation(api.chats.unpublishChat);
  const deleteAllChats = useMutation(api.chats.deleteAllChatsForUser);
  const convex = useConvex();

  const [selectedIds, setSelectedIds] = useState<Set<Id<"chats">>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] =
    useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [revokeChatId, setRevokeChatId] = useState<Id<"chats"> | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [importChatCount, setImportChatCount] = useState(0);
  const [importData, setImportData] = useState<
    Array<{
      chat?: { title?: string; model?: string };
      messages?: Array<{
        role?: string;
        content: string;
        parts?: unknown[];
        metadata?: unknown;
        _id?: string;
        id?: string;
        parentMessageId?: string;
        createdAt?: number;
        model?: string;
      }>;
    }>
  >([]);

  const isSelected = (id: Id<"chats">) => selectedIds.has(id);
  const toggleSelect = (id: Id<"chats">) => {
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
    if (!chats) {
      return;
    }
    setSelectedIds(new Set(chats.map((c) => c._id as Id<"chats">)));
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      return;
    }
    setShowDeleteSelectedDialog(true);
  };

  const confirmDeleteSelected = async () => {
    try {
      // Use bulk delete for better performance when deleting multiple chats
      if (selectedIds.size === 1) {
        // Single chat - use the existing single delete mutation
        const chatId = Array.from(selectedIds)[0];
        await deleteChat({ chatId });
      } else {
        // Multiple chats - use the new bulk delete mutation
        await deleteBulkChats({ chatIds: Array.from(selectedIds) });
      }
      toast({ title: "Selected chats deleted", status: "success" });
      setSelectedIds(new Set());
    } catch {
      toast({ title: "Failed to delete some chats", status: "error" });
    } finally {
      setShowDeleteSelectedDialog(false);
    }
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    toast({ title: "Preparing export…", status: "info" });
    try {
      // Use proper Convex types
      const data: Array<{
        chat: Pick<
          Doc<"chats">,
          "_id" | "title" | "model" | "createdAt" | "updatedAt" | "personaId"
        >;
        messages: Doc<"messages">[];
      }> = [];

      await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          const chat = chats?.find((c) => c._id === id);
          if (!chat) {
            return;
          }
          const messages = await convex.query(api.messages.getMessagesForChat, {
            chatId: id,
          });
          data.push({
            chat: {
              _id: chat._id,
              title: chat.title ?? "",
              model: chat.model ?? "",
              personaId: chat.personaId,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            },
            messages,
          });
        })
      );
      const blob = new Blob(
        [superjson.stringify({ exportedAt: Date.now(), data })],
        {
          type: "application/json",
        }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oschat-history-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", status: "success" });
    } catch {
      toast({ title: "Failed to export chats", status: "error" });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const MAX_IMPORT_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
  // removed chat count limit

  async function processImportFile(file: File) {
    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      toast({ title: "Import file too large (max 2 MB)", status: "error" });
      return;
    }

    const text = await file.text();
    const data = superjson.parse(text);
    const parsed = ImportSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid file format");
    }

    const dataArr = parsed.data.data;
    const chatCount = dataArr.length;

    if (chatCount === 0) {
      throw new Error("No chats found in file");
    }

    // Store data and chat count, then show confirmation dialog
    setImportData(dataArr);
    setImportChatCount(chatCount);
    setShowImportDialog(true);
  }

  const confirmImport = async () => {
    try {
      toast({ title: `Importing ${importChatCount} chat(s)…`, status: "info" });

      // Use the new bulk import mutation
      await Promise.all(
        importData.map(async (item) => {
          const chatMeta = item.chat ?? {};
          const messages = (item.messages ?? [])
            .filter(
              (msg) =>
                msg &&
                typeof msg.content === "string" &&
                msg.content.length > 0 &&
                msg.content.length <= MESSAGE_MAX_LENGTH
            )
            .map((msg) => ({
              role: (msg.role || "assistant") as
                | "user"
                | "assistant"
                | "system",
              content: msg.content,
              parts: msg.parts,
              metadata:
                msg.metadata ??
                (msg.model ? { modelName: msg.model } : undefined),
              originalId: msg._id || msg.id,
              parentOriginalId: msg.parentMessageId,
              createdAt:
                typeof msg.createdAt === "number" ? msg.createdAt : undefined,
            }));

          if (messages.length === 0) {
            return;
          }

          await convex.mutation(api.import_export.bulkImportChat, {
            chat: {
              title:
                typeof chatMeta.title === "string" &&
                chatMeta.title.length <= 100
                  ? chatMeta.title
                  : undefined,
              model:
                typeof chatMeta.model === "string" &&
                chatMeta.model.length <= 50
                  ? chatMeta.model
                  : undefined,
            },
            messages,
          });
        })
      );

      toast({ title: "Import completed", status: "success" });
      setSelectedIds(new Set());
    } catch (_error) {
      toast({ title: "Import failed", status: "error" });
    } finally {
      setShowImportDialog(false);
      setImportData([]);
      setImportChatCount(0);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      await processImportFile(file);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Import failed",
        status: "error",
      });
    } finally {
      // Clear the input value so the same file can be selected again
      e.currentTarget.value = "";
    }
  };

  const confirmDeleteAll = async () => {
    // Guard against duplicate requests
    if (isDeletingAll) {
      return;
    }

    setIsDeletingAll(true);
    try {
      await deleteAllChats({});
      toast({ title: "All chats deleted", status: "success" });
    } catch {
      toast({ title: "Failed to delete chats", status: "error" });
    } finally {
      setShowDeleteAllDialog(false);
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="w-full space-y-12">
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 font-bold text-2xl">
          Message History{" "}
          <ClockCounterClockwise className="size-5 text-muted-foreground" />
        </h1>
        <p className="text-muted-foreground text-sm">
          Save your history as JSON, or import someone else&apos;s. Importing
          will NOT delete existing messages.
        </p>
        <div className="space-y-4">
          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-3 rounded-lg border px-4 py-1.5 hover:bg-accent/25 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950">
                <Checkbox
                  checked={Boolean(
                    chats &&
                      chats.length > 0 &&
                      selectedIds.size === chats.length
                  )}
                  className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
                  disabled={!chats}
                  id="select-all"
                  onCheckedChange={() => {
                    if (
                      chats &&
                      chats.length > 0 &&
                      selectedIds.size === chats.length
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
            <div className="flex items-center gap-2">
              <Button
                className="flex items-center gap-2"
                disabled={!chats || selectedIds.size === 0}
                onClick={handleExport}
                size="sm"
                variant="secondary"
              >
                <DownloadSimple className="size-4" />{" "}
                <span className="hidden sm:inline">Export</span>
                {selectedIds.size > 0 && ` (${selectedIds.size})`}
              </Button>
              <Button
                className="flex items-center gap-2"
                disabled={!chats || selectedIds.size === 0}
                onClick={handleDeleteSelected}
                size="sm"
                variant="destructive"
              >
                <Trash className="size-4" />{" "}
                <span className="hidden sm:inline">Delete</span>
                {selectedIds.size > 0 && ` (${selectedIds.size})`}
              </Button>
              <Button
                className="flex items-center gap-2"
                onClick={handleImportClick}
                size="sm"
                variant="secondary"
              >
                <UploadSimple className="size-4" />{" "}
                <span className="hidden sm:inline">Import</span>
              </Button>
              <input
                accept="application/json"
                className="hidden"
                onChange={handleImport}
                ref={fileInputRef}
                type="file"
              />
            </div>
          </div>
          {/* Chats List */}
          {chats ? (
            chats.length === 0 ? (
              <p className="text-muted-foreground">No chats found.</p>
            ) : (
              <div className="max-h-[21vh] divide-y overflow-y-auto rounded-lg border">
                {chats.map((chat) => (
                  <div
                    className={`flex items-center gap-4 px-4 py-1 text-sm ${isSelected(chat._id as Id<"chats">) ? "bg-muted/50" : ""}`}
                    key={chat._id}
                  >
                    <Checkbox
                      checked={isSelected(chat._id as Id<"chats">)}
                      onCheckedChange={() =>
                        toggleSelect(chat._id as Id<"chats">)
                      }
                    />
                    <span className="flex-1 truncate font-medium">
                      {chat.title || "Untitled Chat"}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {chat.public ? (
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label="Copy share link"
                                  className="rounded-md transition-[border-radius] duration-200 hover:rounded-full"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        `${APP_BASE_URL}/share/${chat._id}`
                                      );
                                      toast({
                                        title: "Link copied",
                                        status: "success",
                                      });
                                    } catch {
                                      toast({
                                        title: "Failed to copy link",
                                        status: "error",
                                      });
                                    }
                                  }}
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Copy aria-hidden className="size-4" />
                                  <span className="sr-only">
                                    Copy share link
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy link</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label="Unshare conversation"
                                  className="rounded-md transition-[border-radius] duration-200 hover:rounded-full"
                                  onClick={() =>
                                    setRevokeChatId(chat._id as Id<"chats">)
                                  }
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                >
                                  <XCircle aria-hidden className="size-4" />
                                  <span className="sr-only">
                                    Unshare conversation
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Unshare</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : null}
                      {(() => {
                        const { dateTime, ampm } = formatDateLines(
                          chat.updatedAt ?? chat.createdAt
                        );
                        return (
                          <div className="flex w-24 shrink-0 flex-col items-end px-1">
                            <span className="text-xs">{dateTime}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {ampm}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="max-h-[21vh] divide-y overflow-y-auto rounded-lg border">
              {Array.from({ length: 6 }).map((_, i) => {
                const key = `skeleton-${i}`;
                return (
                  <div
                    className="flex items-center gap-2 px-4 py-1 text-sm"
                    key={key}
                  >
                    <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                    <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                    <div className="ml-auto flex w-24 shrink-0 flex-col items-end gap-1 px-1">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-8 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone - Moved outside and styled to match theme */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-left font-bold text-2xl">Danger Zone</h2>
        </div>
        <p className="mb-4 text-muted-foreground/80 text-sm">
          Permanently delete all of your chat history. This action cannot be
          undone.
        </p>
        <Button
          disabled={isDeletingAll}
          onClick={() => setShowDeleteAllDialog(true)}
          size="sm"
          variant="destructive"
        >
          <Trash className="mr-2 size-4" /> Delete All Chats
        </Button>
      </section>

      {/* Retention policy note */}
      <p className="mt-6 text-muted-foreground text-xs italic">
        *The retention policies of our LLM hosting partners may vary.
      </p>

      {/* Delete selected chats dialog */}
      <Dialog
        onOpenChange={setShowDeleteSelectedDialog}
        open={showDeleteSelectedDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected chats?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              {selectedIds.size} selected chat
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

      {/* Import chats dialog */}
      <Dialog onOpenChange={setShowImportDialog} open={showImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Import {importChatCount} chat{importChatCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This will import {importChatCount} chat
              {importChatCount === 1 ? "" : "s"} into your account. Importing
              will NOT delete existing messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowImportDialog(false);
                setImportData([]);
                setImportChatCount(0);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={confirmImport} variant="default">
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all chats dialog */}
      <Dialog
        onOpenChange={(open) => {
          // Prevent closing dialog while deletion is in progress
          if (!isDeletingAll) {
            setShowDeleteAllDialog(open);
          }
        }}
        open={showDeleteAllDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all chat history?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete all of
              your chat history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeletingAll}
              onClick={() => setShowDeleteAllDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isDeletingAll}
              onClick={confirmDeleteAll}
              variant="destructive"
            >
              {isDeletingAll ? "Deleting..." : "Delete All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke shared link dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!(isRevoking || open)) {
            setRevokeChatId(null);
          }
        }}
        open={Boolean(revokeChatId)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unshare this conversation?</DialogTitle>
            <DialogDescription>
              This turns off the public link for this conversation. You can
              share it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setRevokeChatId(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={isRevoking}
              onClick={async () => {
                if (!revokeChatId) {
                  return;
                }
                setIsRevoking(true);
                try {
                  await unpublishChat({ chatId: revokeChatId });
                  toast({ title: "Conversation unshared", status: "success" });
                } catch {
                  toast({ title: "Failed to unshare", status: "error" });
                } finally {
                  setIsRevoking(false);
                  setRevokeChatId(null);
                }
              }}
              variant="destructive"
            >
              Unshare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
