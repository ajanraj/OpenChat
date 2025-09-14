import { FileArrowUp, Paperclip } from "@phosphor-icons/react";
import {
  FileUpload,
  FileUploadContent,
  FileUploadTrigger,
} from "@/components/prompt-kit/file-upload";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MODELS_OPTIONS } from "@/lib/config";
import { UPLOAD_ACCEPT } from "@/lib/config/upload";
import { cn } from "@/lib/utils";
import { PopoverContentAuth } from "./popover-content-auth";

type ButtonFileUploadProps = {
  onFileUpload: (files: File[]) => void;
  isUserAuthenticated: boolean;
  model: string;
};

export function ButtonFileUpload({
  onFileUpload,
  isUserAuthenticated,
  model,
}: ButtonFileUploadProps) {
  const isFileUploadAvailable = MODELS_OPTIONS.find(
    (m) => m.id === model
  )?.features?.find((f) => f.id === "file-upload")?.enabled;

  if (!isFileUploadAvailable) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Add files"
                className="size-9 rounded-full"
                size="sm"
                type="button"
                variant="outline"
              >
                <Paperclip className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Add files</TooltipContent>
        </Tooltip>
        <PopoverContent className="p-2">
          <div className="text-secondary-foreground text-sm">
            This model does not support file uploads.
            <br />
            Please select another model.
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Add files"
                className="size-9 rounded-full"
                size="sm"
                type="button"
                variant="outline"
              >
                <Paperclip className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Add files</TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    );
  }

  return (
    <FileUpload
      accept={UPLOAD_ACCEPT}
      disabled={!isUserAuthenticated}
      multiple
      onFilesAdded={onFileUpload}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <FileUploadTrigger asChild>
            <Button
              aria-label="Add files"
              className={cn(
                "size-9 rounded-full",
                !isUserAuthenticated && "opacity-50"
              )}
              disabled={!isUserAuthenticated}
              size="sm"
              type="button"
              variant="outline"
            >
              <Paperclip className="size-4" />
            </Button>
          </FileUploadTrigger>
        </TooltipTrigger>
        <TooltipContent>Add files</TooltipContent>
      </Tooltip>
      <FileUploadContent>
        <div className="flex flex-col items-center rounded-lg border border-input border-dashed bg-background p-8">
          <FileArrowUp className="size-8 text-muted-foreground" />
          <span className="mt-4 mb-1 font-medium text-lg">Drop files here</span>
          <span className="text-muted-foreground text-sm">
            Drop any files here to add it to the conversation
          </span>
        </div>
      </FileUploadContent>
    </FileUpload>
  );
}
