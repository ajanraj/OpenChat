import posthog from "posthog-js";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/p",
    ui_host: "https://eu.posthog.com",
    capture_pageview: "history_change",
    capture_pageleave: true, // Enable pageleave capture
    capture_exceptions: true, // This enables capturing exceptions using Error Tracking
    debug: process.env.NODE_ENV === "development",
  });
}
