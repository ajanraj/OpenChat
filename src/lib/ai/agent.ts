import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel, Tool } from "ai";

export const createScheduledAgent = ({
  model,
  systemPrompt,
  tools,
}: {
  model: LanguageModel;
  systemPrompt: string;
  tools: Record<string, Tool>;
}) => {
  return new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools,
    stopWhen: stepCountIs(10),
  });
};
