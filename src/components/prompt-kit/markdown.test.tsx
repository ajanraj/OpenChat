import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./markdown";

const streamdownSpy = vi.hoisted(() => vi.fn());

vi.mock("streamdown", () => ({
	Streamdown: (props: {
		children?: string;
		components?: Partial<Record<string, unknown>>;
		parseIncompleteMarkdown?: boolean;
		plugins?: Record<string, unknown>;
		remarkPlugins?: unknown[];
	}) => {
		streamdownSpy(props);
		return <div data-testid="streamdown-block">{props.children}</div>;
	},
	defaultRemarkPlugins: { gfm: [() => null, {}] },
}));

function isCodeRenderer(
	value: unknown,
): value is (props: {
	className?: string;
	children?: ReactNode;
	node?: {
		position?: {
			start?: { line?: number };
			end?: { line?: number };
		};
	};
}) => ReactNode {
	return typeof value === "function";
}

describe("Markdown", () => {
	it("passes streamdown v2 plugins and streaming options", () => {
		streamdownSpy.mockClear();

		render(<Markdown>{"Hello world"}</Markdown>);

		expect(streamdownSpy).toHaveBeenCalledTimes(1);
		const props = streamdownSpy.mock.calls[0]?.[0] as {
			plugins?: Record<string, unknown>;
			parseIncompleteMarkdown?: boolean;
			remarkPlugins?: unknown[];
			components?: Partial<Record<string, unknown>>;
		};

		expect(props.parseIncompleteMarkdown).toBe(true);
		expect(props.plugins).toMatchObject({
			cjk: expect.any(Object),
			math: expect.any(Object),
		});
		expect(props.remarkPlugins).toHaveLength(2);
		expect(typeof props.components?.code).toBe("function");
	});

	it("keeps custom code rendering for mermaid fences", () => {
		streamdownSpy.mockClear();

		render(
			<Markdown>
				{"```mermaid\ngraph LR\nA --> B\n```"}
			</Markdown>,
		);

		expect(streamdownSpy).toHaveBeenCalledTimes(1);
		const props = streamdownSpy.mock.calls[0]?.[0] as {
			components?: Partial<Record<string, unknown>>;
		};

		expect(typeof props.components?.code).toBe("function");
	});

	it("does not crash when code children are non-string nodes", () => {
		streamdownSpy.mockClear();

		render(<Markdown>{"```ts\nconst value = 1\n```"}</Markdown>);

		expect(streamdownSpy).toHaveBeenCalledTimes(1);
		const props = streamdownSpy.mock.calls[0]?.[0] as {
			components?: Partial<Record<string, unknown>>;
		};
		const codeRenderer = props.components?.code;
		expect(isCodeRenderer(codeRenderer)).toBe(true);

		if (!isCodeRenderer(codeRenderer)) {
			throw new Error("Expected code renderer");
		}

		const renderCode = () => {
			const codeElement = codeRenderer({
				className: "language-ts",
				children: [<span key="text">const value = 1</span>, "\n"],
				node: {
					position: {
						start: { line: 1 },
						end: { line: 2 },
					},
				},
			});
			render(<>{codeElement}</>);
		};

		expect(renderCode).not.toThrow();
	});
});
