/**
 * File Handling Hook
 * Manages file uploads and attachment processing for chat
 */

import { useUploadFile } from "@convex-dev/r2/react";
import type { FileUIPart } from "ai";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createOptimisticAttachments,
  uploadFilesInParallel,
} from "@/lib/file-upload-utils";

export function useFileHandling() {
  const [files, setFiles] = useState<File[]>([]);
  // R2: useUploadFile requires an API object that includes generateUploadUrl and syncMetadata
  const uploadFile = useUploadFile(api.files);
  const saveFileAttachment = useAction(api.files.saveFileAttachment);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const processFiles = useCallback(
    async (chatId: Id<"chats">): Promise<FileUIPart[]> => {
      if (files.length === 0) {
        return [];
      }

      return await uploadFilesInParallel(
        files,
        chatId,
        uploadFile,
        ({ chatId: cid, key, fileName }) =>
          saveFileAttachment({ chatId: cid, key, fileName })
      );
    },
    [files, uploadFile, saveFileAttachment]
  );

  const createOptimisticFiles = useCallback(() => {
    return createOptimisticAttachments(files);
  }, [files]);

  return {
    files,
    addFiles,
    removeFile,
    clearFiles,
    processFiles,
    createOptimisticFiles,
    hasFiles: files.length > 0,
    uploadFile,
    saveFileAttachment,
  };
}
