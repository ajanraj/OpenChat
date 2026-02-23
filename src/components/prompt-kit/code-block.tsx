import React, { Suspense, use, useMemo } from "react";
import { parseDocument } from "htmlparser2";
import { codeToHtml } from "shiki";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const HIGHLIGHT_CACHE_MAX = 128;
const highlightCache = new Map<string, Promise<string>>();

function getCachedHighlight(
	code: string,
	language: string,
	theme: string,
): Promise<string> {
	const key = `${language}:${theme}:${code}`;
	const cached = highlightCache.get(key);
	if (cached) {
		highlightCache.delete(key);
		highlightCache.set(key, cached);
		return cached;
	}
	const promise = codeToHtml(code, {
		lang: language,
		theme: theme === "dark" ? "github-dark" : "github-light",
	}).catch((error: unknown) => {
		highlightCache.delete(key);
		throw error;
	});
	if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
		const oldest = highlightCache.keys().next().value;
		if (oldest !== undefined) highlightCache.delete(oldest);
	}
	highlightCache.set(key, promise);
	return promise;
}

export type CodeBlockProps = {
	children?: React.ReactNode;
	className?: string;
} & React.HTMLProps<HTMLDivElement>;

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
	return (
		<div
			className={cn(
				"not-prose flex w-full flex-col overflow-clip border",
				"[&_.shiki]:!bg-transparent rounded-xl border-border bg-card text-card-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export type CodeBlockCodeProps = {
	code: string;
	language?: string;
	theme?: string;
	className?: string;
} & React.HTMLProps<HTMLDivElement>;

type HighlightedCodeProps = {
	code: string;
	language: string;
	appTheme: string;
	className: string;
	props: Omit<CodeBlockCodeProps, "code" | "language" | "theme" | "className">;
};

function toCamelCase(value: string): string {
	return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseStyle(style: string): React.CSSProperties {
	const result: React.CSSProperties = {};
	const declarations = style.split(";");
	for (const declaration of declarations) {
		const [rawProperty = "", rawValue = ""] = declaration.split(":");
		const property = rawProperty.trim();
		const value = rawValue.trim();
		if (!property || !value) {
			continue;
		}
		const cssProperty = toCamelCase(property);
		Object.assign(result, { [cssProperty]: value });
	}
	return result;
}

function renderHighlightedNodes(
	nodes: ReturnType<typeof parseDocument>["children"],
	keyPrefix: string,
): React.ReactNode[] {
	const rendered: React.ReactNode[] = [];

	for (const [index, node] of nodes.entries()) {
		const key = `${keyPrefix}-${index}`;
		if (node.type === "text") {
			rendered.push(node.data);
			continue;
		}

		if (node.type !== "tag") {
			continue;
		}

		const nodeClassName = node.attribs.class;
		const nodeStyle = node.attribs.style;
		const props: React.HTMLAttributes<HTMLElement> & { key: string } = { key };
		if (nodeClassName) {
			props.className = nodeClassName;
		}
		if (nodeStyle) {
			props.style = parseStyle(nodeStyle);
		}

		const children = renderHighlightedNodes(node.children, key);
		rendered.push(React.createElement(node.name, props, children));
	}

	return rendered;
}

function HighlightedCode({
	code,
	language,
	appTheme,
	className,
	props,
}: HighlightedCodeProps) {
	const highlightedHtml = use(getCachedHighlight(code, language, appTheme));
	const highlightedNodes = useMemo(() => {
		const parsed = parseDocument(highlightedHtml);
		return renderHighlightedNodes(parsed.children, "highlighted");
	}, [highlightedHtml]);

	return (
		<div className={className} {...props}>
			{highlightedNodes}
		</div>
	);
}

function CodeBlockCode({
	code,
	language = "tsx",
	theme: _theme = "github-light",
	className,
	...props
}: CodeBlockCodeProps) {
	const { theme: appTheme } = useTheme();

	// Ensure code and language are always valid strings
	const safeCode = typeof code === "string" ? code : "";
	const safeLanguage =
		typeof language === "string" && language ? language : "tsx";

	const classNames = cn(
		"w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
		className,
	);

	const fallback = (
		<div className={classNames} {...props}>
			<pre>
				<code>{code}</code>
			</pre>
		</div>
	);

	if (!appTheme || !safeLanguage) {
		return fallback;
	}

	return (
		<Suspense fallback={fallback}>
			<HighlightedCode
				appTheme={appTheme}
				className={classNames}
				code={safeCode}
				language={safeLanguage}
				props={props}
			/>
		</Suspense>
	);
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>;

function CodeBlockGroup({
	children,
	className,
	...props
}: CodeBlockGroupProps) {
	return (
		<div
			className={cn("flex items-center justify-between", className)}
			{...props}
		>
			{children}
		</div>
	);
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock };
