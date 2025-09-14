import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

export function sanitizeUserInput(input: string): string {
  // First, sanitize any HTML tags to avoid potential XSS.
  const purified = DOMPurify.sanitize(input);
  // Storage and DB layers support UTF-8, so we keep the content intact (including emojis and non-Latin chars).
  return purified;
}
