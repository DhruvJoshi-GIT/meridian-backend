/**
 * Typed client for the Meridian backend (../backend).
 * Vite proxies /api -> http://localhost:4000 in dev (see vite.config.ts), so paths stay relative.
 */

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "meridian.token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set token(v: string | null) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
};

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.json !== undefined) headers["Content-Type"] = "application/json";
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Types (mirror backend responses) ----
export type Risk = "low" | "medium" | "high";
export interface Metric { key: string; label: string; value: number; sub: string; tone: "blue" | "red" | "amber" | "teal"; page: string }
export interface Alert { id: string; level: "Critical" | "Elevated" | "Advisory"; title: string; body: string; kind: string; status: string; relatedPage: string | null; time: string; entity?: { id: string; slug: string; name: string } | null }
export interface Activity { id: string; type: "search" | "simulation" | "report" | "view"; title: string; time: string; label?: string; refType?: string | null; refId?: string | null }
export interface MapNode { id: string; slug: string; name: string; typeLabel: string; risk: Risk; mapX: number | null; mapY: number | null; lat: number | null; lng: number | null }
export interface Entity extends MapNode { type: string; region: string | null; description: string | null; dependencyScore: number; confidence: string; evidenceStatus: string; evidenceNote: string | null; materials: { slug: string; name: string; symbol: string | null; role?: string | null }[]; materialsLabel?: string; connections?: number; connectionsLabel?: string; dependencyScoreLabel?: string }
export interface ChainStage { order: number; stage: string; detail: string | null; id: string; slug: string; name: string; type: string; typeLabel: string; risk: Risk; dependencyScore: number }
export interface SupplyChain { id: string; name: string; note: string | null; material: { slug: string; name: string; symbol: string | null }; stages: ChainStage[] }
export interface SimulationResult { shortfallPct: number; shortfallFromDay: number; recoveryWindowDays: { min: number; max: number }; exposedProjects: number; affectedNodes: number; totalNodes: number; series: { day: number; supplyIndex: number }[]; bars: { height: number; impact: boolean }[]; disclaimer: string }
export interface TariffResult { currentLandedCost: number; scenarioLandedCost: number; delta: number; deltaPct: number; curve: { dutyPct: number; landedCost: number }[]; maxDutyPct: number; disclaimer: string }
export interface Report { id: string; title: string; type: string; rating: string | null; score: number | null; summary: string | null; format: string; createdAt: string; rank?: number; subtitle?: string; content?: { heading: string; body: string; bullets?: string[] }[] }

// ---- Endpoints ----
export const api = {
  login: (email: string, password: string) => request<{ token: string; user: { id: string; name: string; title: string; initials: string } }>("/auth/login", { method: "POST", json: { email, password } }),
  me: () => request<{ user: { id: string; name: string; title: string; initials: string } }>("/auth/me"),

  overview: () => request<{ greeting: string; date: string; dataUpdatedLabel: string; metrics: Metric[]; alerts: Alert[]; recentActivity: Activity[]; mapNodes: MapNode[] }>("/overview"),
  metrics: () => request<{ metrics: Metric[] }>("/metrics"),
  search: (q: string) => request<{ query: string; results: { kind: string; id: string; slug?: string; title: string; subtitle: string; page: string }[]; suggestions?: string[] }>(`/search?q=${encodeURIComponent(q)}`),
  alerts: (params: { status?: string; limit?: number } = {}) => request<{ alerts: Alert[]; unread: number }>(`/alerts?${new URLSearchParams(params as Record<string, string>)}`),
  acknowledgeAlert: (id: string, status: "acknowledged" | "resolved" | "open") => request<{ alert: Alert }>(`/alerts/${id}`, { method: "PATCH", json: { status } }),
  activity: (limit = 10) => request<{ activity: Activity[] }>(`/activity?limit=${limit}`),
  dataSources: () => request<{ sources: { id: string; name: string; kind: string; status: string; lastUpdatedLabel: string }[] }>("/data-sources"),

  materials: () => request<{ materials: { id: string; slug: string; name: string; symbol: string | null; category: string; criticality: string; connectedEntities: number }[] }>("/materials"),
  entities: (params: { type?: string; risk?: Risk; material?: string } = {}) => request<{ entities: Entity[] }>(`/entities?${new URLSearchParams(params as Record<string, string>)}`),
  entity: (idOrSlug: string) => request<{ entity: Entity }>(`/entities/${idOrSlug}`),
  map: (material?: string) => request<{ nodes: (MapNode & { isChokepoint: boolean; chokepointStatus: string | null; confidence: string })[]; routes: { id: string; fromId: string; toId: string; kind: string; corridor: string | null; risk: Risk; from: { mapX: number | null; mapY: number | null }; to: { mapX: number | null; mapY: number | null } }[]; layers: { key: string; label: string }[] }>(`/map${material ? `?material=${material}` : ""}`),
  supplyChains: (material?: string) => request<{ chains: SupplyChain[] }>(`/supply-chains${material ? `?material=${material}` : ""}`),

  dependency: (material = "gallium-nitride") => request<{ headline: string; assessment: { title: string; hhi: number; concentration: string; updatedAt: string; items: ({ rank: number; score: number; rating: string; note: string | null } & MapNode)[] } | null; live: { hhi: number; concentration: string; topTwoSharePct: number; suppliers: { id: string; name: string; sharePct: number }[] } }>(`/dependency?material=${material}`),
  alternatives: (material = "gallium-nitride") => request<{ alternatives: { id: string; name: string; type: string; region: string | null; readiness: string; leadTimeDays: number | null; costDeltaPct: number | null; riskReduction: number | null; notes: string | null }[] }>(`/alternatives?material=${material}`),

  simulationOptions: () => request<{ scenarioTypes: string[]; entities: { id: string; slug: string; name: string }[]; durations: number[]; inventoryBuffers: number[]; defaults: Record<string, string | number> }>("/simulations/options"),
  runSimulation: (input: { scenarioType: string; entityId: string; durationDays: number; inventoryBufferDays: number; supplyReductionPct: number; save?: boolean }) => request<{ simulation: { id?: string; result: SimulationResult } }>("/simulations", { method: "POST", json: input }),

  tariffOptions: () => request<{ defaults: Record<string, string | number> }>("/tariffs/options"),
  calculateTariff: (input: { dutyPct: number; origin?: string; destination?: string; product?: string; baseCost?: number; freight?: number; insurance?: number }) => request<{ result: TariffResult }>("/tariffs/calculate", { method: "POST", json: input }),

  reports: () => request<{ reports: Report[] }>("/reports"),
  report: (id: string) => request<{ report: Report }>(`/reports/${id}`),
  generateReport: (input: { type?: string; title?: string; materialSlug?: string; simulationId?: string } = {}) => request<{ report: Report }>("/reports/generate", { method: "POST", json: input }),
  reportDownloadUrl: (id: string) => `${BASE}/reports/${id}/download`,
};

