/**
 * Chat Operations Hook
 * Manages chat creation, updates, branching, and deletion operations
 */

import { useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";

import { toast } from "@/components/ui/toast";
import { processBranchError } from "@/lib/chat-error-utils";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * Sets `setPending` for as long as `run` takes. Lives outside the hook because React Compiler
 * cannot lower try/finally.
 */
const whilePending = async <T>(
  setPending: (pending: boolean) => void,
  run: () => Promise<T>
): Promise<T> => {
  setPending(true);
  try {
    return await run();
  } finally {
    setPending(false);
  }
};

export const useChatOperations = () => {
  const router = useRouter();
  const [isBranching, setIsBranching] = useState(false);

  const createChat = useMutation(api.chats.createChat);
  const updateChatModel = useMutation(api.chats.updateChatModel);
  const branchChat = useMutation(api.chats.branchChat);
  const deleteMessage = useMutation(api.messages.deleteMessageAndDescendants);

  const handleCreateChat = useCallback(
    async (
      title: string,
      model: string,
      personaId?: string,
      profileId?: Id<"profiles">
    ) => {
      try {
        const result = await createChat({
          title: title.slice(0, 50),
          model,
          personaId,
          profileId,
        });
        return result.chatId;
      } catch {
        toast({ title: "Failed to create new chat.", status: "error" });
        return null;
      }
    },
    [createChat]
  );

  const handleModelChange = useCallback(
    async (
      chatId: string | null,
      model: string,
      _user: Doc<"users"> | null
    ) => {
      if (chatId === null || chatId === "") {
        // For new chats, this will be handled by temporary state
        return true;
      }

      try {
        await updateChatModel({ chatId, model });
        return true;
      } catch {
        toast({ title: "Failed to update chat model", status: "error" });
        return false;
      }
    },
    [updateChatModel]
  );

  const handleBranch = useCallback(
    async (chatId: string, messageId: string, user: Doc<"users"> | null) => {
      if (!(chatId && user?._id)) {
        toast({
          title: "Unable to branch chat. Please try again.",
          status: "error",
        });
        return false;
      }

      if (isBranching) {
        return false;
      }

      return await whilePending(setIsBranching, async () => {
        try {
          const result = await branchChat({
            originalChatId: chatId,
            branchFromMessageId: messageId,
          });

          void router.navigate({ to: `/c/${result.chatId}` });
          toast({
            title: "Chat branched successfully",
            status: "success",
          });
          return true;
        } catch (branchError: unknown) {
          const errorMessage = processBranchError(branchError);
          toast({
            title: errorMessage,
            status: "error",
          });
          return false;
        }
      });
    },
    [branchChat, router, isBranching]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        return await deleteMessage({ messageId });
      } catch {
        toast({ title: "Failed to delete message", status: "error" });
        return null;
      }
    },
    [deleteMessage]
  );

  return {
    handleCreateChat,
    handleModelChange,
    handleBranch,
    handleDeleteMessage,
  };
};
