import { Suspense } from "react";
import { CalendarView } from "@/components/events/calendar/CalendarView";

export default function KalendarPage() {
  // useSearchParams (stav kalendáře v URL) vyžaduje Suspense hranici.
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
