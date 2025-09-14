import {
  EnvelopeSimple,
  FileText,
  GithubLogo,
  ShieldCheck,
  TwitterLogo,
} from "@phosphor-icons/react";
// import Image from "next/image"
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AppInfoContent() {
  return (
    <div className="flex w-full flex-col items-center p-4">
      {/*
      <Image
        src="/oschat-logo.svg"
        alt="oschat logo"
        width={40}
        height={40}
        className="rounded-lg"
      />
      */}
      <p className="mt-4 text-center font-medium text-foreground text-sm">
        OS Chat
      </p>
      <p className="mb-4 text-center text-muted-foreground text-sm">
        AI application built with Vercel SDK, RSC, Convex, and Shadcn UI
      </p>
      <div className="flex w-full flex-col gap-2">
        <Button
          asChild
          className="w-full rounded-lg"
          size="sm"
          variant="outline"
        >
          <a
            className="flex w-full items-center justify-center"
            href="https://github.com/ajanraj/openchat"
            rel="noopener noreferrer"
            target="_blank"
          >
            <GithubLogo className="mr-2 size-4" />
            Repository
          </a>
        </Button>
        <Button
          asChild
          className="w-full rounded-lg"
          size="sm"
          variant="outline"
        >
          <a
            className="flex w-full items-center justify-center"
            href="https://twitter.com/ajanraj25"
            rel="noopener noreferrer"
            target="_blank"
          >
            <TwitterLogo className="mr-2 size-4" />
            Twitter
          </a>
        </Button>
        <Button
          asChild
          className="w-full rounded-lg"
          size="sm"
          variant="outline"
        >
          <a
            className="flex w-full items-center justify-center"
            href="mailto:support@oschat.ai"
            rel="noopener noreferrer"
            target="_blank"
          >
            <EnvelopeSimple className="mr-2 size-4" />
            Support
          </a>
        </Button>
        <Button
          asChild
          className="w-full rounded-lg"
          size="sm"
          variant="outline"
        >
          <Link
            className="flex w-full items-center justify-center"
            href="/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            <FileText className="mr-2 size-4" />
            Terms
          </Link>
        </Button>
        <Button
          asChild
          className="w-full rounded-lg"
          size="sm"
          variant="outline"
        >
          <Link
            className="flex w-full items-center justify-center"
            href="/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            <ShieldCheck className="mr-2 size-4" />
            Privacy Policy
          </Link>
        </Button>
      </div>
    </div>
  );
}
