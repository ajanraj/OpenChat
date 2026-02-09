import "katex/dist/katex.css";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Children, memo } from "react";
import type { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import { Streamdown, defaultRemarkPlugins } from "streamdown";
import { cn } from "@/lib/utils";
import { Source, SourceContent, SourceTrigger } from "./source";

const STREAMDOWN_PLUGINS = { code, math, cjk, mermaid };
const REMARK_PLUGINS = [...Object.values(defaultRemarkPlugins), remarkBreaks];

export type MarkdownProps = {
	children: string;
	id?: string;
	className?: string;
	components?: Partial<Components>;
};

const HTTP_REGEX = /^https?:\/\//i;

const INITIAL_COMPONENTS: Partial<Components> = {
	a({ href, children, ...props }) {
		const text = Children.toArray(children)
			.map((c) => (typeof c === "string" ? c : ""))
			.join("")
			.trim();

		if (href && text) {
			const urlStr = String(href);
			const isHttp = HTTP_REGEX.test(urlStr);
			if (isHttp) {
				return (
					<Source href={urlStr}>
						<SourceTrigger showFavicon />
						<SourceContent description={""} title={text} />
					</Source>
				);
			}
		}

		return (
			<a href={href} rel="noopener noreferrer" target="_blank" {...props}>
				{children}
			</a>
		);
	},
};

function MarkdownComponent({
	children,
	id,
	className,
	components = INITIAL_COMPONENTS,
}: MarkdownProps) {
	return (
		<div className={cn("markdown-body", className)} id={id}>
			<Streamdown
				components={components}
				parseIncompleteMarkdown={true}
				plugins={STREAMDOWN_PLUGINS}
				remarkPlugins={REMARK_PLUGINS}
			>
				{children}
			</Streamdown>
		</div>
	);
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = "Markdown";

export { Markdown };
