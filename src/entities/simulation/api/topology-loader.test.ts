import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopologyResponse } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import {
  loadTopology,
  releaseTopologies,
  resetTopologyLoader,
  TOPOLOGY_CACHE_LIMIT,
} from "./topology-loader";

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { getTopologyFull: vi.fn() },
}));

const RUN = "run-1";
const OTHER_RUN = "run-2";

function topologyOf(runId: string, networkId: string): TopologyResponse {
  return {
    runId,
    networkId,
    agentCount: 2,
    edgeCount: 1,
    agentOffset: 0,
    agentLimit: 2,
    edgeOffset: 0,
    edgeLimit: 1,
    agents: [],
    edges: [],
  };
}

interface Download {
  runId: string;
  networkId: string;
  resolve: (topology: TopologyResponse | null) => void;
  reject: (error: unknown) => void;
}

/** Every `getTopologyFull` call stays pending until the test settles it. */
let downloads: Download[] = [];

const download = vi.mocked(simulationsApi.getTopologyFull);

/** Lets the loader's promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetTopologyLoader();
  downloads = [];
  download.mockImplementation(
    (runId, networkId) =>
      new Promise<TopologyResponse | null>((resolve, reject) => {
        downloads.push({ runId, networkId, resolve, reject });
      }),
  );
});

/** Loads `networkId` of `runId` and completes its download with a topology. */
async function loadCompleted(runId: string, networkId: string): Promise<TopologyResponse> {
  const promise = loadTopology(runId, networkId);
  const pending = downloads.find((d) => d.runId === runId && d.networkId === networkId);
  const topology = topologyOf(runId, networkId);
  pending?.resolve(topology);
  await promise;
  return topology;
}

