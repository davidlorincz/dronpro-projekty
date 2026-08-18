"use client";

import { SignIn } from "@clerk/nextjs";
import { DronProLogo } from "@/components/shared/DronProLogo";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-a-bg flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <DronProLogo className="h-8" />
        <span className="text-xs font-semibold uppercase tracking-widest text-a-text-4">Projekty</span>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-md",
            card: "shadow-none border border-a-border rounded-2xl",
            formButtonPrimary: "bg-[#0eb24f] hover:bg-[#0c9a43] rounded-xl font-semibold",
            formFieldInput: "rounded-xl border-a-border focus:ring-cyan-500 focus:border-cyan-500",
            footerActionLink: "text-cyan-600 hover:text-cyan-700",
          },
        }}
        fallbackRedirectUrl="/"
        routing="path" path="/login" withSignUp
      />
      {/* Clerk Smart CAPTCHA (bot protection) potřebuje tento element */}
      <div id="clerk-captcha" className="mt-4" />
    </div>
  );
}
