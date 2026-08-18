import { Suspense } from "react";
import { ProjectDetail } from "@/components/projects/ProjectDetail";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><ProjectDetail id={id as Id<"projects">} /></Suspense>;
}
