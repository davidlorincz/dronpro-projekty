"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { csCZ } from "@clerk/localizations";

export function Providers({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      console.warn("NEXT_PUBLIC_CONVEX_URL není nastavená. Spusť 'npx convex dev'.");
      return null;
    }
    return new ConvexReactClient(url);
  }, []);

  if (!convex) return <>{children}</>;

  return (
    <ClerkProvider
      localization={csCZ}
      signInUrl="/login"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
      signUpUrl="/login"
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