// ---- Tariff simulator + chain simulation ----
export interface TradeLane { id: string; materialSlug: string; product: string; hsCode: string; origin: string; originCode: string; destination: string; destinationCode: string; unit: string; baseCost: number; freight: number; insurance: number; currentDutyPct: number; volumeShare: number; note: string | null }
export interface SimLane extends Omit<TradeLane, "materialSlug"> { simulatedDutyPct: number; currentLanded: number; simulatedLanded: number; delta: number; deltaPct: number; dutyDeltaPct: number; volumeDeltaPct: number; direction: "up" | "down" | "flat" }
export interface TariffSimulation {
  material: { slug: string; name: string }; dutyPct: number; destination: string | null; referenceDutyPct: number; elasticity: number;
  summary: { lanes: number; weightedDeltaPct: number; weightedCurrent: number; weightedSimulated: number; volumeDeltaPct: number; direction: "up" | "down" | "flat" };
  lanes: SimLane[]; byDestination: { code: string; name: string; lanes: number; currentDutyPct: number; currentLanded: number; simulatedLanded: number; deltaPct: number; volumeDeltaPct: number }[];
  curve: { dutyPct: number; indexPct: number }[]; maxDutyPct: number; disclaimer: string;
}
export interface JourneyPlace { id: string; slug: string; name: string; typeLabel: string; region: string | null; country: string | null; risk: Risk; lat: number | null; lng: number | null; isChokepoint: boolean }
export interface JourneyStep { order: number; stage: string; title: string; description: string; mode: "site" | "sea" | "air" | "road" | "rail"; durationDays: number; from: JourneyPlace | null; to: JourneyPlace | null; path: [number, number][] }
export interface Journey { material: { slug: string; name: string }; steps: JourneyStep[]; totalDays: number; countries: string[]; bounds: { south: number; north: number; west: number; east: number } | null; attribution: string }

export const tariffSim = {
  lanes: (material: string) => request<{ material: { slug: string; name: string }; lanes: TradeLane[]; referenceDutyPct: number; destinations: { code: string; name: string; currentDutyPct: number }[]; hsCodes: string[]; materials: { slug: string; name: string }[] }>("/tariffs/lanes?material=" + encodeURIComponent(material)),
  simulate: (input: { material: string; dutyPct: number; destination?: string; elasticity?: number }) => request<TariffSimulation>("/tariffs/simulate", { method: "POST", json: input }),
};
export const journey = (material = "gallium-nitride") => request<Journey>("/journey?material=" + encodeURIComponent(material));
