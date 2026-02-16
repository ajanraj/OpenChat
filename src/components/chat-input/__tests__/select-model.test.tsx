import { render } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { HOTKEY_EVENT_OPEN_MODEL_PICKER } from "@/lib/hotkey-events";
import { SelectModelComponent } from "../select-model";

type ModelSelectorProps = {
	selectedModelId: string;
	setSelectedModelId: (modelId: string) => void;
	className?: string;
	openSignalEvent?: string;
};

const modelSelectorPropsSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/common/model-selector-v2", () => ({
	ModelSelectorV2: (props: ModelSelectorProps) => {
		modelSelectorPropsSpy(props);
		return <div data-testid="model-selector-v2" />;
	},
}));

describe("SelectModelComponent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards model props and open-model-picker event to ModelSelectorV2", () => {
		const onSelectModel = vi.fn();
		render(
			<SelectModelComponent
				isUserAuthenticated={true}
				onSelectModel={onSelectModel}
				selectedModel="openai:gpt-5"
			/>,
		);

		expect(modelSelectorPropsSpy).toHaveBeenCalledTimes(1);
		const props = modelSelectorPropsSpy.mock.calls[0]?.[0] as ModelSelectorProps;
		expect(props.selectedModelId).toBe("openai:gpt-5");
		expect(props.setSelectedModelId).toBe(onSelectModel);
		expect(props.className).toBe("rounded-full");
		expect(props.openSignalEvent).toBe(HOTKEY_EVENT_OPEN_MODEL_PICKER);
	});
});
