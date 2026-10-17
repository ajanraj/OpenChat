import type { UIMessage } from "ai";
import type { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { CreditReceipt } from "@/convex/lib/credits";
import { getServerRouteSecret } from "@/lib/middleware/auth";

type CreditClient = Pick<ConvexHttpClient, "mutation">;

export type MessageCreditTracker = ReturnType<
  typeof createMessageCreditTracker
>;

/**
 * Tracks the platform message credit of one /api/chat request.
 *
 * charge() consumes a credit atomically before generating and throws the
 * DAILY/MONTHLY/PREMIUM_LIMIT_REACHED ConvexError when the user is out of credits. It reads
 * SERVER_ROUTE_SECRET first, so a deployment missing it fails before charging a credit it
 * could never refund.
 * refund() returns the outstanding charge at most once, to the buckets and windows it was
 * drawn from, and only while the client is still connected: call it when the generation
 * itself fails. User aborts and failed saves keep the charge, otherwise deleting a chat
 * mid-stream would make replies free.
 */
export const createMessageCreditTracker = (
  client: CreditClient,
  signal: AbortSignal
) => {
  // The outstanding charge: its receipt and the secret to refund it with
  let charged: { receipt: CreditReceipt; serverSecret: string } | null = null;

  return {
    async charge(usesPremiumCredits: boolean): Promise<void> {
      const serverSecret = getServerRouteSecret();
      const receipt = await client.mutation(api.users.consumeMessageCredit, {
        usesPremiumCredits,
      });
      charged = { receipt, serverSecret };
    },

    async refund(): Promise<void> {
      if (!charged || signal.aborted) {
        return;
      }
      const { receipt, serverSecret } = charged;
      charged = null;
      try {
        await client.mutation(api.users.refundMessageCredit, {
          serverSecret,
          receipt,
        });
      } catch (error) {
        console.error("Failed to refund message credit:", error);
      }
    },
  };
};

/**
 * Whether a finished /api/chat stream should refund its credit: when no attempt streamed at all,
 * or when the provider failed before any assistant output (text, reasoning, tool calls) reached
 * the client. Output delivered before a later step failed keeps the charge.
 */
export const shouldRefundGeneration = ({
  hasResult,
  generationFailed,
  parts,
}: {
  hasResult: boolean;
  generationFailed: boolean;
  parts: UIMessage["parts"];
}): boolean => {
  if (!hasResult) {
    return true;
  }
  const producedOutput = parts.some((part) =>
    part.type === "text" || part.type === "reasoning"
      ? part.text.trim().length > 0
      : part.type !== "step-start"
  );
  return generationFailed && !producedOutput;
};
