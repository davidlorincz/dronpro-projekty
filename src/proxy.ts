import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Veřejné cesty: login, SSO callback, sdílený read-only odkaz.
const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/share(.*)",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
