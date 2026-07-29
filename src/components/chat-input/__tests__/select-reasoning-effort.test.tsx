import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SelectReasoningEffort } from "../select-reasoning-effort";

describe("SelectReasoningEffort", () => {
	it("shows only Off and High for GLM 5.2", async () => {
		const onSelect = vi.fn();
		render(
			<TooltipProvider>
				<SelectReasoningEffort
					isUserAuthenticated={true}
					modelId="z-ai/glm-5.2"
					onSelectReasoningEffortAction={onSelect}
					reasoningEffort="none"
				/>
			</TooltipProvider>,
		);

		fireEvent.pointerDown(screen.getByRole("button", { name: /off/i }), {
			button: 0,
			ctrlKey: false,
		});

		expect(await screen.findByRole("menuitem", { name: "Off" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "High" })).toBeDefined();
		expect(screen.queryByRole("menuitem", { name: "Low" })).toBeNull();

		fireEvent.click(screen.getByRole("menuitem", { name: "High" }));
		expect(onSelect).toHaveBeenCalledWith("high");
	});

	it("does not offer Off for Grok 4.5", async () => {
		render(
			<TooltipProvider>
				<SelectReasoningEffort
					isUserAuthenticated={true}
					modelId="xai/grok-4.5"
					onSelectReasoningEffortAction={vi.fn()}
					reasoningEffort="low"
				/>
			</TooltipProvider>,
		);

		fireEvent.pointerDown(screen.getByRole("button", { name: /low/i }), {
			button: 0,
			ctrlKey: false,
		});

		expect(await screen.findByRole("menuitem", { name: "Low" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "Medium" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "High" })).toBeDefined();
		expect(screen.queryByRole("menuitem", { name: "Off" })).toBeNull();
	});

	it("labels Kimi K3 maximum reasoning as Max", async () => {
		render(
			<TooltipProvider>
				<SelectReasoningEffort
					isUserAuthenticated={true}
					modelId="moonshotai/kimi-k3"
					onSelectReasoningEffortAction={vi.fn()}
					reasoningEffort="xhigh"
				/>
			</TooltipProvider>,
		);

		fireEvent.pointerDown(screen.getByRole("button", { name: /max/i }), {
			button: 0,
			ctrlKey: false,
		});

		expect(await screen.findByRole("menuitem", { name: "Max" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "High" })).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "Low" })).toBeDefined();
		expect(screen.queryByRole("menuitem", { name: "Off" })).toBeNull();
	});
});
