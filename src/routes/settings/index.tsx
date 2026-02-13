import { Check, CircleNotch, Headset, Rocket, Sparkle, Trash } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { MessageUsageCard } from "@/components/layout/settings/message-usage-card";
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
import { useUser } from "@/providers/user-provider";

export const Route = createFileRoute("/settings/")({
  component: AccountSettingsPage,
});

export function AccountSettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
  const generateCustomerPortalUrl = useAction(api.polar.generateCustomerPortalUrl);
  const { signOut, hasPremium, products } = useUser();
  const router = useRouter();

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
    } catch (error) {
      console.error("Failed to start upgrade process:", error);
      toast({
        title: "Unable to start upgrade process",
        description: "Please try again or contact support if the problem persists.",
        status: "error",
      });
    }
  }, [products?.premium?.id, generateCheckoutLink]);

  const handleManageSubscription = useCallback(async () => {
    try {
      const { url } = await generateCustomerPortalUrl({});
      window.location.href = url;
    } catch (error) {
      console.error("Failed to access customer portal:", error);
      toast({
        title: "Unable to access customer portal",
        description: "Please try again or contact support if the problem persists.",
        status: "error",
      });
    }
  }, [generateCustomerPortalUrl]);

  const handleDeleteAccount = useCallback(() => {
    setShowDeleteAccountDialog(true);
  }, []);

  const confirmDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteAccount({});
      await signOut();
      toast({ title: "Account deleted", status: "success" });
      void router.navigate({ to: "/" });
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast({
        title: "Failed to delete account",
        status: "error",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteAccountDialog(false);
    }
  }, [deleteAccount, signOut, router]);

  const renderSubscriptionButton = useCallback(() => {
    if (hasPremium) {
      return (
        <Button
          className="w-full cursor-pointer md:w-auto"
          onClick={handleManageSubscription}
          variant="outline"
        >
          Manage Subscription
        </Button>
      );
    }

    if (products?.premium?.id) {
      return (
        <Button className="w-full cursor-pointer md:w-auto" onClick={handleUpgrade}>
          <Sparkle className="mr-2 size-4" weight="fill" />
          Upgrade Now
        </Button>
      );
    }

    return (
      <Button className="w-full md:w-auto" disabled variant="secondary">
        Loading...
      </Button>
    );
  }, [hasPremium, products?.premium?.id, handleUpgrade, handleManageSubscription]);

  const features = [
    "Access to all AI models",
    "1500 standard credits/month",
    "100 premium credits/month*",
    "Priority support",
  ];

  return (
    <div className="w-full space-y-10">
      {/* Premium Plan */}
      <section className="space-y-6">
        {Boolean(hasPremium) && (
          <>
            <div className="flex items-baseline justify-between">
              <h1 className="font-semibold text-2xl tracking-tight">Premium Plan</h1>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 text-xs dark:text-emerald-400">
                Active
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              You have access to all premium features and priority support.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Rocket className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">All Models</p>
                  <p className="text-muted-foreground text-xs">Claude, GPT-5 & more</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkle className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">1600 Credits</p>
                  <p className="text-muted-foreground text-xs">1500 + 100 premium*</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Headset className="size-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Priority Support</p>
                  <p className="text-muted-foreground text-xs">Fast responses</p>
                </div>
              </div>
            </div>
            {renderSubscriptionButton()}
          </>
        )}

        {!hasPremium && (
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-primary/[0.08] to-transparent">
            <div className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div>
                    <h1 className="font-semibold text-2xl tracking-tight">Upgrade to Premium</h1>
                    <p className="mt-1 text-muted-foreground">Unlock the full potential of AI</p>
                  </div>

                  <ul className="space-y-2.5">
                    {features.map((feature) => (
                      <li className="flex items-center gap-2 text-sm" key={feature}>
                        <div className="flex size-5 items-center justify-center rounded-full bg-primary/20">
                          <Check className="size-3 text-primary" weight="bold" />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col items-center rounded-xl border bg-background/80 p-6 text-center backdrop-blur-sm sm:min-w-[200px]">
                  <div className="mb-1 text-muted-foreground text-sm">Monthly</div>
                  <div className="flex items-baseline">
                    <span className="font-bold text-5xl tracking-tight">$10</span>
                  </div>
                  <div className="mt-4 w-full">{renderSubscriptionButton()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          *Premium credits are used for models marked with a gem icon in the model selector. This
          includes, among others, Claude Sonnet, GPT-5 (Reasoning), Grok 3/4, Image Generation
          models, and Gemini 2.5 Pro.{" "}
          <Link
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            search={{ tier: "premium" }}
            to="/settings/models"
          >
            See all premium models
          </Link>
        </p>

        <div className="md:hidden">
          <MessageUsageCard />
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h2 className="font-semibold text-destructive text-lg tracking-tight">Danger Zone</h2>
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/[0.02] p-4">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">Delete account</p>
            <p className="text-muted-foreground text-xs">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <Button
            disabled={isDeleting}
            onClick={handleDeleteAccount}
            size="sm"
            variant="destructive"
          >
            {isDeleting ? (
              <>
                <CircleNotch className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash className="mr-2 size-4" />
                Delete
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Delete account confirmation dialog */}
      <Dialog onOpenChange={setShowDeleteAccountDialog} open={showDeleteAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and all
              associated data including chat history, API keys, and all other settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowDeleteAccountDialog(false)} variant="outline">
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
