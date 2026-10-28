import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Bell, Boxes, ChevronDown, ChevronRight, CircleHelp,
  FileText, Gauge, Globe2, Layers3, Menu, Network, PanelLeftClose, Search,
  Settings, Ship, SlidersHorizontal, Sparkles, TrendingUp, X, ZoomIn, ZoomOut,
  MapPin, Factory, Route, ShieldCheck, ArrowUpRight, Play, Download, Loader2
} from "lucide-react";
import { api, type Alert as AlertT, type Entity, type MapNode, type SimulationResult, type TariffResult } from "./lib/api";

type Page = "Overview" | "Supply Chain Explorer" | "Global Map" | "Dependency Analysis" | "Disruption Simulator" | "Tariff Intelligence" | "Alternative Sources" | "Reports";

const nav: { label: Page; icon: typeof Globe2 }[] = [
  { label: "Overview", icon: Gauge }, { label: "Supply Chain Explorer", icon: Network },
  { label: "Global Map", icon: Globe2 }, { label: "Dependency Analysis", icon: Activity },
  { label: "Disruption Simulator", icon: SlidersHorizontal }, { label: "Tariff Intelligence", icon: TrendingUp },
  { label: "Alternative Sources", icon: Boxes }, { label: "Reports", icon: FileText },
];

const MATERIAL = "gallium-nitride";
const riskTone = (r?: string) => (r === "high" ? "red" : r === "medium" ? "amber" : "teal");
const ratingTone = (r?: string | null) => (r === "High" ? "red" : r === "Moderate" ? "amber" : "teal");
const levelTone = (l: string) => (l === "Critical" ? "red" : l === "Elevated" ? "amber" : "blue");
const typeIcon = (t?: string) => (t === "LOGISTICS" ? Ship : t === "END_USE" ? ShieldCheck : t === "RAW_MATERIAL" || t === "SUPPLIER" ? Boxes : Factory);
const activityIcon = (t: string) => (t === "search" ? Search : t === "simulation" ? SlidersHorizontal : t === "report" ? FileText : ArrowUpRight);

