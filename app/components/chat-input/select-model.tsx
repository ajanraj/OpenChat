import { ModelSelector } from "@/components/common/model-selector";
// no additional config imports needed

export type SelectModelProps = {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  isUserAuthenticated: boolean;
};

export function SelectModelComponent({
  selectedModel,
  onSelectModel,
  isUserAuthenticated: _isUserAuthenticated,
}: SelectModelProps) {
  // Selection handled solely via ModelSelector; availability and provider visuals are managed inside it.
  // Always render the full model selector for both anonymous and logged-in users.
  // Premium/locked models are already disabled by availability logic inside the selector.
  return (
    <ModelSelector
      className="rounded-full"
      selectedModelId={selectedModel}
      setSelectedModelId={onSelectModel}
    />
  );
}

export { SelectModelComponent as SelectModel };
