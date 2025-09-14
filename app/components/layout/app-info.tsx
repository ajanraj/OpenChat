"use client";

import {
  EnvelopeSimple,
  FileText,
  Info,
  ShieldCheck,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";

const InfoContent = () => (
  <div className="space-y-4">
    <p className="text-foreground leading-relaxed">
      {APP_DESCRIPTION} Built with Vercel&apos;s AI SDK, Supabase, and
      prompt-kit components.
    </p>
    <p className="text-foreground leading-relaxed">
      The code is available on{" "}
      <a
        className="underline"
        href="https://github.com/ajanraj/OpenChat"
        rel="noopener noreferrer"
        target="_blank"
      >
        GitHub
      </a>
      . Edited by{" "}
      <a
        className="underline"
        href="https://twitter.com/ajanraj25"
        rel="noopener noreferrer"
        target="_blank"
      >
        @ajanraj25
      </a>
      .
    </p>
    <p className="text-foreground leading-relaxed">
      <a
        className="underline"
        href="mailto:support@oschat.ai"
        rel="noopener noreferrer"
        target="_blank"
      >
        <EnvelopeSimple className="mr-1 inline size-4 align-text-bottom" />
        support@oschat.ai
      </a>
      <span className="mx-2">·</span>
      <Link
        className="underline"
        href="/terms"
        rel="noopener noreferrer"
        target="_blank"
      >
        <FileText className="mr-1 inline size-4 align-text-bottom" />
        Terms
      </Link>
      <span className="mx-2">·</span>
      <Link
        className="underline"
        href="/privacy"
        rel="noopener noreferrer"
        target="_blank"
      >
        <ShieldCheck className="mr-1 inline size-4 align-text-bottom" />
        Privacy Policy
      </Link>
    </p>
  </div>
);

const defaultTrigger = (
  <Button
    aria-label={`About ${APP_NAME}`}
    className="h-8 w-8 rounded-full bg-background/80 text-muted-foreground hover:bg-muted"
    size="icon"
    variant="ghost"
  >
    <Info className="size-4" />
  </Button>
);

type AppInfoProps = {
  trigger?: React.ReactNode;
};

export function AppInfo({ trigger = defaultTrigger }: AppInfoProps) {
  const isMobile = useBreakpoint(768);

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="border-border bg-background">
          <DrawerHeader>
            <Image
              alt={`calm paint generate by ${APP_NAME}`}
              className="h-32 w-full object-cover"
              height={128}
              src="/banner_ocean.jpg"
              width={400}
            />
            <DrawerTitle className="hidden">{APP_NAME}</DrawerTitle>
            <DrawerDescription className="hidden">
              Your minimalist AI chat companion
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <InfoContent />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 shadow-xs sm:max-w-md [&>button:last-child]:rounded-full [&>button:last-child]:bg-background [&>button:last-child]:p-1">
        <DialogHeader className="p-0">
          <Image
            alt={`calm paint generate by ${APP_NAME}`}
            className="h-32 w-full object-cover"
            height={128}
            src="/banner_ocean.jpg"
            width={400}
          />
          <DialogTitle className="hidden">{APP_NAME}</DialogTitle>
          <DialogDescription className="hidden">
            Your minimalist AI chat companion
          </DialogDescription>
        </DialogHeader>
        <div className="p-4">
          <InfoContent />
        </div>
      </DialogContent>
    </Dialog>
  );
}
