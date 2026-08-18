import { Suspense } from "react";
import { PortfolioView } from "@/components/projects/PortfolioView";

export default function ProjectsPage() {
  return <Suspense><PortfolioView /></Suspense>;
}
