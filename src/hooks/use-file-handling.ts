/**
 * File Handling Hook
 * Manages file uploads and attachment processing for chat
 */

import type { FileUIPart } from "ai";
import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { createOptimisticAttachments, uploadFilesInParallel } from "@/lib/file-upload-utils";
import { uploadToR2 } from "@/lib/r2-upload";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useFileHandling() {
  const [files, setFiles] = useState<File[]>([]);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFileAttachment = useAction(api.files.saveFileAttachment);

  // Uploads one file to R2 and returns its key; saveFileAttachment then attaches it to a chat
  const uploadFile = useCallback(
    (file: File) => uploadToR2(file, generateUploadUrl),
    [generateUploadUrl],
  );

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
        ({ chatId: cid, key, fileName }) => saveFileAttachment({ chatId: cid, key, fileName }),
      );
    },
    [files, uploadFile, saveFileAttachment],
  );

  const createOptimisticFiles = useCallback(() => createOptimisticAttachments(files), [files]);

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