/** Tiny data hook: runs an API call, exposes data / error / loading and a reload. */
function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const reload = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    fn().then((data) => set({ data, loading: false })).catch((e: Error) => set({ error: e.message, loading: false }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function Logo() {
  return <div className="logo"><div className="logo-mark"><span /><i /></div><b>Meridian</b></div>;
}
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Busy({ text = "Loading…" }: { text?: string }) {
  return <div className="skeleton"><Loader2 size={14} className="spin" /> {text}</div>;
}
function ApiError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="api-error"><AlertTriangle size={14} /> Could not reach the Meridian API ({message}). Start the backend with <code>npm run dev</code> on port 4000.</div>;
}

function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>("coastal-refining"); // entity slug
  const [command, setCommand] = useState(false);
  const [dataSources, setDataSources] = useState(false);
  const [dark, setDark] = useState(false);
  const me = useApi(() => api.me().then((r) => r.user));
  const fresh = useApi(() => api.dataSources());
  const alerts = useApi(() => api.alerts({ limit: 1 }));

  const go = (p: Page) => { setPage(p); setMobile(false); };
  const user = me.data ?? { name: "Analyst", title: "Strategic Analyst", initials: "AN" };

  return <div className={dark ? "app dark" : "app"}>
    <aside className={`${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}>
      <div className="side-top"><Logo /><button className="icon-btn collapse" onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={18} /></button></div>
      <nav>{nav.map(n => <button key={n.label} className={page === n.label ? "active" : ""} onClick={() => go(n.label)}><n.icon size={18}/><span>{n.label}</span></button>)}</nav>
      <div className="side-bottom">
        <button onClick={() => setDataSources(true)}><Layers3 size={18}/><span>Data Sources</span></button>
        <button onClick={() => setDark(!dark)}><Settings size={18}/><span>{dark ? "Light theme" : "Settings"}</span></button>
        <div className="profile"><div className="avatar">{user.initials}</div><div><b>{user.name}</b><small>{user.title}</small></div><ChevronDown size={15}/></div>
      </div>
    </aside>
    <main>
      <header>
        <button className="icon-btn menu" onClick={() => setMobile(!mobile)}>{mobile ? <X/> : <Menu/>}</button>
        <div className="crumb"><span>Intelligence</span><ChevronRight size={14}/><b>{page}</b></div>
        <div className="head-actions">
          <button className="search-shortcut" onClick={() => setCommand(true)}><Search size={16}/><span>Search Meridian</span><kbd>⌘ K</kbd></button>
          <div className="fresh"><i/> {fresh.data?.sources?.[0] ? `Data updated ${fresh.data.sources[0].lastUpdatedLabel}` : "Connecting…"}</div>
          <button className="icon-btn" title={`${alerts.data?.unread ?? 0} open alerts`} onClick={() => go("Overview")}><Bell size={18}/>{(alerts.data?.unread ?? 0) > 0 && <em/>}</button>
          <div className="avatar small">{user.initials}</div>
        </div>
      </header>
      <div className="content">
        {page === "Overview"
          ? <Overview query={query} setQuery={setQuery} setPage={go} selected={selected} setSelected={setSelected} userName={user.name}/>
          : <Workspace page={page} setPage={go} selected={selected} setSelected={setSelected}/>}
      </div>
    </main>
    {command && <CommandPalette close={() => setCommand(false)} go={go} setSelected={setSelected}/>}
    {dataSources && <DataSourcesModal close={() => setDataSources(false)}/>}
  </div>;
}

/* ---------- Search (⌘K) ---------- */
function useSearch(q: string) {
  const [results, setResults] = useState<{ kind: string; id: string; slug?: string; title: string; subtitle: string; page: string }[]>([]);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => api.search(q).then((r) => setResults(r.results)).catch(() => setResults([])), 180);
    return () => clearTimeout(t);
  }, [q]);
  return results;
}

function CommandPalette({ close, go, setSelected }: { close: () => void; go: (p: Page) => void; setSelected: (s: string) => void }) {
  const [q, setQ] = useState("");
  const results = useSearch(q);
  const open = (r: { kind: string; slug?: string; page: string }) => { if (r.kind === "entity" && r.slug) setSelected(r.slug); go(r.page as Page); close(); };
  return <div className="modal-backdrop" onClick={close}><div className="command" onClick={e => e.stopPropagation()}>
    <Search size={20}/><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search materials, ports, suppliers or reports…" /><kbd>ESC</kbd>
    <div className="command-results">
      <small>{q ? "RESULTS" : "QUICK NAVIGATION"}</small>
      {q
        ? (results.length ? results.map(r => <button key={r.kind + r.id} onClick={() => open(r)}><Boxes size={17}/>{r.title}<span>{r.kind}</span></button>) : <button disabled><Search size={17}/>No matches<span/></button>)
        : nav.slice(0, 5).map(n => <button key={n.label} onClick={() => { go(n.label); close(); }}><n.icon size={17}/>{n.label}<span>Open</span></button>)}
    </div>
  </div></div>;
}

function DataSourcesModal({ close }: { close: () => void }) {
  const ds = useApi(() => api.dataSources());
  return <div className="modal-backdrop" onClick={close}><div className="command" onClick={e => e.stopPropagation()}>
    <Layers3 size={20}/><b>Data sources</b><kbd>ESC</kbd>
    <div className="ds-list">
      {ds.loading && <Busy/>}
      {ds.data?.sources.map(s => <div key={s.id}><span><b>{s.name}</b><br/><small>{s.kind}</small></span><span><Badge tone={s.status === "healthy" ? "teal" : "amber"}>{s.status}</Badge><br/><small>{s.lastUpdatedLabel}</small></span></div>)}
    </div>
  </div></div>;
}

/* ---------- Overview ---------- */
function Overview({ query, setQuery, setPage, selected, setSelected, userName }: { query: string; setQuery: (q: string) => void; setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void; userName: string }) {
  const ov = useApi(() => api.overview());
  const results = useSearch(query);
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const d = ov.data;
  return <>
    <ApiError message={ov.error}/>
    <section className="welcome">
      <div><Badge tone="blue"><Sparkles size={12}/> Illustrative intelligence workspace</Badge><h1>{d?.greeting ?? `Good morning, ${userName.split(" ")[0]}.`}</h1><p>Your strategic supply chain overview.</p></div>
      <div className="welcome-actions"><button className="btn secondary">{today} <ChevronDown size={15}/></button><button className="btn primary" onClick={() => setPage("Reports")}><FileText size={16}/>Generate Intelligence Brief</button></div>
    </section>
    <section className="global-search">
      <Search size={22}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search materials, suppliers, countries, ports, or projects…" />
      <kbd>⌘ K</kbd>
      {query && <div className="suggestions">{results.slice(0, 6).map(r => <button key={r.kind + r.id} onClick={() => { if (r.kind === "entity" && r.slug) setSelected(r.slug); setPage(r.page as Page); setQuery(""); }}><div className="result-icon"><Boxes size={16}/></div><div><b>{r.title}</b><small>{r.subtitle}</small></div><ArrowUpRight size={16}/></button>)}{!results.length && <button disabled><div className="result-icon"><Search size={16}/></div><div><b>Searching…</b><small>Materials, entities, reports and pages</small></div></button>}</div>}
    </section>
    <div className="section-label"><span>KEY INTELLIGENCE</span><small>Illustrative data</small></div>
    <section className="metrics">
      {(d?.metrics ?? [
        { key: "materials", label: "Materials tracked", value: "…", sub: "", tone: "blue", page: "Supply Chain Explorer" },
        { key: "highRisk", label: "High-risk dependencies", value: "…", sub: "", tone: "red", page: "Dependency Analysis" },
        { key: "chokepoints", label: "Critical chokepoints", value: "…", sub: "", tone: "amber", page: "Global Map" },
        { key: "projects", label: "Projects potentially exposed", value: "…", sub: "", tone: "teal", page: "Dependency Analysis" },
      ]).map((m) => {
        const Icon = m.key === "materials" ? Boxes : m.key === "highRisk" ? AlertTriangle : m.key === "chokepoints" ? Ship : ShieldCheck;
        return <article key={m.key}><div className={`metric-icon ${m.tone}`}><Icon size={18}/></div><div><small>{m.label}</small><strong>{m.value}</strong><p>{m.sub}</p></div><button className="icon-btn" onClick={() => setPage(m.page as Page)}><ArrowUpRight size={16}/></button></article>;
      })}
    </section>
    <section className="dashboard-grid">
      <div className="map-card">
        <div className="card-head"><div><h2>Global supply chain exposure</h2><p>Critical material flows and monitored infrastructure</p></div><div><Badge tone="teal"><i/> Live layers</Badge><button className="btn secondary" onClick={() => setPage("Global Map")}><Layers3 size={15}/>Layers</button></div></div>
        <WorldMap selected={selected} setSelected={setSelected} setPage={setPage}/>
      </div>
      <div className="updates">
        <div className="card-head"><div><h2>Intelligence updates</h2><p>Prioritized signals for review</p></div><button className="icon-btn"><SlidersHorizontal size={17}/></button></div>
        <div className="alert-list">
          {ov.loading && <Busy/>}
          {(d?.alerts ?? []).map((a: AlertT, i: number) => <article key={a.id}><div className={`alert-dot a${i}`}/><div><div className="alert-meta"><Badge tone={levelTone(a.level)}>{a.level}</Badge><span>{a.time}</span></div><h3>{a.title}</h3><p>{a.body}</p><div className="alert-foot"><Badge>{a.kind}</Badge><button onClick={() => { if (a.entity?.slug) setSelected(a.entity.slug); setPage((a.relatedPage as Page) || "Dependency Analysis"); }}>View analysis <ArrowUpRight size={13}/></button></div></div></article>)}
        </div>
        <button className="view-all" onClick={() => setPage("Dependency Analysis")}>View all intelligence updates <ChevronRight size={15}/></button>
      </div>
    </section>
    <section className="recent"><div className="card-head"><div><h2>Recent activity</h2><p>Your latest investigations and outputs</p></div><button onClick={() => setPage("Reports")}>View all</button></div><div className="activity-row">
      {(d?.recentActivity ?? []).map((a) => { const Icon = activityIcon(a.type); return <button key={a.id} onClick={() => setPage(a.type === "simulation" ? "Disruption Simulator" : a.type === "report" ? "Reports" : "Supply Chain Explorer")}><span><Icon size={17}/></span><div><b>{a.title}</b><small>{a.label}</small></div><ChevronRight size={16}/></button>; })}
      {d && !d.recentActivity.length && <p className="muted">No activity yet. Run a simulation or generate a brief.</p>}
    </div></section>
  </>;
}

/* ---------- Map ---------- */
function WorldMap({ selected, setSelected, setPage }: { selected: string; setSelected: (s: string) => void; setPage: (p: Page) => void }) {
  const map = useApi(() => api.map());
  const detail = useApi(() => api.entity(selected).then((r) => r.entity), [selected]);
  const nodes = map.data?.nodes ?? [];
  const pos = (n: { mapX: number | null; mapY: number | null }) => [(n.mapX ?? 0) * 10, (n.mapY ?? 0) * 4.4];
  const e = detail.data;
  return <div className="map">
    <div className="map-grid"/><div className="land l1"/><div className="land l2"/><div className="land l3"/><div className="land l4"/><div className="land l5"/>
    <svg className="routes" viewBox="0 0 1000 440" preserveAspectRatio="none">
      {(map.data?.routes ?? []).filter(r => r.from.mapX != null && r.to.mapX != null).map(r => {
        const [x1, y1] = pos(r.from), [x2, y2] = pos(r.to);
        const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 60;
        return <path key={r.id} className={r.kind === "route" ? "" : "teal-route"} d={`M${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}`}/>;
      })}
    </svg>
    {nodes.map((n: MapNode) => <button key={n.id} title={n.name} className={`pin ${n.risk} ${selected === n.slug ? "selected" : ""}`} style={{ left: `${n.mapX}%`, top: `${n.mapY}%` }} onClick={() => setSelected(n.slug)}><span/></button>)}
    <div className="map-info"><div className="info-top"><div className="map-pin-icon"><MapPin size={17}/></div><div><small>{e?.typeLabel ?? "Entity"}</small><b>{e?.name ?? "Loading…"}</b></div><Badge tone={riskTone(e?.risk)}>{e?.risk ?? "…"} risk</Badge></div><div className="info-stats"><span><small>MATERIALS</small><b>{e?.materialsLabel || "–"}</b></span><span><small>CONNECTIONS</small><b>{e?.connectionsLabel ?? "–"}</b></span><span><small>CONFIDENCE</small><b>{e?.confidence ?? "–"}</b></span></div><button onClick={() => setPage("Supply Chain Explorer")}>Inspect entity <ArrowUpRight size={13}/></button></div>
    <div className="map-controls"><button><ZoomIn size={17}/></button><button><ZoomOut size={17}/></button><button onClick={() => setPage("Global Map")}><Route size={17}/></button></div>
    <div className="legend"><span><i className="low"/>Low</span><span><i className="moderate"/>Moderate</span><span><i className="high"/>High risk</span></div>
  </div>;
}

/* ---------- Workspaces ---------- */
function Workspace({ page, setPage, selected, setSelected }: { page: Page; setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void }) {
  if (page === "Supply Chain Explorer") return <Explorer setPage={setPage} selected={selected} setSelected={setSelected}/>;
  if (page === "Disruption Simulator") return <Simulator selected={selected}/>;
  if (page === "Tariff Intelligence") return <Tariff/>;
  return <GenericPage page={page} setPage={setPage} selected={selected} setSelected={setSelected}/>;
}

function Explorer({ setPage, selected, setSelected }: { setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void }) {
  const chains = useApi(() => api.supplyChains(MATERIAL));
  const chain = chains.data?.chains[0];
  const detail = useApi(() => api.entity(selected).then((r) => r.entity), [selected]);
  const e: Entity | undefined = detail.data;
  const PanelIcon = typeIcon(e?.type);
  return <><PageTitle title="Supply Chain Explorer" sub="Trace critical materials from origin to end use." action={chain?.material.name ?? "Gallium Nitride (GaN)"}/>
    <ApiError message={chains.error}/>
    <div className="explorer-tools"><button className="btn secondary"><Search size={15}/>Search graph</button><button className="btn secondary"><SlidersHorizontal size={15}/>Filter</button><div/><button className="btn secondary">Hierarchical view</button></div>
    <div className="chain-layout">
      <section className="chain-canvas">
        {chains.loading ? <Busy text="Loading supply chain…"/> : <div className="chain-flow">{(chain?.stages ?? []).map((n, i, arr) => { const Icon = typeIcon(n.type); return <div className="chain-group" key={n.id}><small>{n.stage}</small><button className={`chain-node ${n.risk} ${selected === n.slug ? "selected" : ""}`} onClick={() => setSelected(n.slug)}><Icon size={20}/><div><b>{n.name}</b><span>{n.detail}</span></div><i/></button>{i < arr.length - 1 && <ChevronRight className="connector"/>}</div>; })}</div>}
        <div className="canvas-note"><CircleHelp size={15}/> {chain?.note ?? "Relationships shown are illustrative and include inferred links."}</div>
      </section>
      <aside className="entity-panel">
        <div className="entity-title"><div className="big-icon"><PanelIcon/></div><div><Badge tone={riskTone(e?.risk)}>{e ? `${e.risk[0].toUpperCase()}${e.risk.slice(1)} risk` : "…"}</Badge><h2>{e?.name ?? "Loading…"}</h2><p>{e?.description ?? e?.typeLabel ?? ""}</p></div></div>
        <Info label="LOCATION" value={e?.region ?? "–"}/>
        <Info label="MATERIALS" value={e?.materialsLabel || "–"}/>
        <Info label="DEPENDENCY SCORE" value={e?.dependencyScoreLabel ?? "–"}/>
        <h4>EVIDENCE STATUS</h4>
        <div className="evidence"><Badge tone="blue">{e?.evidenceStatus ?? "…"}</Badge><p>{e?.evidenceNote ?? `Confidence: ${e?.confidence ?? "–"}.`}</p></div>
        <button className="btn primary wide" onClick={() => setPage("Dependency Analysis")}>Open dependency analysis</button>
      </aside>
    </div></>;
}

function Simulator({ selected }: { selected: string }) {
  const opts = useApi(() => api.simulationOptions());
  const [form, setForm] = useState({ scenarioType: "Supplier shutdown", entityId: selected, durationDays: 90, inventoryBufferDays: 35, supplyReductionPct: 70 });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { if (opts.data && !opts.data.entities.some(e => e.slug === form.entityId)) setForm(f => ({ ...f, entityId: String(opts.data!.defaults.entitySlug) })); }, [opts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = () => {
    setRunning(true); setError(undefined);
    api.runSimulation(form).then((r) => setResult(r.simulation.result)).catch((e: Error) => setError(e.message)).finally(() => setRunning(false));
  };
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: typeof f[k] === "number" ? Number(v) : v }));
  const entityName = opts.data?.entities.find(e => e.slug === form.entityId)?.name ?? form.entityId;
  return <><PageTitle title="Disruption Simulator" sub="Understand how a disruption propagates through the supply chain."/>
    <ApiError message={opts.error}/>
    <div className="sim-grid">
      <section className="panel">
        <h2>Configure scenario</h2><p className="muted">Set assumptions before running the model.</p>
        <FormField label="SCENARIO TYPE" value={form.scenarioType} options={(opts.data?.scenarioTypes ?? [form.scenarioType]).map(s => [s, s] as [string, string])} onChange={set("scenarioType")}/>
        <FormField label="AFFECTED ENTITY" value={form.entityId} options={(opts.data?.entities ?? [{ slug: form.entityId, name: form.entityId }]).map(e => [e.slug, e.name] as [string, string])} onChange={set("entityId")}/>
        <div className="two-col">
          <FormField label="DURATION" value={String(form.durationDays)} options={(opts.data?.durations ?? [90]).map(d => [String(d), `${d} days`] as [string, string])} onChange={set("durationDays")}/>
          <FormField label="INVENTORY BUFFER" value={String(form.inventoryBufferDays)} options={(opts.data?.inventoryBuffers ?? [35]).map(d => [String(d), `${d} days`] as [string, string])} onChange={set("inventoryBufferDays")}/>
        </div>
        <label className="range-label">SUPPLY REDUCTION <b>{form.supplyReductionPct}%</b></label>
        <input type="range" min="0" max="100" value={form.supplyReductionPct} onChange={e => set("supplyReductionPct")(e.target.value)}/>
        <button className="btn primary wide" onClick={run} disabled={running}>{running ? <Loader2 size={16} className="spin"/> : <Play size={16}/>}{running ? "Running model…" : "Run simulation"}</button>
        {error && <p className="api-error">{error}</p>}
      </section>
      <section className="panel results">
        <div className="card-head"><div><h2>Modeled impact</h2><p>{result ? `${form.scenarioType} at ${entityName}. Illustrative scenario, not a prediction` : "Illustrative scenario, not a prediction"}</p></div><Badge tone={result ? "red" : "neutral"}>{result ? "Simulation complete" : "Awaiting inputs"}</Badge></div>
        {result
          ? <><div className="result-hero"><small>ESTIMATED SUPPLY SHORTFALL</small><strong>{result.shortfallPct}%</strong><span>From day {result.shortfallFromDay}</span></div>
            <div className="result-metrics"><Info label="RECOVERY WINDOW" value={`${result.recoveryWindowDays.min}–${result.recoveryWindowDays.max} days`}/><Info label="EXPOSED PROJECTS" value={`${result.exposedProjects} illustrative`}/><Info label="AFFECTED NODES" value={`${result.affectedNodes} of ${result.totalNodes}`}/></div>
            <div className="chart-bars">{result.bars.map((b, i) => <i key={i} style={{ height: `${b.height}%` }} className={b.impact ? "impact" : ""}/>)}</div></>
          : <div className="empty"><Activity size={36}/><h3>Ready to model propagation</h3><p>Run the scenario to estimate impacts across connected entities.</p></div>}
      </section>
    </div></>;
}

function Tariff() {
  const opts = useApi(() => api.tariffOptions());
  const [duty, setDuty] = useState(10);
  const [trade, setTrade] = useState({ origin: "Singapore", destination: "United Kingdom", product: "Gallium nitride wafers" });
  const [result, setResult] = useState<TariffResult | null>(null);
  const [error, setError] = useState<string>();
  const maxDuty = Number(opts.data?.defaults.maxDutyPct ?? 30);
  useEffect(() => {
    const t = setTimeout(() => api.calculateTariff({ dutyPct: duty, ...trade }).then(r => setResult(r.result)).catch((e: Error) => setError(e.message)), 120);
    return () => clearTimeout(t);
  }, [duty, trade]);
  const o = opts.data as { origins?: string[]; destinations?: string[]; products?: { name: string; hsCode: string }[]; defaults: Record<string, string | number> } | undefined;
  const hs = o?.products?.find(p => p.name === trade.product)?.hsCode;
  const curve = result?.curve ?? [];
  const costs = curve.map(c => c.landedCost);
  const lo = costs.length ? Math.min(...costs) : 0, hi = costs.length ? Math.max(...costs) : 1;
  const points = curve.map(c => `${(c.dutyPct / maxDuty) * 500},${150 - ((c.landedCost - lo) / (hi - lo || 1)) * 140}`).join(" ");
  const set = (k: keyof typeof trade) => (v: string) => setTrade(t => ({ ...t, [k]: v }));
  return <><PageTitle title="Tariff Intelligence" sub="Measure how trade-policy changes affect supply chains and landed costs."/>
    <ApiError message={opts.error ?? error}/>
    <div className="tariff-grid">
      <section className="panel"><h2>Trade scenario</h2>
        <div className="two-col"><FormField label="ORIGIN" value={trade.origin} options={(o?.origins ?? [trade.origin]).map(x => [x, x] as [string, string])} onChange={set("origin")}/><FormField label="DESTINATION" value={trade.destination} options={(o?.destinations ?? [trade.destination]).map(x => [x, x] as [string, string])} onChange={set("destination")}/></div>
        <FormField label="PRODUCT" value={trade.product} options={(o?.products ?? [{ name: trade.product }]).map(p => [p.name, p.name] as [string, string])} onChange={set("product")}/>
        <FormField label="HS CLASSIFICATION" value={hs ? `${hs} · Illustrative · Review required` : "Illustrative · Review required"}/>
        <label className="range-label">PROPOSED DUTY <b>{duty}%</b></label>
        <input type="range" min="0" max={maxDuty} value={duty} onChange={e => setDuty(+e.target.value)}/>
        <p className="disclaimer"><AlertTriangle size={14}/>{result?.disclaimer ?? "Analytical aid only. Confirm classification and duty with a customs professional."}</p>
      </section>
      <section className="panel"><h2>Landed cost comparison</h2>
        <div className="cost"><span><small>CURRENT MODELED COST</small><b>${(result?.currentLandedCost ?? 0).toLocaleString()}</b></span><ArrowUpRight/><span><small>SCENARIO COST</small><strong>${(result?.scenarioLandedCost ?? 0).toLocaleString()}</strong></span></div>
        <div className="delta">+${(result?.delta ?? 0).toLocaleString()} <span>({result?.deltaPct ?? 0}% increase)</span></div>
        <div className="line-chart"><svg viewBox="0 0 500 150">{points && <polyline points={points}/>}<line x1={duty / maxDuty * 500} x2={duty / maxDuty * 500} y1="0" y2="150"/></svg></div>
      </section>
    </div></>;
}

function GenericPage({ page, setPage, selected, setSelected }: { page: Page; setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void }) {
  if (page === "Global Map") return <><PageTitle title="Geospatial intelligence workspace" sub="Explore facilities, ports, corridors, and modeled material flows."/><div className="large-map"><WorldMap selected={selected} setSelected={setSelected} setPage={setPage}/></div></>;
  if (page === "Dependency Analysis") return <DependencyPage setPage={setPage} setSelected={setSelected}/>;
  if (page === "Alternative Sources") return <AlternativesPage/>;
  return <ReportsPage/>;
}

function DependencyPage({ setPage, setSelected }: { setPage: (p: Page) => void; setSelected: (s: string) => void }) {
  const dep = useApi(() => api.dependency(MATERIAL));
  const [busy, setBusy] = useState(false);
  const d = dep.data;
  const exportAnalysis = () => { setBusy(true); api.generateReport({ type: "Assessment", materialSlug: MATERIAL }).then(() => setPage("Reports")).finally(() => setBusy(false)); };
  return <><PageTitle title="Identify concentration risk and hidden single points of failure." sub={d?.headline ?? "Supplier concentration"}/>
    <ApiError message={dep.error}/>
    <section className="table-panel">
      <div className="card-head"><div><h2>{d?.assessment?.title ?? "Assessment"}</h2><p>Illustrative records · Updated {d?.assessment ? new Date(d.assessment.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "…"} · Live HHI {d?.live.hhi.toLocaleString() ?? "…"} ({d?.live.topTwoSharePct ?? "…"}% in top two sources)</p></div><button className="btn primary" onClick={exportAnalysis} disabled={busy}><Download size={16}/>{busy ? "Exporting…" : "Export analysis"}</button></div>
      <div className="data-table">
        {dep.loading && <Busy/>}
        {(d?.assessment?.items ?? []).map((x) => <div key={x.id} onClick={() => { setSelected(x.slug); setPage("Supply Chain Explorer"); }} style={{ cursor: "pointer" }}><span className="rank">{String(x.rank).padStart(2, "0")}</span><div><b>{x.name}</b><small>{x.note ?? x.typeLabel} · score {x.score}/100</small></div><div className="bar"><i style={{ width: `${x.score}%` }}/></div><Badge tone={ratingTone(x.rating)}>{x.rating}</Badge><button className="icon-btn"><ChevronRight size={16}/></button></div>)}
      </div>
    </section></>;
}

function AlternativesPage() {
  const alts = useApi(() => api.alternatives(MATERIAL));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const exportAnalysis = () => { setBusy(true); api.generateReport({ type: "Assessment", materialSlug: MATERIAL, title: "Alternative sourcing assessment" }).then(() => setDone(true)).finally(() => setBusy(false)); };
  return <><PageTitle title="Explore options to reduce critical supply-chain dependencies." sub="Compare qualified suppliers, routes, recycling and substitution pathways."/>
    <ApiError message={alts.error}/>
    <section className="table-panel">
      <div className="card-head"><div><h2>Gallium Nitride alternatives</h2><p>{done ? "Brief generated. Open Reports to download it." : "Illustrative options · ranked by modeled risk reduction"}</p></div><button className="btn primary" onClick={exportAnalysis} disabled={busy}><Download size={16}/>{busy ? "Exporting…" : "Export analysis"}</button></div>
      <div className="data-table">
        {alts.loading && <Busy/>}
        {(alts.data?.alternatives ?? []).map((a, i) => <div key={a.id}><span className="rank">{String(i + 1).padStart(2, "0")}</span><div><b>{a.name}</b><small>{a.type} · {a.region ?? "–"} · lead time {a.leadTimeDays ?? "–"} days · cost {a.costDeltaPct != null ? `${a.costDeltaPct > 0 ? "+" : ""}${a.costDeltaPct}%` : "–"}</small></div><div className="bar"><i style={{ width: `${a.riskReduction ?? 0}%` }}/></div><Badge tone={a.readiness === "Qualified" ? "teal" : a.readiness === "Emerging" ? "amber" : "blue"}>{a.readiness}</Badge><button className="icon-btn" title={a.notes ?? ""}><ChevronRight size={16}/></button></div>)}
      </div>
    </section></>;
}

function ReportsPage() {
  const reps = useApi(() => api.reports());
  const [busy, setBusy] = useState(false);
  const generate = () => { setBusy(true); api.generateReport({ type: "Decision brief", materialSlug: MATERIAL }).then(() => reps.reload()).finally(() => setBusy(false)); };
  return <><PageTitle title="Intelligence Reports" sub="Generate and review decision-ready analytical briefs."/>
    <ApiError message={reps.error}/>
    <section className="table-panel">
      <div className="card-head"><div><h2>Saved intelligence briefs</h2><p>{reps.data ? `${reps.data.reports.length} briefs · click a row to download` : "Loading…"}</p></div><button className="btn primary" onClick={generate} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <Download size={16}/>}{busy ? "Generating…" : "Generate brief"}</button></div>
      <div className="data-table">
        {reps.loading && <Busy/>}
        {(reps.data?.reports ?? []).map((r, i) => <div key={r.id} onClick={() => window.open(api.reportDownloadUrl(r.id), "_blank")} style={{ cursor: "pointer" }}><span className="rank">{String(i + 1).padStart(2, "0")}</span><div><b>{r.title}</b><small>{r.type} · {r.format} · {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><div className="bar"><i style={{ width: `${r.score ?? 0}%` }}/></div><Badge tone={ratingTone(r.rating)}>{r.rating ?? "–"}</Badge><button className="icon-btn"><ChevronRight size={16}/></button></div>)}
      </div>
    </section></>;
}

function PageTitle({ title, sub, action }: { title: string; sub: string; action?: string }) { return <div className="page-title"><div><Badge tone="blue">ANALYTICAL WORKSPACE</Badge><h1>{title}</h1><p>{sub}</p></div>{action && <button className="btn secondary"><Boxes size={16}/>{action}<ChevronDown size={15}/></button>}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="info"><small>{label}</small><b>{value}</b></div>; }
function FormField({ label, value, options, onChange }: { label: string; value: string; options?: [string, string][]; onChange?: (v: string) => void }) {
  return <label className="field"><span>{label}</span>
    {options && onChange
      ? <span className="select-wrap"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown size={15}/></span>
      : <button type="button">{value}<ChevronDown size={15}/></button>}
  </label>;
}
export default App;
