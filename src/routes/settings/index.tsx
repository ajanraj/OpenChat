import {
  CheckIcon,
  CircleNotchIcon,
  HeadsetIcon,
  RocketIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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

/** Manages an active plan, or starts the upgrade once the plan is known. */
const SubscriptionButton = ({
  hasPremium,
  isLoading,
  onManage,
  onUpgrade,
}: {
  hasPremium: boolean;
  isLoading: boolean;
  onManage: () => void;
  onUpgrade: () => void;
}) => {
  if (hasPremium) {
    return (
      <Button
        className="w-full cursor-pointer md:w-auto"
        onClick={onManage}
        variant="outline"
      >
        Manage Subscription
      </Button>
    );
  }
  if (isLoading) {
    return (
      <Button className="w-full md:w-auto" disabled variant="secondary">
        Loading...
      </Button>
    );
  }
  return (
    <Button className="w-full cursor-pointer md:w-auto" onClick={onUpgrade}>
      <SparkleIcon className="mr-2 size-4" weight="fill" />
      Upgrade Now
    </Button>
  );
};

export const AccountSettingsPage = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const createCheckout = useAction(api.stripe.createCheckout);
  const createPortalSession = useAction(api.stripe.createPortalSession);
  const { signOut, hasPremium, isLoading } = useUser();
  const router = useRouter();

  const handleUpgrade = useCallback(async () => {
    const checkoutUrl = await createCheckout({})
      .then(({ url }) => url)
      .catch((error: unknown) => {
        console.error("Failed to start upgrade process:", error);
        toast({
          title: "Unable to start upgrade process",
          description:
            "Please try again or contact support if the problem persists.",
          status: "error",
        });
        return null;
      });
    if (checkoutUrl === null || checkoutUrl === "") {
      return;
    }

    window.location.href = checkoutUrl;
  }, [createCheckout]);

  const handleManageSubscription = useCallback(async () => {
    const customerPortalUrl = await createPortalSession({})
      .then(({ url }) => url)
      .catch((error: unknown) => {
        console.error("Failed to access customer portal:", error);
        toast({
          title: "Unable to access customer portal",
          description:
            "Please try again or contact support if the problem persists.",
          status: "error",
        });
        return null;
      });
    if (customerPortalUrl === null || customerPortalUrl === "") {
      return;
    }

    window.location.href = customerPortalUrl;
  }, [createPortalSession]);

  const handleDeleteAccount = useCallback(() => {
    setShowDeleteAccountDialog(true);
  }, []);

  const confirmDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    await deleteAccount({})
      .then(async () => {
        await signOut();
        toast({ title: "Account deleted", status: "success" });
        void router.navigate({ to: "/" });
      })
      .catch((error: unknown) => {
        console.error("Failed to delete account:", error);
        toast({
          title: "Failed to delete account",
          status: "error",
        });
      })
      .finally(() => {
        setIsDeleting(false);
        setShowDeleteAccountDialog(false);
      });
  }, [deleteAccount, signOut, router]);

  const subscriptionButton = (
    <SubscriptionButton
      hasPremium={hasPremium}
      isLoading={isLoading}
      onManage={() => {
        void handleManageSubscription();
      }}
      onUpgrade={() => {
        void handleUpgrade();
      }}
    />
  );

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
        {hasPremium && (
          <>
            <div className="flex items-baseline justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">
                Premium Plan
              </h1>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Active
              </span>
            </div>
            <p className="leading-relaxed text-muted-foreground">
              You have access to all premium features and priority support.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <RocketIcon className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">All Models</p>
                  <p className="text-xs text-muted-foreground">
                    Claude, GPT-5 & more
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <SparkleIcon className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">1600 Credits</p>
                  <p className="text-xs text-muted-foreground">
                    1500 + 100 premium*
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <HeadsetIcon className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Priority Support</p>
                  <p className="text-xs text-muted-foreground">
                    Fast responses
                  </p>
                </div>
              </div>
            </div>
            {subscriptionButton}
          </>
        )}

        {!hasPremium && (
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-primary/[0.08] to-transparent">
            <div className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Upgrade to Premium
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                      Unlock the full potential of AI
                    </p>
                  </div>

                  <ul className="space-y-2.5">
                    {features.map((feature) => (
                      <li
                        className="flex items-center gap-2 text-sm"
                        key={feature}
                      >
                        <div className="flex size-5 items-center justify-center rounded-full bg-primary/20">
                          <CheckIcon
                            className="size-3 text-primary"
                            weight="bold"
                          />
                        </div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col items-center rounded-xl border bg-background/80 p-6 text-center backdrop-blur-sm sm:min-w-[200px]">
                  <div className="mb-1 text-sm text-muted-foreground">
                    Monthly
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold tracking-tight">
                      $10
                    </span>
                  </div>
                  <div className="mt-4 w-full">{subscriptionButton}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          *Premium credits are used for models marked with a gem icon in the
          model selector. This includes, among others, Claude Sonnet, GPT-5
          (Reasoning), Grok 3/4, Image Generation models, and Gemini 2.5 Pro.{" "}
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
        <h2 className="text-lg font-semibold tracking-tight text-destructive">
          Danger Zone
        </h2>
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/[0.02] p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all associated data. This
              cannot be undone.
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
                <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <TrashIcon className="mr-2 size-4" />
                Delete
              </>
            )}
          </Button>
        </div>
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
              and all other settings. Any active subscription is canceled
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowDeleteAccountDialog(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void confirmDeleteAccount();
              }}
              variant="destructive"
            >
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const Route = createFileRoute("/settings/")({
  component: AccountSettingsPage,
});
