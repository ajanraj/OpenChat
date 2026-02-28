import { Plus, X } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/config";
import { useState } from "react";

const DEFAULT_TRAITS = [
  "friendly",
  "witty",
  "concise",
  "curious",
  "empathetic",
  "creative",
  "patient",
];

interface TraitsEditorProps {
  traits: string[];
  onAdd: (trait: string) => void;
  onRemove: (trait: string) => void;
}

export function TraitsEditor({ traits, onAdd, onRemove }: TraitsEditorProps) {
  const [traitInput, setTraitInput] = useState("");
  const availableTraits = DEFAULT_TRAITS.filter((t) => !traits.includes(t));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-medium text-sm" htmlFor="traits-input">
          What traits should {APP_NAME} have?
        </Label>
        <span className="text-muted-foreground text-xs">{traits.length}/50</span>
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        {traits.map((trait) => (
          <Badge
            className="flex h-6 items-center gap-1 rounded-md border-0 bg-primary/10 px-2 text-primary text-xs"
            key={trait}
            variant="secondary"
          >
            {trait}
            <button
              className="ml-0.5 cursor-pointer rounded-sm text-primary/60 hover:bg-primary/20 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(trait);
              }}
              type="button"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          id="traits-input"
          maxLength={50}
          onChange={(e) => setTraitInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              onAdd(traitInput);
              setTraitInput("");
            }
          }}
          placeholder={traits.length === 0 ? "Type a trait and press Enter…" : ""}
          type="text"
          value={traitInput}
        />
      </div>
      {availableTraits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTraits.map((trait) => (
            <button
              className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 text-muted-foreground text-xs hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              key={trait}
              onClick={() => onAdd(trait)}
              type="button"
            >
              {trait}
              <Plus className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
