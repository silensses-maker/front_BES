import { useEffect, useState } from "react";
import {
  type BenchProbeEvent,
  getBenchProbeHistory,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";

/** Events kept by the HUD (one network load emits ~20; a session visits a few networks). */
const MAX_EVENTS = 1_024;

/**
 * The bench probe events so far (history first: the lazily loaded HUD mounts after the topology
 * fetch started), updated as new ones arrive.
 */
export function useProbeEvents(): readonly BenchProbeEvent[] {
  const [events, setEvents] = useState<readonly BenchProbeEvent[]>(() => [
    ...getBenchProbeHistory(),
  ]);
  useEffect(() => {
    setEvents([...getBenchProbeHistory()]);
    return subscribeBenchProbe((event) =>
      setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), event]),
    );
  }, []);
  return events;
}
