import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./markdown";

const streamdownSpy = vi.hoisted(() => vi.fn());

vi.mock("streamdown", () => ({
	Streamdown: (props: {
		animated?: {
			animation: string;
			duration: number;
			easing: string;
			sep: "word" | "char";
		};
		children?: string;
		components?: Partial<Record<string, unknown>>;
		isAnimating?: boolean;
		parseIncompleteMarkdown?: boolean;
		plugins?: Record<string, unknown>;
		remarkPlugins?: unknown[];
	}) => {
		streamdownSpy(props);
		return <div data-testid="streamdown-block">{props.children}</div>;
	},
	defaultRemarkPlugins: { gfm: [() => null, {}] },
}));

describe("Markdown", () => {
	it("passes streamdown v2 plugins and streaming options", () => {
		streamdownSpy.mockClear();

		render(<Markdown>{"Hello world"}</Markdown>);

		expect(streamdownSpy).toHaveBeenCalledTimes(1);
		const props = streamdownSpy.mock.calls[0]?.[0] as {
			animated?: {
				animation: string;
				duration: number;
				easing: string;
				sep: "word" | "char";
			};
			isAnimating?: boolean;
			plugins?: Record<string, unknown>;
			parseIncompleteMarkdown?: boolean;
			remarkPlugins?: unknown[];
			components?: Partial<Record<string, unknown>>;
		};

		expect(props.animated).toEqual({
			animation: "blurIn",
			duration: 220,
			easing: "ease-out",
			sep: "word",
		});
		expect(props.isAnimating).toBe(false);
		expect(props.parseIncompleteMarkdown).toBe(true);
		expect(props.plugins).toMatchObject({
			code: expect.any(Object),
			cjk: expect.any(Object),
			math: expect.any(Object),
			mermaid: expect.any(Object),
		});
		expect(props.remarkPlugins).toHaveLength(2);
		expect(typeof props.components?.a).toBe("function");
	});

	it("passes animation state when streaming", () => {
		streamdownSpy.mockClear();

		render(<Markdown isAnimating={true}>{"Hello world"}</Markdown>);

		const props = streamdownSpy.mock.calls[0]?.[0] as {
			isAnimating?: boolean;
		};
		expect(props.isAnimating).toBe(true);
	});

	it("renders multi-block markdown in a single streamdown instance", () => {
		streamdownSpy.mockClear();
		const markdown = "# Heading\n\nParagraph\n\n```ts\nconst value = 1\n```";

		render(<Markdown>{markdown}</Markdown>);

		expect(streamdownSpy).toHaveBeenCalledTimes(1);
		const props = streamdownSpy.mock.calls[0]?.[0] as {
			children?: string;
		};
		expect(props.children).toBe(markdown);
	});

	it("applies wrapper id and className", () => {
		streamdownSpy.mockClear();
		const { container } = render(
			<Markdown className="extra-markdown" id="assistant-markdown">
				{"Hello world"}
			</Markdown>,
		);

		const wrapper = container.querySelector("#assistant-markdown");
		expect(wrapper).not.toBeNull();
		expect(wrapper?.className).toContain("markdown-body");
		expect(wrapper?.className).toContain("extra-markdown");
	});
});
