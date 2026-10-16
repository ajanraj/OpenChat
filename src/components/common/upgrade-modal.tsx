import { Link, useRouter } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useCallback, useRef } from "react";
import { PricingTableOne } from "@/components/billingsdk/pricing-table-one";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { plans } from "@/lib/billingsdk-config";
import { useUser } from "@/providers/user-provider";
import { api } from "../../../convex/_generated/api";

type UpgradeModalProps = {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
};

export function UpgradeModal({ isOpen, onOpenChange }: UpgradeModalProps) {
	const { user, isLoading: isUserLoading } = useUser();
	const createCheckout = useAction(api.stripe.createCheckout);
	const router = useRouter();
	const isCheckoutInFlight = useRef(false);

	const handlePlanSelect = useCallback(
		async (planId: string) => {
			// Prevent double-clicks and multiple checkout sessions
			if (isCheckoutInFlight.current) {
				return;
			}

			// Only handle pro plan selection (free plan doesn't need action)
			if (planId === "free") {
				return;
			}

			// Guests and signed-out visitors: send to auth page. Until the session settles a returning
			// user isn't known yet, so checkout goes ahead; it refuses anyone not signed in
			if (!isUserLoading && (!user || user.isAnonymous)) {
				router.navigate({ to: "/auth" });
				return;
			}

			// Set in-flight flag immediately before API call
			isCheckoutInFlight.current = true;

			try {
				const { url } = await createCheckout({});

				// Keep flag true during redirect since we're leaving the page
				window.location.href = url;
			} catch (error) {
				// Silent error handling - user will notice if checkout fails
				// Reset flag on error so user can retry
				isCheckoutInFlight.current = false;
			}
		},
		[isUserLoading, user, createCheckout, router],
	);

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent className="!max-w-[1000px] max-h-[90vh] w-[90vw] overflow-y-auto p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:!max-w-[1000px]">
				<DialogTitle className="sr-only">Upgrade your plan</DialogTitle>
				<div className="flex flex-col">
					<PricingTableOne
						className="py-6"
						description="Choose the plan that's right for you"
						onPlanSelect={handlePlanSelect}
						plans={plans}
						size="medium"
						theme="classic"
						title="Upgrade your plan"
						monthlyOnly={true}
					/>
					<div className="flex items-center justify-between border-t px-6 py-4 text-muted-foreground/60 text-sm">
						<div>
							By subscribing, you agree to our{" "}
							<Link
								className="text-muted-foreground hover:text-foreground"
								to="/terms"
							>
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link
								className="text-muted-foreground hover:text-foreground"
								to="/privacy"
							>
								Privacy Policy
							</Link>
						</div>
						<div>
							Questions?{" "}
							<a
								className="text-muted-foreground hover:text-foreground"
								href="mailto:support@oschat.ai"
							>
								Get in touch
							</a>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
