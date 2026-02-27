import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROFILE_ICONS } from "@/lib/config/profile-icons";
import type { ProfileIconName } from "@/lib/config/profile-icons";
import { cn } from "@/lib/utils";
import { PhosphorIcon } from "./profile-form-fields";

interface ProfileIconPickerProps {
  value: ProfileIconName;
  onChange: (icon: ProfileIconName) => void;
  triggerClassName?: string;
}

export function ProfileIconPicker({
  value,
  onChange,
  triggerClassName,
}: ProfileIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className={cn("size-9 shrink-0 cursor-pointer rounded-lg text-lg", triggerClassName)}
          type="button"
          variant="outline"
        >
          <PhosphorIcon className="size-5" name={value} weight="fill" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[120] w-auto p-2" side="top">
        <div className="grid grid-cols-7 gap-1">
          {PROFILE_ICONS.map((iconName) => (
            <button
              className={cn(
                "flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                value === iconName && "bg-accent text-accent-foreground",
              )}
              key={iconName}
              onClick={() => {
                onChange(iconName);
                setOpen(false);
              }}
              type="button"
            >
              <PhosphorIcon
                className="size-5"
                name={iconName}
                weight={value === iconName ? "fill" : "regular"}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
