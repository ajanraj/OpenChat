import { createFileRoute } from "@tanstack/react-router";

const ContactPage = () => (
  <div className="mx-auto w-full max-w-xl p-6">
    <h1 className="text-xl font-medium">Contact Us</h1>
    <p className="mt-4 text-muted-foreground">Coming soon.</p>
  </div>
);

export const Route = createFileRoute("/settings/contact")({
  component: ContactPage,
});
