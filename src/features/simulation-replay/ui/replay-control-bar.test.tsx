import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReplayControlBar } from "./replay-control-bar";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// The engine module transitively imports the backend API (→ Firebase init);
// the bar only needs the speed list and erased types.
vi.mock("../model/use-replay-engine", () => ({
  REPLAY_SPEEDS: [0.5, 1, 2, 4],
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}[${params.current}/${params.total}]` : key,
  }),
}));

// Radix Slider/Select rely on pointer APIs happy-dom doesn't fully provide — test doubles.
vi.mock("@/shared/ui/slider", () => ({
  Slider: ({
    value,
    min,
    max,
    disabled,
    onValueChange,
    onValueCommit,
    ...props
  }: {
    value: number[];
    min: number;
    max: number;
    disabled?: boolean;
    onValueChange?: (value: number[]) => void;
    onValueCommit?: (value: number[]) => void;
    "aria-label"?: string;
  }) => (
    <input
      type="range"
      data-testid="scrubber"
      value={value[0]}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={props["aria-label"]}
      onChange={(e) => {
        onValueChange?.([Number(e.target.value)]);
        onValueCommit?.([Number(e.target.value)]);
      }}
    />
  ),
}));

vi.mock("@/shared/ui/select", () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="speed-select" data-value={value} data-disabled={disabled ? "true" : "false"}>
      <button type="button" data-testid="speed-2x" onClick={() => onValueChange?.("2")}>
        2x
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderBar(overrides: Partial<Parameters<typeof ReplayControlBar>[0]> = {}) {
  const props = {
    status: "paused" as const,
    currentRound: 5,
    finalRound: 20,
    speed: 1 as const,
    isPlaying: false,
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onSpeedChange: vi.fn(),
    ...overrides,
  };
  render(<ReplayControlBar {...props} />);
  return props;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ReplayControlBar", () => {
  it("shows the play label when paused and fires onTogglePlay on click", () => {
    const props = renderBar({ isPlaying: false });

    const button = screen.getByRole("button", { name: "replay.play" });
    fireEvent.click(button);

    expect(props.onTogglePlay).toHaveBeenCalledOnce();
  });

  it("shows the pause label while playing", () => {
    renderBar({ isPlaying: true, status: "playing" });

    expect(screen.getByRole("button", { name: "replay.pause" })).toBeInTheDocument();
  });

  it("wires the scrubber to the round range and fires onSeek on commit", () => {
    const props = renderBar({ currentRound: 5, finalRound: 20 });

    const scrubber = screen.getByTestId("scrubber") as HTMLInputElement;
    expect(scrubber.min).toBe("0");
    expect(scrubber.max).toBe("20");
    expect(scrubber.value).toBe("5");

    fireEvent.change(scrubber, { target: { value: "12" } });

    expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(12);
  });

  it("renders the round counter with current and total", () => {
    renderBar({ currentRound: 5, finalRound: 20 });

    expect(screen.getByText("replay.roundLabel[5/20]")).toBeInTheDocument();
  });

  it("shows the seeking label while a chunk downloads", () => {
    renderBar({ status: "seeking" });

    expect(screen.getByText("replay.seeking")).toBeInTheDocument();
  });

  it("disables controls while loading", () => {
    renderBar({ status: "loading", finalRound: null });

    expect(screen.getByRole("button", { name: "replay.play" })).toBeDisabled();
    expect(screen.getByTestId("scrubber")).toBeDisabled();
    expect(screen.getByTestId("speed-select")).toHaveAttribute("data-disabled", "true");
  });

  it("fires onSpeedChange with the numeric speed", () => {
    const props = renderBar();

    fireEvent.click(screen.getByTestId("speed-2x"));

    expect(props.onSpeedChange).toHaveBeenCalledExactlyOnceWith(2);
  });
});
