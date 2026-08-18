import { Suspense } from "react";
import { PortfolioView } from "@/components/projects/PortfolioView";

export default function ArchivePage() {
  return <Suspense><PortfolioView forcedScope="archived" /></Suspense>;
}
