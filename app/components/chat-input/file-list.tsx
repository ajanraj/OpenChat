import type { Transition } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import { ExistingFileItem, FileItem } from "./file-items";

type ExistingAttachment = {
  url: string;
  filename?: string;
  mediaType?: string;
};

type FileListProps = {
  files: File[];
  onFileRemoveAction: (file: File) => void;
  existingAttachments?: ExistingAttachment[];
  keptUrls?: Set<string>;
  onToggleExisting?: (url: string) => void;
};

const TRANSITION: Transition = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
};

export function FileList({
  files,
  onFileRemoveAction,
  existingAttachments = [],
  keptUrls,
  onToggleExisting,
}: FileListProps) {
  return (
    <AnimatePresence initial={false}>
      {(existingAttachments.length > 0 || files.length > 0) && (
        <motion.div
          animate={{ height: "auto" }}
          className="overflow-hidden"
          exit={{ height: 0 }}
          initial={{ height: 0 }}
          key="files-list"
          transition={TRANSITION}
        >
          <div className="flex flex-row overflow-x-auto px-2">
            <AnimatePresence initial={false}>
              {existingAttachments.map((att) => (
                <motion.div
                  animate={{ width: 180 }}
                  className="relative shrink-0 overflow-hidden pt-2"
                  exit={{ width: 0 }}
                  initial={{ width: 0 }}
                  key={att.url}
                  transition={TRANSITION}
                >
                  <ExistingFileItem
                    attachment={att}
                    kept={keptUrls ? keptUrls.has(att.url.split("?")[0]) : true}
                    onToggle={(url) => onToggleExisting?.(url)}
                  />
                </motion.div>
              ))}
              {files.map((file) => (
                <motion.div
                  animate={{ width: 180 }}
                  className="relative shrink-0 overflow-hidden pt-2"
                  exit={{ width: 0 }}
                  initial={{ width: 0 }}
                  key={file.name}
                  transition={TRANSITION}
                >
                  <FileItem
                    file={file}
                    key={file.name}
                    onRemoveAction={onFileRemoveAction}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
