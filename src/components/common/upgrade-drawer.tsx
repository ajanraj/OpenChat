import { X } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { useAction } from "convex/react";
import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import { PricingTableOne } from "@/components/billingsdk/pricing-table-one";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { plans } from "@/lib/billingsdk-config";
import { useUser } from "@/providers/user-provider";
import { api } from "../../../convex/_generated/api";

type UpgradeDrawerProps = {
	trigger: ReactNode;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
};

export function UpgradeDrawer({
	trigger,
	isOpen,
	onOpenChange,
}: UpgradeDrawerProps) {
	const { user, products } = useUser();
	const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
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

			// Anonymous users: send to auth page
			if (user?.isAnonymous) {
				router.navigate({ to: "/auth" });
				return;
			}

			if (!products?.premium?.id) {
				return;
			}

			// Set in-flight flag immediately before API call
			isCheckoutInFlight.current = true;

			try {
				const { url } = await generateCheckoutLink({
					productIds: [products.premium.id],
					origin: window.location.origin,
					successUrl: `${window.location.origin}/settings?upgraded=true`,
				});

				// Keep flag true during redirect since we're leaving the page
				window.location.href = url;
			} catch (error) {
				// Silent error handling - user will notice if checkout fails
				// Reset flag on error so user can retry
				isCheckoutInFlight.current = false;
			}
		},
		[user, products, generateCheckoutLink, router],
	);

	return (
		<Drawer
			dismissible={true}
			onOpenChange={onOpenChange}
			open={isOpen}
			shouldScaleBackground={false}
		>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent>
				<div className="flex h-dvh max-h-[80vh] flex-col">
					<DrawerHeader className="flex-row items-center justify-between border-border border-b px-6 py-2">
						<DrawerTitle className="font-semibold text-base">
							Upgrade your plan
						</DrawerTitle>
						<DrawerClose asChild>
							<button
								aria-label="Close upgrade"
								className="flex size-11 items-center justify-center rounded-full hover:bg-muted focus:outline-none"
								type="button"
							>
								<X className="size-5" />
							</button>
						</DrawerClose>
					</DrawerHeader>

					<div className="flex-1 overflow-auto pb-8">
						<PricingTableOne
							className="px-4 py-6"
							description="Choose the plan that's right for you"
							monthlyOnly={true}
							onPlanSelect={handlePlanSelect}
							plans={plans}
							size="medium"
							theme="classic"
							title=""
						/>

						<div className="mx-6 mt-4 space-y-3 border-t px-6 py-4 text-center text-muted-foreground/60 text-sm">
							<p>
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
							</p>
							<p>
								Questions?{" "}
								<a
									className="text-muted-foreground hover:text-foreground"
									href="mailto:support@oschat.ai"
								>
									Get in touch
								</a>
							</p>
						</div>
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
