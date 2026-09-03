import { EventDetail } from "@/components/events/EventDetail";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default async function ZakazkaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail id={id as Id<"events">} kind="job" />;
}
