"use client";

import { CircleNotch, Headset, Rocket, Sparkle } from "@phosphor-icons/react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { MessageUsageCard } from "@/app/components/layout/settings/message-usage-card";
import { useUser } from "@/app/providers/user-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/convex/_generated/api";

export default function AccountSettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
  const generateCustomerPortalUrl = useAction(
    api.polar.generateCustomerPortalUrl
  );
  const { signOut, hasPremium, products } = useUser();
  const router = useRouter();

  // Handle upgrade button click
  const handleUpgrade = useCallback(async () => {
    if (!products?.premium?.id) {
      return;
    }

    try {
      const { url } = await generateCheckoutLink({
        productIds: [products.premium.id],
        origin: window.location.origin,
        successUrl: `${window.location.origin}/settings?upgraded=true`,
      });

      window.location.href = url;
    } catch (_error) {
      toast({
        title: "Unable to start upgrade process",
        description:
          "Please try again or contact support if the problem persists.",
        status: "error",
      });
    }
  }, [products?.premium?.id, generateCheckoutLink]);

  // Handle manage subscription button click
  const handleManageSubscription = useCallback(async () => {
    try {
      const { url } = await generateCustomerPortalUrl({});
      window.location.href = url;
    } catch (_error) {
      toast({
        title: "Unable to access customer portal",
        description:
          "Please try again or contact support if the problem persists.",
        status: "error",
      });
    }
  }, [generateCustomerPortalUrl]);

  // Memoize the delete account handler
  const handleDeleteAccount = useCallback(() => {
    setShowDeleteAccountDialog(true);
  }, []);

  const confirmDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteAccount({});
      await signOut();
      toast({ title: "Account deleted", status: "success" });
      router.push("/");
    } catch {
      toast({
        title: "Failed to delete account",
        status: "error",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteAccountDialog(false);
    }
  }, [deleteAccount, signOut, router]);

  // Render the subscription button - memoize to prevent unnecessary re-renders
  const renderSubscriptionButton = useCallback(() => {
    if (hasPremium) {
      return (
        <Button
          className="w-full cursor-pointer md:w-64"
          onClick={handleManageSubscription}
        >
          Manage Subscription
        </Button>
      );
    }

    if (products?.premium?.id) {
      return (
        <Button
          className="w-full cursor-pointer md:w-64"
          onClick={handleUpgrade}
        >
          Upgrade Now
        </Button>
      );
    }

    return (
      <Button className="w-full md:w-64" disabled variant="secondary">
        Loading products...
      </Button>
    );
  }, [
    hasPremium,
    products?.premium?.id,
    handleUpgrade,
    handleManageSubscription,
  ]);

  return (
    <div className="w-full space-y-8">
      <div className="space-y-12">
        {/* Pro Plan Benefits */}
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <h2 className="text-left font-bold text-2xl">
              {hasPremium ? "Pro Plan Benefits" : "Upgrade to Pro"}
            </h2>
            {!hasPremium && (
              <div className="mt-2 flex items-baseline gap-1 md:mt-0">
                <span className="font-bold text-3xl">$10</span>
                <span className="text-base text-muted-foreground">/month</span>
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col items-start rounded-lg border border-secondary/40 bg-card/30 px-6 py-4">
              <div className="mb-2 flex items-center">
                <Rocket className="mr-2 h-5 w-5 text-primary" />
                <span className="font-semibold text-base">
                  Access to All Models
                </span>
              </div>
              <p className="text-muted-foreground/80 text-sm">
                Get access to our full suite of models including Claude,
                o4-mini-high, and more!
              </p>
            </div>
            <div className="flex flex-col items-start rounded-lg border border-secondary/40 bg-card/30 px-6 py-4">
              <div className="mb-2 flex items-center">
                <Sparkle className="mr-2 h-5 w-5 text-primary" />
                <span className="font-semibold text-base">Generous Limits</span>
              </div>
              <p className="text-muted-foreground/80 text-sm">
                Receive{" "}
                <span className="font-bold text-foreground">
                  1500 standard credits
                </span>{" "}
                per month, plus{" "}
                <span className="font-bold text-foreground">
                  100 premium credits*
                </span>{" "}
                per month.
              </p>
            </div>
            <div className="flex flex-col items-start rounded-lg border border-secondary/40 bg-card/30 px-6 py-4">
              <div className="mb-2 flex items-center">
                <Headset className="mr-2 h-5 w-5 text-primary" />
                <span className="font-semibold text-base">
                  Priority Support
                </span>
              </div>
              <p className="text-muted-foreground/80 text-sm">
                Get faster responses and dedicated assistance from the team
                whenever you need help!
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-4 md:flex-row">
            {renderSubscriptionButton()}
          </div>
          <p className="text-muted-foreground/60 text-sm">
            <span className="mx-0.5 font-medium text-base">*</span>Premium
            credits are used for GPT Image Gen, Claude Sonnet, Gemini 2.5 Pro,
            GPT-5, o3, and Grok 3/4. Additional Premium credits can be purchased
            separately.
          </p>
          <div className="mt-6 md:hidden">
            <MessageUsageCard />
          </div>
        </section>
      </div>

      {/* Danger Zone - Moved outside and styled to match theme */}
      <section className="mt-20 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-left font-bold text-2xl">Danger Zone</h2>
        </div>
        <p className="px-0.25 py-1.5 text-muted-foreground/80 text-sm">
          Permanently delete your account and all associated data.
        </p>
        <Button
          disabled={isDeleting}
          onClick={handleDeleteAccount}
          size="sm"
          variant="destructive"
        >
          {isDeleting ? (
            <>
              <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            "Delete Account"
          )}
        </Button>
      </section>

      {/* Delete account confirmation dialog */}
      <Dialog
        onOpenChange={setShowDeleteAccountDialog}
        open={showDeleteAccountDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              account and all associated data including chat history, API keys,
              and all other settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setShowDeleteAccountDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={confirmDeleteAccount} variant="destructive">
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
