import { ModelSelectorV2 } from "@/components/common/model-selector-v2";

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
	return (
		<ModelSelectorV2
			className="rounded-full"
			selectedModelId={selectedModel}
			setSelectedModelId={onSelectModel}
		/>
	);
}

export { SelectModelComponent as SelectModel };
