export type EncoderSilenceStrategy = 0 | 1 | 2 | 3;
export type EncoderSilenceEffect = 0 | 1 | 2;
export type EncoderCognitiveBias = 0 | 1 | 2 | 3 | 4;
export type EncoderSaveMode = 0 | 1 | 2;

export interface EncoderAgentSpec {
  name: string;
  belief: number;
  toleranceRadius: number;
  toleranceOffset: number;
  silenceStrategy: EncoderSilenceStrategy;
  silenceEffect: EncoderSilenceEffect;
  majorityThreshold?: number;
  confidence?: number;
}

export interface EncoderEdgeSpec {
  source: string;
  target: string;
  influence: number;
  bias: EncoderCognitiveBias;
}

export interface CustomSimulationParams {
  networkName: string;
  stopThreshold: number;
  iterationLimit: number;
  saveMode: EncoderSaveMode;
  agents: EncoderAgentSpec[];
  edges: EncoderEdgeSpec[];
}

export const BINARY_THRESHOLD_BYTES = 512_000;

export function estimateJsonSize(
  agents: { name: string }[],
  edges: { source: string; target: string }[],
): number {
  return agents.length * 100 + edges.length * 50;
}

export function encodeCustomSimulation(params: CustomSimulationParams): ArrayBuffer {
  const bytes: number[] = [];

  const writeFloat32 = (v: number): void => {
    const b = new ArrayBuffer(4);
    new DataView(b).setFloat32(0, v, true);
    for (const byte of new Uint8Array(b)) bytes.push(byte);
  };

  const writeInt32 = (v: number): void => {
    const b = new ArrayBuffer(4);
    new DataView(b).setInt32(0, v, true);
    for (const byte of new Uint8Array(b)) bytes.push(byte);
  };

  const writeUint8 = (v: number): void => {
    bytes.push(v & 0xff);
  };

  const writeString = (s: string): void => {
    const encoded = new TextEncoder().encode(s);
    writeUint8(encoded.length);
    for (const byte of encoded) writeUint8(byte);
  };

  const alignTo4 = (): void => {
    while (bytes.length % 4 !== 0) bytes.push(0);
  };

  // 1. Header
  writeFloat32(params.stopThreshold);
  writeInt32(params.iterationLimit);
  writeUint8(params.saveMode);
  writeString(params.networkName);
  alignTo4();

  // 2. Agents
  const n = params.agents.length;
  writeInt32(n);
  for (const a of params.agents) writeFloat32(a.belief);
  for (const a of params.agents) writeFloat32(a.toleranceRadius);
  for (const a of params.agents) writeFloat32(a.toleranceOffset);
  for (const a of params.agents) writeUint8(a.silenceStrategy);
  for (const a of params.agents) writeUint8(a.silenceEffect);
  for (const a of params.agents) writeString(a.name);
  alignTo4();

  // 3. Edges
  const m = params.edges.length;
  writeInt32(m);
  for (const e of params.edges) writeFloat32(e.influence);
  for (const e of params.edges) writeUint8(e.bias);
  for (const e of params.edges) writeString(e.source);
  for (const e of params.edges) writeString(e.target);

  // 4. Optional Majority/Confidence chunks
  params.agents.forEach((a, i) => {
    if (a.silenceStrategy === 1 || a.silenceStrategy === 3) {
      writeInt32(i);
      writeFloat32(a.majorityThreshold ?? 0);
      writeFloat32(a.silenceStrategy === 3 ? (a.confidence ?? 0) : 2.0);
    }
  });

  return new Uint8Array(bytes).buffer;
}
