import type React from "react";
import { Suspense, use, useMemo } from "react";
import { codeToHtml } from "shiki";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

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

function HighlightedCode({
	code,
	language,
	appTheme,
	className,
	props,
}: HighlightedCodeProps) {
	const highlightedHtml = use(
		useMemo(
			() =>
				codeToHtml(code, {
					lang: language,
					theme: appTheme === "dark" ? "github-dark" : "github-light",
				}),
			[code, language, appTheme],
		),
	);

	return (
		<div
			className={className}
			dangerouslySetInnerHTML={{ __html: highlightedHtml }}
			{...props}
		/>
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
