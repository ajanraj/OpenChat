import { describe, expect, it } from "vitest";

import { sanitizeUserInput } from "../sanitize";

describe(sanitizeUserInput, () => {
  it("escapes ampersand", () => {
    expect(sanitizeUserInput("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes less than", () => {
    expect(sanitizeUserInput("foo < bar")).toBe("foo &lt; bar");
  });

  it("escapes greater than", () => {
    expect(sanitizeUserInput("foo > bar")).toBe("foo &gt; bar");
  });

  it("escapes double quotes", () => {
    expect(sanitizeUserInput('foo "bar" baz')).toBe("foo &quot;bar&quot; baz");
  });

  it("escapes single quotes", () => {
    expect(sanitizeUserInput("foo 'bar' baz")).toBe("foo &#39;bar&#39; baz");
  });

  it("escapes multiple special characters", () => {
    expect(sanitizeUserInput('<script>alert("XSS")</script>')).toBe(
      "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
    );
  });

  it("handles empty string", () => {
    expect(sanitizeUserInput("")).toBe("");
  });

  it("handles null/undefined", () => {
    expect(sanitizeUserInput(null)).toBe("");
    expect(sanitizeUserInput()).toBe("");
  });

  it("preserves normal text", () => {
    expect(sanitizeUserInput("Hello World")).toBe("Hello World");
    expect(sanitizeUserInput("The quick brown fox")).toBe(
      "The quick brown fox"
    );
  });

  it("handles special characters in HTML context", () => {
    const malicious = '<img src="x" onerror="alert(\'XSS\')">';
    const sanitized = sanitizeUserInput(malicious);
    expect(sanitized).not.toContain("<");
    expect(sanitized).not.toContain(">");
    expect(sanitized).toBe(
      "&lt;img src=&quot;x&quot; onerror=&quot;alert(&#39;XSS&#39;)&quot;&gt;"
    );
  });
});
