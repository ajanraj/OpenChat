import Markdown from "react-markdown";
import { LegalHeader } from "@/components/layout/legal/legal-header";

type LegalPageProps = {
	title: string;
	/** Markdown from src/content/legal, the same source as the page's .md version. */
	body: string;
};

export function LegalPage({ title, body }: LegalPageProps) {
	return (
		<div>
			<LegalHeader />
			<div className="container mx-auto max-w-5xl px-4 py-8">
				<div className="prose max-w-none dark:prose-invert prose-headings:mt-8 prose-headings:mb-4 prose-p:mb-4 prose-ol:mb-6 prose-ul:mb-6">
					<h1>{title}</h1>
					<Markdown>{body}</Markdown>
				</div>
			</div>
		</div>
	);
}
