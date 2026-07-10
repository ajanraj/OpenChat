declare module "@streamdown/code" {
  import type { CodeHighlighterPlugin, ThemeInput } from "streamdown";

  export interface CodePluginOptions {
    themes?: [ThemeInput, ThemeInput];
  }

  export function createCodePlugin(options?: CodePluginOptions): CodeHighlighterPlugin;
}
