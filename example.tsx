import React, { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimulationWebSocket } from "@/contexts/WebSocketContext";
import { useSimulationHistory } from "@/hooks/useSimulationHistory";

export const SimulationChart: React.FC = () => {
  // This destructuring is now correct and matches our updated context
  const {
    connected,
    connect,
    disconnect,
    latestSimulationData,
    messageCount,
    clearData,
  } = useSimulationWebSocket();
  const { history, getLatestRound, getAgentKeys, totalRounds } =
    useSimulationHistory();
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any[]>([]);

  useEffect(() => {
    if (!latestSimulationData) return;

    const validBeliefs = Array.from(latestSimulationData.beliefs).filter(
      (b) => b !== null,
    );

    setDebugInfo((prev) => {
      const newInfo = [...prev];
      if (newInfo.length > 5) newInfo.shift();

      newInfo.push({
        timestamp: new Date().toLocaleTimeString(),
        round: latestSimulationData.round,
        indexReference: latestSimulationData.indexReference,
        totalAgents: latestSimulationData.numberOfAgents,
        validBeliefs: validBeliefs.length,
        sampleBeliefs: validBeliefs.slice(0, 5),
        speaking: Array.from(latestSimulationData.speakingStatuses).slice(0, 5),
      });

      return newInfo;
    });
  }, [latestSimulationData]);

  const handleClearData = () => {
    clearData();
    setDebugInfo([]);
  };

  // The rest of the component logic remains the same as it was already correct.

  // In SimulationChart.tsx

  const generateLines = () => {
    const colors = [
      "#3498db",
      "#2ecc71",
      "#9b59b6",
      "#f1c40f",
      "#e74c3c",
      "#1abc9c",
      "#34495e",
      "#e67e22",
    ];
    const agentKeys = getAgentKeys();
    if (agentKeys.length === 0) return null;

    return agentKeys.map((key, index) => {
      const agentIndex = key.replace("agent", "");
      const speakingKey = `speaking${agentIndex}`;

      // Correctly handle the key prop inside renderDot
      const renderDot = (props: any) => {
        // Destructure the index passed by recharts to avoid name conflicts.
        // This 'dotIndex' is unique for each point on a single line.
        const { cx, cy, payload, index: dotIndex } = props;

        if (payload[speakingKey] === true) {
          // Add the unique key to the circle element
          return (
            <circle
              key={`dot-${key}-${dotIndex}`}
              cx={cx}
              cy={cy}
              r={5}
              fill={colors[index % colors.length]}
              stroke="white"
              strokeWidth={2}
            />
          );
        }

        // The "null" element also needs a key for React to be happy
        return (
          <circle
            key={`dot-null-${key}-${dotIndex}`}
            r={0}
            style={{ display: "none" }}
          />
        );
      };

      return (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={colors[index % colors.length]}
          strokeWidth={2}
          dot={renderDot}
          activeDot={{ r: 6, fill: colors[index % colors.length] }}
          isAnimationActive={false}
        />
      );
    });
  };

  const getCustomXAxisTicks = () => {
    if (history.length <= 1) return [];
    const firstRound = history[0].round;
    const lastRound = history[history.length - 1].round;
    const roundSpan = lastRound - firstRound;

    let interval = 1;
    if (roundSpan > 500) interval = 50;
    else if (roundSpan > 200) interval = 20;
    else if (roundSpan > 100) interval = 10;
    else if (roundSpan > 50) interval = 5;
    else if (roundSpan > 20) interval = 2;

    const ticks = [];
    for (let i = firstRound; i <= lastRound; i += interval) {
      ticks.push(i);
    }
    if (ticks.length > 0 && ticks[ticks.length - 1] < lastRound) {
      ticks.push(lastRound);
    }
    return ticks;
  };

  const currentRound = getLatestRound();

  return (
    <div className="space-y-4">
      {/* Connection Status Card */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-sm">
                {connected ? "Connected" : "Disconnected"}
                {connected && (
                  <span className="text-muted-foreground">
                    {" "}
                    • {messageCount} messages
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={connected ? disconnect : connect}
                variant={connected ? "destructive" : "default"}
                size="sm"
              >
                {connected ? "⏹ Disconnect" : "▶ Connect"}
              </Button>
              <Button onClick={handleClearData} variant="outline" size="sm">
                🗑️ Clear Data
              </Button>
              <Button
                onClick={() => setShowDebug(!showDebug)}
                variant="ghost"
                size="sm"
              >
                {showDebug ? "Hide Debug" : "Show Debug"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debug Panel Card */}
      {showDebug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Messages received: {messageCount}</p>
            <p className="text-sm">Current round: {currentRound}</p>
            <p className="text-sm">Total rounds stored: {totalRounds}</p>
            <p className="text-sm">
              Total agents tracked: {getAgentKeys().length}
            </p>
            {debugInfo.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold">Recent Data Packets:</h4>
                {debugInfo
                  .slice()
                  .reverse()
                  .map((info, idx) => (
                    <div key={idx} className="p-2 bg-muted rounded text-xs">
                      <p>
                        <strong>{info.timestamp}</strong> - Round {info.round}
                      </p>
                      <p>
                        Index Ref: {info.indexReference}, Agents:{" "}
                        {info.totalAgents}, Valid beliefs: {info.validBeliefs}
                      </p>
                      {info.sampleBeliefs.length > 0 && (
                        <div>
                          <strong>Sample beliefs:</strong>{" "}
                          {info.sampleBeliefs.map((b: number, i: number) => (
                            <span
                              key={i}
                              className={
                                info.speaking[i]
                                  ? "font-bold text-green-600"
                                  : ""
                              }
                            >
                              {b?.toFixed(4) ?? "N/A"}
                              {i < info.sampleBeliefs.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Chart Card */}
      <Card>
        <CardHeader>
          <CardTitle>Belief Evolution Over Time</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current Round: {currentRound}
          </p>
          <p className="text-xs text-muted-foreground">
            Displaying data for {totalRounds} rounds, tracking{" "}
            {getAgentKeys().length} agents
            {history.length > 0 &&
              ` (${history[0].round} to ${history[history.length - 1].round})`}
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-4 text-sm">{/* Legend... */}</div>
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <LineChart
                data={history}
                margin={{ top: 10, right: 30, left: 10, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="round"
                  label={{
                    value: "Round",
                    position: "insideBottomRight",
                    offset: -5,
                  }}
                  ticks={getCustomXAxisTicks()}
                  tickMargin={10}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis
                  domain={[0, 1]}
                  label={{
                    value: "Belief Value",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                  }}
                />
                <Tooltip
                  formatter={(value: any) =>
                    typeof value === "number" ? value.toFixed(4) : value
                  }
                  labelFormatter={(label) => `Round ${label}`}
                />
                {generateLines()}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[500px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground">
                  Waiting for data... ({messageCount} messages received)
                </p>
                {messageCount > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Receiving messages. Chart will populate once data is
                    processed.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};