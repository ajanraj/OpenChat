import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Uploads that got an R2 URL but were never attached to a chat expire after an hour.
crons.interval(
  "cleanup pending uploads",
  { minutes: 15 },
  internal.files.cleanupPendingUploads,
  {}
);

export default crons;
