import { convexQuery } from "@convex-dev/react-query";
import {
  Copy,
  DownloadSimple,
  LinkSimple,
  Trash,
  UploadSimple,
  XCircle,
} from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { APP_BASE_URL, MESSAGE_MAX_LENGTH } from "@/lib/config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/history")({
  component: HistorySettingsPage,
});

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
            }),
          )
          .optional(),
      }),
    ),
  })
  .strict();

function formatDateLines(timestamp?: number | null) {
  if (!timestamp) {
    return { dateTime: "Unknown", ampm: "" };
  }
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) {
    return { dateTime: "Invalid", ampm: "" };
  }
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
}

export function HistorySettingsPage() {
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
  const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);
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
    const selectedChatIds = Array.from(selectedIds);
    const deletePromise =
      selectedChatIds.length === 1
        ? deleteChat({ chatId: selectedChatIds[0] })
        : deleteBulkChats({ chatIds: selectedChatIds });

    const deleted = await deletePromise
      .then(() => true)
      .catch(() => false);

    if (deleted) {
      toast({ title: "Selected chats deleted", status: "success" });
      setSelectedIds(new Set());
    } else {
      toast({ title: "Failed to delete some chats", status: "error" });
    }
    setShowDeleteSelectedDialog(false);
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    toast({ title: "Preparing export...", status: "info" });
    const collectData = async () => {
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
        }),
      );

      return data;
    };

    const data = await collectData().catch(() => null);
    if (!data) {
      toast({ title: "Failed to export chats", status: "error" });
      return;
    }

    const blob = new Blob([superjson.stringify({ exportedAt: Date.now(), data })], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oschat-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export complete", status: "success" });
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
    toast({
      title: `Importing ${importChatCount} chat(s)...`,
      status: "info",
    });

    const importSucceeded = await Promise.all(
      importData.map(async (item) => {
        const chatMeta = item.chat ?? {};
        const messages = (item.messages ?? [])
          .filter(
            (msg) =>
              msg &&
              typeof msg.content === "string" &&
              msg.content.length > 0 &&
              msg.content.length <= MESSAGE_MAX_LENGTH,
          )
          .map((msg) => ({
            role: (msg.role || "assistant") as "user" | "assistant" | "system",
            content: msg.content,
            parts: msg.parts,
            metadata: msg.metadata ?? (msg.model ? { modelName: msg.model } : undefined),
            originalId: msg._id || msg.id,
            parentOriginalId: msg.parentMessageId,
            createdAt: typeof msg.createdAt === "number" ? msg.createdAt : undefined,
          }));

        if (messages.length === 0) {
          return;
        }

        await convex.mutation(api.import_export.bulkImportChat, {
          chat: {
            title:
              typeof chatMeta.title === "string" && chatMeta.title.length <= 100
                ? chatMeta.title
                : undefined,
            model:
              typeof chatMeta.model === "string" && chatMeta.model.length <= 50
                ? chatMeta.model
                : undefined,
          },
          messages,
        });
      }),
    )
      .then(() => true)
      .catch((error) => {
        console.error("Failed to import chat history:", error);
        return false;
      })
      .finally(() => {
        setShowImportDialog(false);
        setImportData([]);
        setImportChatCount(0);
      });

    if (importSucceeded) {
      toast({ title: "Import completed", status: "success" });
      setSelectedIds(new Set());
    } else {
      toast({ title: "Import failed", status: "error" });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const input = e.currentTarget;
    await processImportFile(file)
      .catch((error: unknown) => {
        toast({
          title: error instanceof Error ? error.message : "Import failed",
          status: "error",
        });
      })
      .finally(() => {
        // Clear the input value so the same file can be selected again
        input.value = "";
      });
  };

  const confirmDeleteAll = async () => {
    // Guard against duplicate requests
    if (isDeletingAll) {
      return;
    }

    setIsDeletingAll(true);
    await deleteAllChats({})
      .then(() => {
        toast({ title: "All chats deleted", status: "success" });
      })
      .catch(() => {
        toast({ title: "Failed to delete chats", status: "error" });
      })
      .finally(() => {
        setShowDeleteAllDialog(false);
        setIsDeletingAll(false);
      });
  };

  const renderChatsList = () => {
    if (!chats) {
      return (
        <div className="flex max-h-[320px] flex-col overflow-y-auto rounded-xl border bg-card">
          {Array.from({ length: 5 }).map((_, i) => {
            const key = `skeleton-${i}`;
            return (
              <div
                className={cn(
                  "group flex min-h-[52px] items-center gap-3 px-4 py-3",
                  i !== 4 && "border-b",
                )}
                key={key}
              >
                <div className="size-4 shrink-0 animate-pulse rounded bg-muted" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (chats.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card/50 py-12">
          <p className="text-muted-foreground">No chats found.</p>
        </div>
      );
    }

    return (
      <div className="flex max-h-[320px] flex-col overflow-y-auto rounded-xl border bg-card">
        {chats.map((chat, index) => {
          const { dateTime, ampm } = formatDateLines(chat.updatedAt ?? chat.createdAt);
          const selected = isSelected(chat._id as Id<"chats">);

          return (
            <div
              className={cn(
                "group flex min-h-[52px] items-center gap-3 px-4 py-3",
                index !== chats.length - 1 && "border-b",
                selected ? "bg-primary/[0.04]" : "hover:bg-muted/50",
              )}
              key={chat._id}
            >
              <Checkbox
                checked={selected}
                className="shrink-0"
                onCheckedChange={() => toggleSelect(chat._id as Id<"chats">)}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium text-sm">
                  {chat.title || "Untitled Chat"}
                </span>
                {Boolean(chat.public) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 rounded-full bg-blue-500/10 p-1">
                          <LinkSimple className="size-3 text-blue-600 dark:text-blue-400" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Shared publicly</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {Boolean(chat.public) && (
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label="Copy share link"
                            className="size-7"
                            onClick={async () => {
                              await navigator.clipboard
                                .writeText(`${APP_BASE_URL}/share/${chat._id}`)
                                .then(() => {
                                  toast({
                                    title: "Link copied",
                                    status: "success",
                                  });
                                })
                                .catch(() => {
                                  toast({
                                    title: "Failed to copy link",
                                    status: "error",
                                  });
                                });
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Copy className="size-3.5" />
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
                            className="size-7"
                            onClick={() => setRevokeChatId(chat._id as Id<"chats">)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Unshare</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                <span className="w-24 text-right text-muted-foreground text-xs tabular-nums">
                  {dateTime} {ampm}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const totalChats = chats?.length ?? 0;
  const sharedCount = chats?.filter((c) => c.public).length ?? 0;

  return (
    <div className="w-full space-y-10">
      <div className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">History</h1>
          {chats && totalChats > 0 && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
                {totalChats} chat{totalChats === 1 ? "" : "s"}
              </span>
              {sharedCount > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 font-medium text-blue-600 text-xs dark:text-blue-400">
                    {sharedCount} shared
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Export your chat history as JSON or import from a backup file. Importing adds to your
          existing conversations.
        </p>
        <div className="space-y-4">
          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-3 rounded-lg border px-4 py-1.5 hover:bg-accent/25 has-aria-checked:border-blue-600 has-aria-checked:bg-blue-50 dark:has-aria-checked:border-blue-900 dark:has-aria-checked:bg-blue-950">
                <Checkbox
                  checked={Boolean(
                    !!chats && chats.length > 0 && selectedIds.size === chats.length,
                  )}
                  className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
                  disabled={!chats}
                  id="select-all"
                  onCheckedChange={() => {
                    if (!!chats && chats.length > 0 && selectedIds.size === chats.length) {
                      clearSelection();
                    } else {
                      selectAll();
                    }
                  }}
                />
                <span className="hidden font-medium text-sm sm:inline">Select All</span>
              </Label>
              {selectedIds.size > 0 && (
                <Button onClick={clearSelection} size="sm" type="button" variant="secondary">
                  Clear <span className="hidden text-sm sm:inline">Selection</span>
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
                <Trash className="size-4" /> <span className="hidden sm:inline">Delete</span>
                {selectedIds.size > 0 && ` (${selectedIds.size})`}
              </Button>
              <Button
                className="flex items-center gap-2"
                onClick={handleImportClick}
                size="sm"
                variant="secondary"
              >
                <UploadSimple className="size-4" /> <span className="hidden sm:inline">Import</span>
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
          {renderChatsList()}
        </div>
      </div>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h2 className="font-semibold text-destructive text-lg tracking-tight">Danger Zone</h2>
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/[0.02] p-4">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">Delete all chats</p>
            <p className="text-muted-foreground text-xs">
              Permanently delete your entire chat history. This cannot be undone.
            </p>
          </div>
          <Button
            disabled={isDeletingAll}
            onClick={() => setShowDeleteAllDialog(true)}
            size="sm"
            variant="destructive"
          >
            <Trash className="mr-2 size-4" />
            Delete All
          </Button>
        </div>
      </section>

      {/* Retention policy note */}
      <p className="mt-6 text-muted-foreground text-xs italic">
        *The retention policies of our LLM hosting partners may vary.
      </p>

      {/* Delete selected chats dialog */}
      <Dialog onOpenChange={setShowDeleteSelectedDialog} open={showDeleteSelectedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected chats?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete {selectedIds.size} selected
              chat
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

      {/* Import chats dialog */}
      <Dialog onOpenChange={setShowImportDialog} open={showImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Import {importChatCount} chat{importChatCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This will import {importChatCount} chat
              {importChatCount === 1 ? "" : "s"} into your account. Importing will NOT delete
              existing messages.
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
              This action cannot be undone. This will permanently delete all of your chat history.
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
            <Button disabled={isDeletingAll} onClick={confirmDeleteAll} variant="destructive">
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
              This turns off the public link for this conversation. You can share it again later.
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
                await unpublishChat({ chatId: revokeChatId })
                  .then(() => {
                    toast({ title: "Conversation unshared", status: "success" });
                  })
                  .catch(() => {
                    toast({ title: "Failed to unshare", status: "error" });
                  })
                  .finally(() => {
                    setIsRevoking(false);
                    setRevokeChatId(null);
                  });
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