describe("loadTopology — concurrent loads", () => {
  it("shares one download between concurrent loads of the same network", async () => {
    const loads = [
      loadTopology(RUN, "net-1"),
      loadTopology(RUN, "net-1"),
      loadTopology(RUN, "net-1"),
    ];
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(RUN, "net-1");

    const topology = topologyOf(RUN, "net-1");
    downloads[0]?.resolve(topology);
    const results = await Promise.all(loads);

    expect(results).toEqual([topology, topology, topology]);
    expect(results[1]).toBe(topology);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("downloads different networks separately", async () => {
    const a = loadTopology(RUN, "net-1");
    const b = loadTopology(RUN, "net-2");
    expect(download).toHaveBeenCalledTimes(2);

    downloads[0]?.resolve(topologyOf(RUN, "net-1"));
    downloads[1]?.resolve(topologyOf(RUN, "net-2"));
    expect((await a)?.networkId).toBe("net-1");
    expect((await b)?.networkId).toBe("net-2");
  });

  it("does not share a download between runs, even for the same network id", async () => {
    void loadTopology(RUN, "net-1");
    void loadTopology(OTHER_RUN, "net-1");

    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenNthCalledWith(1, RUN, "net-1");
    expect(download).toHaveBeenNthCalledWith(2, OTHER_RUN, "net-1");
  });
});

describe("loadTopology — reuse of a completed download", () => {
  it("reuses the selector's download when the same network is opened in the run view", async () => {
    // Selector: first network's topology for the Composición card
    const selectorTopology = await loadCompleted(RUN, "net-1");
    // Run view: useSimulationStream's prefetch, then the WS topology_ready handler
    const prefetch = await loadTopology(RUN, "net-1");
    const wsLoad = await loadTopology(RUN, "net-1");

    expect(download).toHaveBeenCalledTimes(1);
    expect(prefetch).toBe(selectorTopology);
    expect(wsLoad).toBe(selectorTopology);
  });

  it("never keeps a 202 (null): the next load downloads again", async () => {
    const first = loadTopology(RUN, "net-1");
    downloads[0]?.resolve(null);
    expect(await first).toBeNull();

    const second = loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(2);
    downloads[1]?.resolve(topologyOf(RUN, "net-1"));
    expect((await second)?.networkId).toBe("net-1");
  });

  it("never keeps a failed download: the next load retries", async () => {
    const first = loadTopology(RUN, "net-1");
    downloads[0]?.reject(new Error("503"));
    await expect(first).rejects.toThrow("503");

    void loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(2);
  });

  it(`keeps at most ${TOPOLOGY_CACHE_LIMIT} networks, evicting the least recently used`, async () => {
    expect(TOPOLOGY_CACHE_LIMIT).toBe(2);
    await loadCompleted(RUN, "net-1");
    await loadCompleted(RUN, "net-2");
    // net-1 used again: net-2 becomes the least recently used
    await loadTopology(RUN, "net-1");
    await loadCompleted(RUN, "net-3");
    expect(download).toHaveBeenCalledTimes(3);

    await loadTopology(RUN, "net-1");
    await loadTopology(RUN, "net-3");
    expect(download).toHaveBeenCalledTimes(3);

    void loadTopology(RUN, "net-2");
    expect(download).toHaveBeenCalledTimes(4);
    expect(download).toHaveBeenLastCalledWith(RUN, "net-2");
  });

  it("neither counts nor evicts running downloads", async () => {
    // Oldest entry, still running when the limit is exceeded
    void loadTopology(RUN, "net-1");
    await loadCompleted(RUN, "net-2");
    await loadCompleted(RUN, "net-3");
    await loadCompleted(RUN, "net-4");
    expect(download).toHaveBeenCalledTimes(4);

    // net-1 is joined, net-3 and net-4 are reused; net-2 (LRU completed) was evicted
    void loadTopology(RUN, "net-1");
    await loadTopology(RUN, "net-3");
    await loadTopology(RUN, "net-4");
    expect(download).toHaveBeenCalledTimes(4);
    void loadTopology(RUN, "net-2");
    expect(download).toHaveBeenCalledTimes(5);
  });

  it("never reuses another run's topology: loading a new run drops the previous one", async () => {
    await loadCompleted(RUN, "net-1");
    const other = await loadCompleted(OTHER_RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(2);
    expect(other.runId).toBe(OTHER_RUN);

    void loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(3);
  });

  it("does not keep a previous run's download that completes after another run was loaded", async () => {
    const stale = loadTopology(RUN, "net-1");
    void loadTopology(OTHER_RUN, "net-9");
    downloads[0]?.resolve(topologyOf(RUN, "net-1"));
    // Its own caller still gets the topology…
    expect((await stale)?.runId).toBe(RUN);

    // …but it is not kept
    void loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(3);
  });
});

describe("loadTopology — joiners of a download that fails or answers 202", () => {
  it("a joiner of a failed download makes one attempt of its own", async () => {
    const owner = loadTopology(RUN, "net-1");
    const joiner = loadTopology(RUN, "net-1");
    downloads[0]?.reject(new Error("transient"));

    await expect(owner).rejects.toThrow("transient");
    await flush();
    expect(download).toHaveBeenCalledTimes(2);

    const topology = topologyOf(RUN, "net-1");
    downloads[1]?.resolve(topology);
    expect(await joiner).toBe(topology);
  });

  it("a joiner of a 202 makes one attempt of its own (the topology may have become ready)", async () => {
    const owner = loadTopology(RUN, "net-1");
    const joiner = loadTopology(RUN, "net-1");
    downloads[0]?.resolve(null);

    expect(await owner).toBeNull();
    await flush();
    expect(download).toHaveBeenCalledTimes(2);
    downloads[1]?.resolve(null);
    expect(await joiner).toBeNull();
    // One attempt only: no third download
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("several joiners share a single retry", async () => {
    void loadTopology(RUN, "net-1").catch(() => {});
    const joiners = [loadTopology(RUN, "net-1"), loadTopology(RUN, "net-1")];
    downloads[0]?.reject(new Error("transient"));
    await flush();

    expect(download).toHaveBeenCalledTimes(2);
    const topology = topologyOf(RUN, "net-1");
    downloads[1]?.resolve(topology);
    expect(await Promise.all(joiners)).toEqual([topology, topology]);
  });

  it("a joiner gets the error back without retrying once the run was left", async () => {
    void loadTopology(RUN, "net-1").catch(() => {});
    const joiner = loadTopology(RUN, "net-1");
    releaseTopologies(RUN);
    downloads[0]?.reject(new Error("gone"));

    await expect(joiner).rejects.toThrow("gone");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("a joiner gets the 202 back without retrying once another run was loaded", async () => {
    void loadTopology(RUN, "net-1");
    const joiner = loadTopology(RUN, "net-1");
    void loadTopology(OTHER_RUN, "net-9");
    downloads[0]?.resolve(null);

    expect(await joiner).toBeNull();
    expect(download).toHaveBeenCalledTimes(2);
  });
});

describe("releaseTopologies", () => {
  it("drops the run's completed topologies: the next load downloads again", async () => {
    await loadCompleted(RUN, "net-1");
    releaseTopologies(RUN);

    void loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for a run that is not held", async () => {
    await loadCompleted(RUN, "net-1");
    releaseTopologies(OTHER_RUN);

    await loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("does not keep a download that completes after the run was left", async () => {
    const pending = loadTopology(RUN, "net-1");
    releaseTopologies(RUN);
    downloads[0]?.resolve(topologyOf(RUN, "net-1"));
    expect((await pending)?.networkId).toBe("net-1");

    void loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("keeps a running download joinable when the run is reloaded at once (StrictMode replay)", async () => {
    const first = loadTopology(RUN, "net-1");
    releaseTopologies(RUN);
    const replay = loadTopology(RUN, "net-1");
    expect(download).toHaveBeenCalledTimes(1);

    const topology = topologyOf(RUN, "net-1");
    downloads[0]?.resolve(topology);
    expect(await first).toBe(topology);
    expect(await replay).toBe(topology);

    // The run is viewed again: the completed download is kept
    expect(await loadTopology(RUN, "net-1")).toBe(topology);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
