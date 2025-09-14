import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
