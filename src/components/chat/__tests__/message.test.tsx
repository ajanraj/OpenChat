import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Message } from "../message";

const mockMessageUser = vi.hoisted(() => vi.fn((_props: object) => null));

vi.mock("../message-user", () => ({ MessageUser: mockMessageUser }));
vi.mock("../message-assistant", () => ({ MessageAssistant: () => null }));

const noop = () => undefined;

describe("Message", () => {
	beforeEach(() => {
		mockMessageUser.mockClear();
	});

	it("uses the historical message effort when editing", () => {
		render(
			<Message
				id="message-1"
				metadata={{ reasoningEffort: "high" }}
				model="xai/grok-4.5"
				onBranch={noop}
				onDelete={noop}
				onEdit={noop}
				onReload={noop}
				reasoningEffort="none"
				variant="user"
			/>,
		);

		expect(mockMessageUser.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				reasoningEffort: "high",
				selectedModel: "xai/grok-4.5",
			}),
		);
	});

	it("normalizes an incompatible chat effort to the message model", () => {
		render(
			<Message
				id="message-2"
				model="xai/grok-4.5"
				onBranch={noop}
				onDelete={noop}
				onEdit={noop}
				onReload={noop}
				reasoningEffort="none"
				variant="user"
			/>,
		);

		expect(mockMessageUser.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({ reasoningEffort: "low" }),
		);
	});
});
