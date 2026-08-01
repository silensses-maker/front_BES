import { useSimulationStore } from "@/entities/simulation";
import { useReplayEngine } from "../model/use-replay-engine";
import { ReplayControlBar } from "./replay-control-bar";

interface ReplayDockProps {
  runId: string;
  networkId: string;
}

/**
 * Self-contained replay control for the live run view: mounts the replay
 * engine once the run is completed and its topology is loaded, and renders
 * the transport bar. Renders nothing while the run is live, when frames are
 * unavailable (not persisted / expired), or on engine error.
 */
export function ReplayDock({ runId, networkId }: ReplayDockProps) {
  const status = useSimulationStore((s) => s.status);
  const storeRunId = useSimulationStore((s) => s.runId);
  const topology = useSimulationStore((s) => s.topology);

  // Same stale-topology gate as useSimulationStream: only trust store data
  // that belongs to the run this view was mounted for.
  const ready = status === "completed" && storeRunId === runId && topology !== null;
  const agentCount = ready ? topology.agents.length : null;

  const engine = useReplayEngine(runId, networkId, agentCount);

  if (engine.status === "idle" || engine.status === "unavailable" || engine.status === "error") {
    return null;
  }

  return (
    <ReplayControlBar
      status={engine.status}
      currentRound={engine.currentRound}
      finalRound={engine.finalRound}
      speed={engine.speed}
      isPlaying={engine.isPlaying}
      onTogglePlay={engine.togglePlay}
      onSeek={engine.seek}
      onSpeedChange={engine.setSpeed}
    />
  );
}
