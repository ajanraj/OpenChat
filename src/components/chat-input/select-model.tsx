import { ModelSelectorV2 } from "@/components/common/model-selector-v2";
import { HOTKEY_EVENT_OPEN_MODEL_PICKER } from "@/lib/hotkey-events";

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
			openSignalEvent={HOTKEY_EVENT_OPEN_MODEL_PICKER}
			selectedModelId={selectedModel}
			setSelectedModelId={onSelectModel}
		/>
	);
}

export { SelectModelComponent as SelectModel };
