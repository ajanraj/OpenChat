import { createSearchTool } from "./search";

export type ConsumeStandardCredits = (count: number) => Promise<void>;

interface MeteredSearchToolOptions {
  enableSearch: boolean;
  consumeStandardCredits: ConsumeStandardCredits;
}

export const consumeOneStandardCreditForSearch = async (
  consumeStandardCredits: ConsumeStandardCredits,
): Promise<void> => {
  await consumeStandardCredits(1);
};

export const createMeteredSearchTool = ({
  enableSearch,
  consumeStandardCredits,
}: MeteredSearchToolOptions) => {
  if (!enableSearch) {
    return undefined;
  }

  return createSearchTool({
    onSearchSuccess: async () => {
      await consumeOneStandardCreditForSearch(consumeStandardCredits);
    },
  });
};
