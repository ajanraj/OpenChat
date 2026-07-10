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

	it("passes the resolved message effort to the editor", () => {
		render(
			<Message
				id="message-1"
				model="xai/grok-4.5"
				onBranch={noop}
				onDelete={noop}
				onEdit={noop}
				onReload={noop}
				reasoningEffort="high"
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

	it("uses an empty model only when no message model is available", () => {
		render(
			<Message
				id="message-2"
				onBranch={noop}
				onDelete={noop}
				onEdit={noop}
				onReload={noop}
				reasoningEffort="none"
				variant="user"
			/>,
		);

		expect(mockMessageUser.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({ selectedModel: "" }),
		);
	});
});
