import { CodeBlock, CodeBlockCode } from "@/components/prompt-kit/code-block";
import { Label } from "@/components/ui/label";
import { ThemeFontControls } from "@/components/ui/theme-font-controls";
import { ThemeSelector } from "@/components/ui/theme-selector";
import { useEditorStore } from "@/lib/store/editor-store";

export function VisualOptionsSection() {
  const themeState = useEditorStore((state) => state.themeState);
  const updateFont = useEditorStore((state) => state.updateFont);

  return (
    <section className="space-y-4">
      <h1 className="font-semibold text-2xl tracking-tight">Visual Options</h1>

      {/* Theme Card */}
      <div className="rounded-xl border bg-card p-4">
        <div className="space-y-3">
          <div>
            <Label className="font-medium text-sm" htmlFor="theme-selector">
              Theme
            </Label>
            <p className="mt-1 text-muted-foreground text-xs">
              Choose a visual theme that affects the overall appearance and color scheme.
            </p>
          </div>
          <ThemeSelector />
        </div>
      </div>

      {/* Font Controls */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_480px]">
        <div className="min-w-0 rounded-xl border bg-card p-4">
          <ThemeFontControls
            onFontChange={updateFont}
            themeStyles={themeState.styles[themeState.currentMode]}
          />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Fonts Preview</h3>
            <div className="rounded-lg border border-dashed bg-background p-4">
              <div>
                {/* User message (right aligned) */}
                <div className="flex justify-end">
                  <div className="inline-block max-w-[78%] whitespace-pre-line break-words rounded-xl bg-accent px-5 py-2.5 text-left font-sans leading-relaxed shadow-sm">
                    Can you write me a simple hello world program?
                  </div>
                </div>
                {/* Assistant message (left aligned) */}
                <div className="mt-4">
                  <div className="mb-2 font-sans leading-relaxed">Sure, here you go:</div>
                  <div className="relative flex w-full flex-col pt-9">
                    <div className="absolute inset-x-0 top-0 flex h-9 items-center rounded-t bg-secondary px-4 py-2 text-secondary-foreground text-sm">
                      <span className="font-mono lowercase">python</span>
                    </div>
                    <CodeBlock className="not-prose border-none bg-transparent p-0 shadow-none">
                      <CodeBlockCode
                        className="[&_code]:!font-mono [&_pre]:!bg-transparent [&_pre]:!font-mono font-mono text-sm [&_pre]:overflow-auto [&_pre]:px-4 [&_pre]:py-4"
                        code={
                          'def greet(name):\n    print(f"Hello, {name}!")\n\nif __name__ == "__main__":\n    greet("world")'
                        }
                        language="python"
                      />
                    </CodeBlock>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
