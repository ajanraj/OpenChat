import polar from "@convex-dev/polar/convex.config";
import r2 from "@convex-dev/r2/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import resend from "@convex-dev/resend/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(rateLimiter);
app.use(polar);
app.use(resend);
app.use(r2);

export default app;
