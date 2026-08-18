import type { Metadata } from "next";
import { Providers } from "@/providers/convex-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Projekty | DRONPRO",
  description: "Interní nástroj pro řízení projektů DRONPRO.",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body className="antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
