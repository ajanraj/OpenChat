import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getServerRouteSecret } from "@/lib/middleware/auth";

type CreditClient = Pick<ConvexHttpClient, "mutation">;

export type MessageCreditTracker = ReturnType<typeof createMessageCreditTracker>;

/**
 * Tracks the platform message credit of one /api/chat request.
 *
 * charge() consumes a credit atomically before generating and throws the
 * DAILY/MONTHLY/PREMIUM_LIMIT_REACHED ConvexError when the user is out of credits.
 * refund() returns the outstanding charge at most once, and only while the client is
 * still connected: call it when the generation itself fails. User aborts and failed
 * saves keep the charge, otherwise deleting a chat mid-stream would make replies free.
 */
export function createMessageCreditTracker(client: CreditClient, signal: AbortSignal) {
  let charged: { usesPremiumCredits: boolean } | null = null;

  return {
    async charge(usesPremiumCredits: boolean): Promise<void> {
      await client.mutation(api.users.consumeMessageCredit, { usesPremiumCredits });
      charged = { usesPremiumCredits };
    },

    async refund(): Promise<void> {
      if (!charged || signal.aborted) {
        return;
      }
      const { usesPremiumCredits } = charged;
      charged = null;
      try {
        await client.mutation(api.users.refundMessageCredit, {
          serverSecret: getServerRouteSecret(),
          usesPremiumCredits,
        });
      } catch (error) {
        console.error("Failed to refund message credit:", error);
      }
    },
  };
}
