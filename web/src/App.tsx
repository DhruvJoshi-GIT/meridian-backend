import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Bell, Boxes, ChevronDown, ChevronRight, CircleHelp,
  FileText, Gauge, Globe2, Layers3, Menu, Network, PanelLeftClose, Search,
  Settings, Ship, SlidersHorizontal, Sparkles, TrendingUp, X, ZoomIn, ZoomOut,
  MapPin, Factory, Route, ShieldCheck, ArrowUpRight, Play, Pause, RotateCcw, SkipForward, Download, Loader2
} from "lucide-react";
import L from "leaflet";
import { api, tariffSim, exporter as exporterApi, journey as fetchJourney, type Alert as AlertT, type Entity, type MapData, type SimulationResult, type TariffResult, type TariffSimulation, type Journey, type ExporterInput, type ExporterResult, type ExporterCurves, type AbsorberInput, type AbsorberResult } from "./lib/api";

type Page = "Overview" | "Supply Chain Explorer" | "Global Map" | "Chain Simulation" | "Dependency Analysis" | "Disruption Simulator" | "Tariff Intelligence" | "Alternative Sources" | "Reports";

const nav: { label: Page; icon: typeof Globe2 }[] = [
  { label: "Overview", icon: Gauge }, { label: "Supply Chain Explorer", icon: Network },
  { label: "Global Map", icon: Globe2 }, { label: "Chain Simulation", icon: Route },
  { label: "Dependency Analysis", icon: Activity },
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

/* ---------- Live map (Leaflet): real coordinates, routes, chokepoints ---------- */
const RISK_HEX: Record<string, string> = { low: "#14b8a6", medium: "#f59e0b", high: "#ef4444" };
const TILE_DARK = { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ", maxZoom: 16 };

function WorldMap({ selected, setSelected, setPage, material = "all", large = false, onData }: { selected: string; setSelected: (s: string) => void; setPage: (p: Page) => void; material?: string; large?: boolean; onData?: (d: MapData) => void }) {
  const map = useApi(() => api.map(material), [material]);
  const detail = useApi(() => api.entity(selected).then((r) => r.entity), [selected]);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const e = detail.data;
  useEffect(() => { if (map.data && onData) onData(map.data); }, [map.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create the map once
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 1 });
    L.tileLayer(TILE_DARK.url, { attribution: TILE_DARK.attr, maxZoom: TILE_DARK.maxZoom }).addTo(m);
    groupRef.current = L.layerGroup().addTo(m);
    m.setView([20, 60], 2);
    mapRef.current = m;
    setTimeout(() => m.invalidateSize(), 60);
    return () => { m.remove(); mapRef.current = null; groupRef.current = null; markersRef.current.clear(); };
  }, []);

  // Redraw nodes + routes when data changes
  useEffect(() => {
    const m = mapRef.current, g = groupRef.current, d = map.data;
    if (!m || !g || !d) return;
    g.clearLayers(); markersRef.current.clear();
    for (const r of d.routes) {
      if (r.from.lat == null || r.to.lat == null) continue;
      L.polyline([[r.from.lat, r.from.lng!], [r.to.lat, r.to.lng!]], { color: RISK_HEX[r.risk] ?? "#5e8fd3", weight: 1 + r.volumeShare * 3, opacity: r.kind === "inferred" ? 0.45 : 0.7, dashArray: r.kind === "inferred" ? "4 6" : r.kind === "route" ? undefined : "1 0" })
        .bindTooltip(`${r.from.name} → ${r.to.name}${r.corridor ? `<br>${r.corridor}` : ""}<br>${Math.round(r.volumeShare * 100)}% of flow · ${r.kind}`, { sticky: true, className: "lm-tip", opacity: 1 }).addTo(g);
    }
    for (const n of d.nodes) {
      if (n.lat == null || n.lng == null) continue;
      if (n.isChokepoint) L.circleMarker([n.lat, n.lng], { radius: 11 + n.dependencyScore / 12, color: n.chokepointStatus === "elevated" ? "#f59e0b" : "#9bacbd", weight: 1, fill: false, dashArray: "3 3", opacity: 0.9, interactive: false }).addTo(g);
      const mk = L.circleMarker([n.lat, n.lng], { radius: 5 + n.dependencyScore / 12, color: "#fff", weight: n.slug === selected ? 3 : 1, fillColor: RISK_HEX[n.risk], fillOpacity: 0.9 })
        .bindTooltip(`<b>${n.name}</b><br>${n.typeLabel} · ${n.region ?? ""}<br>dependency ${n.dependencyScore}/100${n.isChokepoint ? ` · chokepoint (${n.chokepointStatus})` : ""}`, { direction: "top", offset: [0, -6], className: "lm-tip", opacity: 1 })
        .on("click", () => setSelected(n.slug)).addTo(g);
      markersRef.current.set(n.slug, mk);
    }
    const pts = d.nodes.filter(n => n.lat != null).map(n => [n.lat!, n.lng!] as [number, number]);
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 5 });
  }, [map.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the selected node
  useEffect(() => {
    markersRef.current.forEach((mk, slug) => mk.setStyle({ weight: slug === selected ? 3 : 1, color: slug === selected ? "#3b82f6" : "#fff" }));
    const mk = markersRef.current.get(selected);
    if (mk && mapRef.current && !mapRef.current.getBounds().contains(mk.getLatLng())) mapRef.current.panTo(mk.getLatLng());
  }, [selected, map.data]);

  return <div className="map">
    <div className="lmap" ref={el}/>
    {map.error && <div className="map-layer"><Badge tone="red">API unreachable</Badge></div>}
    <div className="map-info"><div className="info-top"><div className="map-pin-icon"><MapPin size={17}/></div><div><small>{e?.typeLabel ?? "Entity"}</small><b>{e?.name ?? "Loading…"}</b></div><Badge tone={riskTone(e?.risk)}>{e?.risk ?? "…"} risk</Badge></div><div className="info-stats"><span><small>MATERIALS</small><b>{e?.materialsLabel || "–"}</b></span><span><small>CONNECTIONS</small><b>{e?.connectionsLabel ?? "–"}</b></span><span><small>CONFIDENCE</small><b>{e?.confidence ?? "–"}</b></span></div><button onClick={() => setPage("Supply Chain Explorer")}>Inspect entity <ArrowUpRight size={13}/></button></div>
    <div className="map-controls"><button onClick={() => mapRef.current?.zoomIn()}><ZoomIn size={17}/></button><button onClick={() => mapRef.current?.zoomOut()}><ZoomOut size={17}/></button><button onClick={() => setPage(large ? "Chain Simulation" : "Global Map")} title={large ? "Open chain simulation" : "Open global map"}><Route size={17}/></button></div>
    <div className="legend"><span><i className="low"/>Low</span><span><i className="moderate"/>Moderate</span><span><i className="high"/>High risk</span><span>◌ chokepoint</span></div>
  </div>;
}

function GlobalMapPage({ selected, setSelected, setPage }: { selected: string; setSelected: (s: string) => void; setPage: (p: Page) => void }) {
  const [material, setMaterial] = useState("all");
  const [data, setData] = useState<MapData | null>(null);
  const a = data?.analytics;
  const maxCountry = a ? Math.max(1, ...a.byCountry.map(c => c.count)) : 1;
  const maxTransit = a ? Math.max(1, ...a.transits.map(t => t.transits)) : 1;
  return <><PageTitle title="Geospatial intelligence workspace" sub="Facilities, ports, corridors and modeled material flows on a live map. Hover a node or route for detail, click a node to inspect it."/>
    <div className="explorer-tools"><label className="field" style={{ marginTop: 0, minWidth: 240 }}><span className="select-wrap"><select value={material} onChange={ev => setMaterial(ev.target.value)}>{(data?.layers ?? [{ key: "all", label: "All materials" }]).map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select><ChevronDown size={15}/></span></label>{a && <Badge tone="teal">{a.totals.nodes} nodes · {a.totals.routes} routes · {a.totals.countries} countries</Badge>}<div/><button className="btn secondary" onClick={() => setPage("Chain Simulation")}><Route size={15}/>Play the GaN journey</button></div>
    <div className="large-map"><WorldMap selected={selected} setSelected={setSelected} setPage={setPage} material={material} large onData={setData}/></div>
    {a && <>
      <div className="geo-tiles">
        <article><small>NODES ON MAP</small><strong>{a.totals.nodes}</strong><p>across {a.totals.countries} countries</p></article>
        <article><small>MODELED ROUTES</small><strong>{a.totals.routes}</strong><p>{a.totals.inferredLinks} inferred</p></article>
        <article><small>HIGH-RISK NODES</small><strong className="red">{a.totals.highRisk}</strong><p>of {a.totals.nodes} · avg dependency {a.totals.avgDependency}</p></article>
        <article><small>CHOKEPOINTS</small><strong className={a.totals.chokepointsElevated ? "amber" : ""}>{a.totals.chokepointsElevated} / {a.totals.chokepoints}</strong><p>elevated right now</p></article>
        <article><small>TRANSITS, 7 DAYS</small><strong>{a.transits.reduce((s, t) => s + t.transits, 0)}</strong><p>{a.transits.reduce((s, t) => s + t.alerts, 0)} alerts raised</p></article>
        <article><small>LAYER</small><strong style={{ fontSize: 15 }}>{data?.layers.find(l => l.key === material)?.label ?? "All materials"}</strong><p>{a.byType.map(t => `${t.count} ${t.label.toLowerCase()}`).slice(0, 3).join(" · ")}</p></article>
      </div>
      <div className="geo-grid">
        <section className="panel"><h3>Nodes by country</h3><p className="muted">Red share = high-risk nodes</p>
          <div className="bars">{a.byCountry.map(c => <div key={c.code}><span>{c.name}<small>avg dependency {c.avgScore}</small></span><div className="track"><i className="hi" style={{ width: `${(c.highRisk / maxCountry) * 100}%` }}/><i className="rest" style={{ width: `${((c.count - c.highRisk) / maxCountry) * 100}%` }}/></div><span className="n">{c.count}</span></div>)}</div>
          <h3 style={{ marginTop: 18 }}>Monitored transits, last 7 days</h3><p className="muted">Illustrative</p>
          <div className="transits">{a.transits.map(t => <div key={t.date} title={`${t.transits} transits · ${t.alerts} alerts`}><i style={{ height: `${(t.transits / maxTransit) * 70}%` }}/>{t.alerts > 0 && <i className="a" style={{ height: `${t.alerts * 4}%`, width: "40%" }}/>}<small>{t.label}</small></div>)}</div>
        </section>
        <section className="panel"><h3>Monitored corridors</h3><p className="muted">Share of flow, transit time, incidents and delay in the last 30 days</p>
          <div className="corr">
            <div className="head"><span>CORRIDOR</span><span>STATUS</span><span className="r">SHARE</span><span className="r">TRANSIT</span><span className="r">INCIDENTS</span></div>
            {a.corridors.map(c => <div key={c.id}><span><b>{c.corridor}</b><small>{c.from} → {c.to}</small></span><Badge tone={c.status === "elevated" ? "red" : c.status === "watch" ? "amber" : "teal"}>{c.status}</Badge><span className="r">{c.volumeSharePct}%</span><span className="r">{c.transitDays} d<br/><small>+{c.delayPct}% delay</small></span><span className="r">{c.incidents30d}</span></div>)}
          </div>
        </section>
        <section className="panel"><h3>Top exposures</h3><p className="muted">Highest dependency scores on this layer</p>
          <ol className="topx">{a.topExposure.map((x, i) => <li key={x.slug} onClick={() => setSelected(x.slug)}><span className="k">{i + 1}</span><span><b>{x.name}</b><small>{x.typeLabel}{x.country ? ` · ${x.country}` : ""}</small><div className="track"><i style={{ width: `${x.score}%`, background: RISK_HEX[x.risk] }}/></div></span><span className="s">{x.score}</span></li>)}</ol>
          <p className="geo-note">{a.note}</p>
        </section>
      </div>
    </>}
  </>;
}

/* ---------- Workspaces ---------- */
function Workspace({ page, setPage, selected, setSelected }: { page: Page; setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void }) {
  if (page === "Supply Chain Explorer") return <Explorer setPage={setPage} selected={selected} setSelected={setSelected}/>;
  if (page === "Disruption Simulator") return <Simulator selected={selected}/>;
  if (page === "Tariff Intelligence") return <Tariff/>;
  if (page === "Chain Simulation") return <ChainSimulation setPage={setPage} setSelected={setSelected}/>;
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
  const [tab, setTab] = useState<"lanes" | "exporter" | "absorber">("lanes");
  return <><PageTitle title="Tariff Intelligence" sub="Measure how trade-policy changes affect supply chains, landed costs, exporter profit and the best way to respond."/>
    <ApiError message={opts.error ?? error}/>
    <div className="tabs">
      <button className={tab === "lanes" ? "active" : ""} onClick={() => setTab("lanes")}>Landed cost &amp; trade lanes</button>
      <button className={tab === "exporter" ? "active" : ""} onClick={() => setTab("exporter")}>Exporter simulator</button>
      <button className={tab === "absorber" ? "active" : ""} onClick={() => setTab("absorber")}>Tariff Absorber</button>
    </div>
    {tab === "exporter" && <ExporterSimulator/>}
    {tab === "absorber" && <Absorber/>}
    {tab === "lanes" && <><div className="tariff-grid">
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
    </div>
    <TariffSimulator/></>}</>;
}

/* ---------- Exporter simulator: what a duty change does to an exporter's price, volume and profit ---------- */
function NumField({ label, value, onChange, unit, step = 1, min }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number }) {
  return <label className="field"><span>{label}</span><span className="num-box"><input type="number" value={value} step={step} min={min} onChange={e => onChange(Number(e.target.value))}/>{unit && <span>{unit}</span>}</span></label>;
}
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const moneyM = (n: number) => Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;

function useExporterDefaults() {
  const d = useApi(() => exporterApi.defaults());
  return d.data;
}

function ExporterSimulator() {
  const defaults = useExporterDefaults();
  const [f, setF] = useState<ExporterInput>({ fob: 100, freight: 8, unitCost: 80, volume: 100000, oldDutyPct: 18, newDutyPct: 33, elasticity: -1.5, absorption: 0, rivalLanded: 127.6 });
  const [out, setOut] = useState<{ result: ExporterResult; curves: ExporterCurves } | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => { if (defaults) setF(({ fob: defaults.fob, freight: defaults.freight, unitCost: defaults.unitCost, volume: defaults.volume, oldDutyPct: defaults.oldDutyPct, newDutyPct: defaults.newDutyPct, elasticity: defaults.elasticity, absorption: defaults.absorption, rivalLanded: defaults.rivalLanded })); }, [defaults]);
  useEffect(() => { const t = setTimeout(() => exporterApi.run(f).then(setOut).catch((e: Error) => setError(e.message)), 180); return () => clearTimeout(t); }, [f]);
  const set = (k: keyof ExporterInput) => (v: number) => setF(x => ({ ...x, [k]: v }));
  const r = out?.result, c = out?.curves;
  const maxD = c ? c.byDuty.length - 1 : 60;
  const pMin = c ? Math.min(...c.byDuty.map(p => p.profit), 0) : 0, pMax = c ? Math.max(...c.byDuty.map(p => p.profit), 1) : 1;
  const X = (d: number) => (d / maxD) * 500, Y = (p: number) => 140 - ((p - pMin) / (pMax - pMin || 1)) * 130;
  const dutyPts = c ? c.byDuty.map(p => `${X(p.dutyPct)},${Y(p.profit)}`) : [];
  const aMin = c ? Math.min(...c.byAbsorption.map(p => p.profit)) : 0, aMax = c ? Math.max(...c.byAbsorption.map(p => p.profit)) : 1;
  const absPts = c ? c.byAbsorption.map(p => `${(p.absorptionPct / 100) * 500},${140 - ((p.profit - aMin) / (aMax - aMin || 1)) * 130}`) : [];
  return <>
    <section className="panel">
      <div className="sim-head"><div><h2>Exporter simulator</h2><p className="muted">What a duty change does to the buyer's price, the volume you keep, and your profit. Every step is shown with its formula.</p></div><Badge tone={r ? (r.profitDelta < 0 ? "red" : "teal") : "neutral"}>{r ? `${pct(r.profitDeltaPct)} profit` : "…"}</Badge></div>
      <ApiError message={error}/>
      <div className="num-grid">
        <NumField label="FOB PRICE / UNIT" value={f.fob} onChange={set("fob")} unit="$" step={1} min={0}/>
        <NumField label="FREIGHT / UNIT" value={f.freight} onChange={set("freight")} unit="$" step={0.5} min={0}/>
        <NumField label="UNIT COST" value={f.unitCost} onChange={set("unitCost")} unit="$" step={1} min={0}/>
        <NumField label="VOLUME (UNITS)" value={f.volume} onChange={set("volume")} step={1000} min={0}/>
        <NumField label="OLD DUTY" value={f.oldDutyPct} onChange={set("oldDutyPct")} unit="%" step={0.5} min={0}/>
        <NumField label="NEW DUTY" value={f.newDutyPct} onChange={set("newDutyPct")} unit="%" step={0.5} min={0}/>
        <NumField label="DEMAND ELASTICITY" value={f.elasticity} onChange={set("elasticity")} step={0.1}/>
        <NumField label="RIVAL LANDED PRICE" value={f.rivalLanded ?? 0} onChange={set("rivalLanded")} unit="$" step={0.1} min={0}/>
      </div>
      <label className="range-label" style={{ display: "block", marginTop: 16 }}>DUTY INCREASE ABSORBED BY EXPORTER <b>{Math.round(f.absorption * 100)}%</b></label>
      <input type="range" min="0" max="100" value={Math.round(f.absorption * 100)} onChange={e => set("absorption")(+e.target.value / 100)}/>
      {r && <>
        <div className="exp-tiles">
          <article><small>LANDED COST</small><strong>${r.oldLanded} → ${r.newLanded}</strong><p>buyer pays +${r.buyerIncrease}/unit</p></article>
          <article><small>PRICE CHANGE</small><strong className={r.priceChangePct > 0 ? "up" : r.priceChangePct < 0 ? "down" : ""}>{pct(r.priceChangePct)}</strong><p>of old landed cost</p></article>
          <article><small>VOLUME</small><strong className={r.volumeChangePct < 0 ? "up" : "down"}>{pct(r.volumeChangePct)}</strong><p>{r.oldVolume.toLocaleString()} → {r.newVolume.toLocaleString()} units</p></article>
          <article><small>PROFIT</small><strong className={r.profitDelta < 0 ? "up" : "down"}>{moneyM(r.oldProfit)} → {moneyM(r.newProfit)}</strong><p>{r.profitDelta >= 0 ? "+" : "−"}{moneyM(Math.abs(r.profitDelta))} · margin ${r.marginPerUnitOld} → ${r.marginPerUnitNew}</p></article>
          <article><small>BREAK-EVEN DUTY</small><strong className={r.pastBreakEven ? "up" : ""}>{r.breakEvenDutyPct != null ? `${r.breakEvenDutyPct}%` : "–"}</strong><p>{r.breakEvenDutyPct == null ? "enter a rival landed price" : r.pastBreakEven ? `${f.newDutyPct}% is past it: buyers can switch` : `${f.newDutyPct}% is still competitive`}</p></article>
        </div>
        <h4 className="sub-h">How it is calculated</h4>
        <div className="formula-table">
          <div className="head"><span>STEP</span><span>FORMULA</span><span>WITH YOUR NUMBERS</span></div>
          {r.steps.map(s => <div key={s.label}><b>{s.label}</b><code>{s.formula}</code><span className="v">{s.value}</span></div>)}
        </div>
        <div className="chart2">
          <section className="panel"><h4>Profit vs. new duty rate</h4>
            <svg viewBox="0 0 500 150" preserveAspectRatio="none">{dutyPts.length > 1 && <><path className="area" d={`M0,140 L${dutyPts.join(" L")} L500,140 Z`}/><path d={`M${dutyPts.join(" L")}`}/></>}<line className="old" x1={X(f.oldDutyPct)} x2={X(f.oldDutyPct)} y1="0" y2="140"/><line className="new" x1={X(f.newDutyPct)} x2={X(f.newDutyPct)} y1="0" y2="140"/>{r.breakEvenDutyPct != null && r.breakEvenDutyPct >= 0 && <line className="be" x1={X(r.breakEvenDutyPct)} x2={X(r.breakEvenDutyPct)} y1="0" y2="140"/>}</svg>
            <div className="lg"><span><i style={{ background: "#94a3b8" }}/>old duty {f.oldDutyPct}%</span><span><i style={{ background: "var(--amber)" }}/>new duty {f.newDutyPct}%</span>{r.breakEvenDutyPct != null && <span><i style={{ background: "var(--red)" }}/>break-even {r.breakEvenDutyPct}%</span>}<span>0 → {maxD}% duty · profit {moneyM(pMin)} to {moneyM(pMax)}</span></div>
          </section>
          <section className="panel"><h4>Profit vs. share of duty absorbed</h4>
            <svg viewBox="0 0 500 150" preserveAspectRatio="none">{absPts.length > 1 && <><path className="area" d={`M0,140 L${absPts.join(" L")} L500,140 Z`}/><path d={`M${absPts.join(" L")}`}/></>}<line className="new" x1={f.absorption * 500} x2={f.absorption * 500} y1="0" y2="140"/></svg>
            <div className="lg"><span>0% → 100% absorbed · {aMax > aMin ? `best at ${c!.byAbsorption.reduce((b, p) => p.profit > b.profit ? p : b).absorptionPct}% absorbed` : ""}</span></div>
          </section>
        </div>
      </>}
    </section>
  </>;
}

/* ---------- Tariff Absorber: compare ways to respond with doing nothing ---------- */
function Absorber() {
  const defaults = useExporterDefaults();
  const [f, setF] = useState<AbsorberInput>({ fob: 100, freight: 8, unitCost: 80, volume: 100000, oldDutyPct: 18, newDutyPct: 33, elasticity: -1.5, absorption: 0, rivalLanded: 127.6, absorbShare: 0.5, origin: { dutyPct: 28, extraCostPerUnit: 1 }, shift: { units: 20000, marginPerUnit: 12 } });
  const [out, setOut] = useState<AbsorberResult | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => { if (defaults) setF(defaults); }, [defaults]);
  useEffect(() => { const t = setTimeout(() => exporterApi.absorber(f).then(setOut).catch((e: Error) => setError(e.message)), 180); return () => clearTimeout(t); }, [f]);
  const set = (k: keyof AbsorberInput) => (v: number) => setF(x => ({ ...x, [k]: v }));
  const setO = (k: "dutyPct" | "extraCostPerUnit") => (v: number) => setF(x => ({ ...x, origin: { ...x.origin, [k]: v } }));
  const setS = (k: "units" | "marginPerUnit") => (v: number) => setF(x => ({ ...x, shift: { ...x.shift, [k]: v } }));
  const best = out?.actions[0], worst = out?.actions[out.actions.length - 1];
  const span = out ? Math.max(1, ...out.actions.map(a => Math.abs(a.recovered))) : 1;
  return <>
    <section className="panel">
      <div className="sim-head"><div><h2>Tariff Absorber</h2><p className="muted">Each response is run through the same simulator and compared with doing nothing. The ranking explains itself.</p></div><Badge tone={best ? "teal" : "neutral"}>{best ? `Best: ${best.label}` : "…"}</Badge></div>
      <ApiError message={error}/>
      <h4 className="sub-h" style={{ marginTop: 4 }}>The shock</h4>
      <div className="num-grid">
        <NumField label="FOB PRICE / UNIT" value={f.fob} onChange={set("fob")} unit="$" min={0}/>
        <NumField label="FREIGHT / UNIT" value={f.freight} onChange={set("freight")} unit="$" step={0.5} min={0}/>
        <NumField label="UNIT COST" value={f.unitCost} onChange={set("unitCost")} unit="$" min={0}/>
        <NumField label="VOLUME (UNITS)" value={f.volume} onChange={set("volume")} step={1000} min={0}/>
        <NumField label="OLD DUTY" value={f.oldDutyPct} onChange={set("oldDutyPct")} unit="%" step={0.5} min={0}/>
        <NumField label="NEW DUTY" value={f.newDutyPct} onChange={set("newDutyPct")} unit="%" step={0.5} min={0}/>
        <NumField label="DEMAND ELASTICITY" value={f.elasticity} onChange={set("elasticity")} step={0.1}/>
        <NumField label="RIVAL LANDED PRICE" value={f.rivalLanded ?? 0} onChange={set("rivalLanded")} unit="$" step={0.1} min={0}/>
      </div>
      <h4 className="sub-h">The responses</h4>
      <div className="abs-actions">
        <section className="panel"><h4>Absorb part of the duty</h4><p>Exporter cuts price to keep buyers</p><label className="range-label">SHARE ABSORBED <b>{Math.round(f.absorbShare * 100)}%</b></label><input type="range" min="0" max="100" value={Math.round(f.absorbShare * 100)} onChange={e => set("absorbShare")(+e.target.value / 100)}/></section>
        <section className="panel"><h4>Requalify origin / relief scheme</h4><p>Lowers the duty rate at an added cost per unit</p><div className="num-grid"><NumField label="DUTY AFTER REQUALIFYING" value={f.origin.dutyPct} onChange={setO("dutyPct")} unit="%" step={0.5} min={0}/><NumField label="EXTRA COST / UNIT" value={f.origin.extraCostPerUnit} onChange={setO("extraCostPerUnit")} unit="$" step={0.25} min={0}/></div></section>
        <section className="panel"><h4>Shift volume to a lower-tariff market</h4><p>Moves lost units to an FTA or lower-duty market</p><div className="num-grid"><NumField label="UNITS TO SHIFT" value={f.shift.units} onChange={setS("units")} step={1000} min={0}/><NumField label="SWITCHING MARGIN / UNIT" value={f.shift.marginPerUnit} onChange={setS("marginPerUnit")} unit="$" step={0.5}/></div></section>
      </div>
      {out && <>
        <h4 className="sub-h">Ranked by profit</h4>
        <div className="abs-table">
          <div className="head"><span>#</span><span>ACTION</span><span>WHAT IT MODELS</span><span>PROFIT</span><span>RECOVERED</span><span>VS DOING NOTHING</span></div>
          {out.actions.map((a, i) => <div key={a.key} className={a.key === best?.key ? "best" : a.key === worst?.key && a.recovered < 0 ? "worst" : ""} title={a.detail}>
            <span className="rank">{i + 1}</span>
            <span><b>{a.label}</b><small>{a.detail}</small></span>
            <span>{a.models}</span>
            <span><b>{moneyM(a.profit)}</b><small>{a.volumeSold.toLocaleString()} units sold{a.shiftedUnits ? ` (${a.shiftedUnits.toLocaleString()} shifted)` : ""}</small></span>
            <span className={a.recovered > 0 ? "pos" : a.recovered < 0 ? "neg" : ""}>{a.recovered === 0 ? "0" : `${a.recovered > 0 ? "+" : "−"}${moneyM(Math.abs(a.recovered))}`}<small>{a.recovered === 0 ? "baseline" : pct(a.recoveredPct)}</small></span>
            <span><div className="abs-bar"><i className={a.recovered < 0 ? "neg" : ""} style={{ width: `${(Math.abs(a.recovered) / span) * 100}%` }}/></div></span>
          </div>)}
        </div>
        <ul className="insights">{out.insights.map((t, i) => <li key={i}><Sparkles size={14}/><span>{t}</span></li>)}</ul>
        <p className="disclaimer"><AlertTriangle size={14}/>{out.disclaimer}</p>
      </>}
    </section>
  </>;
}

/* ---------- Tariff simulator: any material, any duty, every trade lane ---------- */
function TariffSimulator() {
  const [material, setMaterial] = useState(MATERIAL);
  const [destination, setDestination] = useState("");
  const [duty, setDuty] = useState(25);
  const lanes = useApi(() => tariffSim.lanes(material), [material]);
  const [sim, setSim] = useState<TariffSimulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(() => {
    setBusy(true); setError(undefined);
    tariffSim.simulate({ material, dutyPct: duty, destination: destination || undefined }).then(setSim).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  }, [material, duty, destination]);
  useEffect(() => { const t = setTimeout(run, 200); return () => clearTimeout(t); }, [run]);
  useEffect(() => { setDestination(""); }, [material]);

  const ref = destination ? lanes.data?.destinations.find(d => d.code === destination)?.currentDutyPct : lanes.data?.referenceDutyPct;
  const refLane = lanes.data?.lanes.find(l => !destination || l.destinationCode === destination);
  const maxSlider = Math.max(60, Math.ceil(duty / 10) * 10);
  const curve = sim?.curve ?? [];
  const cMax = Math.max(1, ...curve.map(c => c.indexPct));
  const pts = curve.map(c => `${(c.dutyPct / (sim?.maxDutyPct || 1)) * 500},${110 - (c.indexPct / cMax) * 100}`);
  const sign = (n: number) => `${n > 0 ? "+" : ""}${n}`;

  return <section className="panel sim-panel">
    <div className="sim-head"><div><h2>Tariff simulator</h2><p className="muted">Set a tariff on any tracked material and see how landed prices move on every trade lane, country by country.</p></div><Badge tone={sim ? (sim.summary.direction === "up" ? "red" : sim.summary.direction === "down" ? "teal" : "neutral") : "neutral"}>{busy ? "Simulating…" : sim ? `${sim.summary.lanes} lanes modeled` : "Awaiting inputs"}</Badge></div>
    <ApiError message={lanes.error ?? error}/>
    <div className="sim-controls">
      <FormField label="MATERIAL / ELEMENT" value={material} options={(lanes.data?.materials ?? [{ slug: material, name: material }]).map(m => [m.slug, m.name] as [string, string])} onChange={setMaterial}/>
      <FormField label="IMPORTING COUNTRY" value={destination} options={[["", "All destinations"], ...(lanes.data?.destinations ?? []).map(d => [d.code, d.name] as [string, string])]} onChange={setDestination}/>
      <label className="field"><span>SIMULATED TARIFF</span><span className="duty-box"><input type="number" min={0} max={500} step={0.5} value={duty} onChange={e => setDuty(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}/><span>%</span></span></label>
      <button className="btn primary" onClick={run} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <Play size={16}/>}Run</button>
    </div>
    <p className="duty-ref"><CircleHelp size={13}/> Standard tariff currently: <b>{ref != null ? `${ref}%` : "…"}</b>{refLane && <span>· HS {refLane.hsCode} · {refLane.product} · {destination ? `${refLane.origin} → ${refLane.destination}` : `volume-weighted across ${lanes.data?.lanes.length ?? 0} lanes from ${refLane.origin}`}</span>}<span className="muted">(indicative MFN reference rate)</span></p>
    <input className="sim-range" type="range" min="0" max={maxSlider} step="0.5" value={duty} onChange={e => setDuty(+e.target.value)}/>

    {sim && <>
      <div className="sim-tiles">
        <article><small>WEIGHTED LANDED PRICE CHANGE</small><strong className={sim.summary.direction}>{sign(sim.summary.weightedDeltaPct)}%</strong><p>${sim.summary.weightedCurrent.toLocaleString()} → ${sim.summary.weightedSimulated.toLocaleString()} {sim.lanes[0]?.unit}</p></article>
        <article><small>DUTY CHANGE</small><strong>{sign(Math.round((sim.dutyPct - sim.referenceDutyPct) * 100) / 100)} pts</strong><p>{sim.referenceDutyPct}% today → {sim.dutyPct}% simulated</p></article>
        <article><small>EST. TRADE VOLUME SHIFT</small><strong className={sim.summary.volumeDeltaPct < 0 ? "up" : sim.summary.volumeDeltaPct > 0 ? "down" : ""}>{sign(sim.summary.volumeDeltaPct)}%</strong><p>Elasticity {sim.elasticity}, illustrative</p></article>
        <article><small>COUNTRIES AFFECTED</small><strong>{sim.byDestination.length}</strong><p>{sim.byDestination.map(d => d.code).join(" · ")}</p></article>
      </div>
      <h4 className="sub-h">Price impact by importing country</h4>
      <div className="dest-grid">{sim.byDestination.map(d => <article key={d.code}><b>{d.name}</b><small>duty {d.currentDutyPct}% → {sim.dutyPct}% · {d.lanes} lane{d.lanes > 1 ? "s" : ""}</small><strong className={d.deltaPct > 0 ? "up" : d.deltaPct < 0 ? "down" : ""} style={{ color: d.deltaPct > 0 ? "var(--red)" : d.deltaPct < 0 ? "var(--teal)" : undefined }}>{sign(d.deltaPct)}%</strong><small>${d.currentLanded.toLocaleString()} → ${d.simulatedLanded.toLocaleString()}</small></article>)}</div>
      <h4 className="sub-h">Trade lanes</h4>
      <div className="lane-table">
        <div className="head"><span>LANE</span><span>DUTY TODAY</span><span>CURRENT LANDED</span><span>SIMULATED</span><span>CHANGE</span><span>VOLUME SHARE</span></div>
        {sim.lanes.map(l => <div key={l.id}><span><b>{l.origin} → {l.destination}</b><small>{l.product} · HS {l.hsCode} · {l.unit}</small></span><span>{l.currentDutyPct}%<br/><small>{l.note ?? ""}</small></span><span>${l.currentLanded.toLocaleString()}</span><span>${l.simulatedLanded.toLocaleString()}</span><span className={l.direction}>{sign(l.deltaPct)}%<br/><small>{sign(l.delta).replace("+", "+$").replace("-", "-$")}</small></span><span><div className="lane-bar"><i className={l.direction} style={{ width: `${Math.min(100, l.volumeShare * 100 * 2)}%` }}/></div><small>{Math.round(l.volumeShare * 100)}% of flow</small></span></div>)}
      </div>
      <h4 className="sub-h">Landed-price index vs. tariff rate (0 = today)</h4>
      <div className="index-chart"><svg viewBox="0 0 500 120" preserveAspectRatio="none">{pts.length > 1 && <><path className="area" d={`M0,110 L${pts.join(" L")} L500,110 Z`}/><path d={`M${pts.join(" L")}`}/></>}<line x1={(sim.dutyPct / sim.maxDutyPct) * 500} x2={(sim.dutyPct / sim.maxDutyPct) * 500} y1="0" y2="110"/></svg></div>
      <p className="disclaimer"><AlertTriangle size={14}/>{sim.disclaimer}</p>
    </>}
  </section>;
}

/* ---------- Chain simulation: the GaN journey on a real map ---------- */
const STAGE_COLOR: Record<string, string> = { MINING: "#f59e0b", REFINING: "#ef4444", MANUFACTURING: "#3b82f6", LOGISTICS: "#14b8a6", ASSEMBLY: "#8b5cf6", END_USE: "#22c55e" };
const MODE_STYLE: Record<string, { color: string; dash?: string }> = { sea: { color: "#14b8a6" }, air: { color: "#f59e0b", dash: "6 8" }, road: { color: "#94a3b8", dash: "2 6" }, rail: { color: "#94a3b8", dash: "8 6" }, site: { color: "#fff" } };
const SPEEDS = [0.5, 1, 2, 4];
// Keyless tile sources (no API key, free for attributed use). Esri dark canvas is the default.
const BASEMAPS: Record<string, { label: string; url: string; attr: string; maxZoom: number; subdomains?: string }> = {
  dark: { label: "Dark", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ", maxZoom: 16 },
  streets: { label: "Streets", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors", maxZoom: 19 },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics", maxZoom: 18 },
};

function ChainSimulation({ setPage, setSelected }: { setPage: (p: Page) => void; setSelected: (s: string) => void }) {
  const data = useApi(() => fetchJourney(MATERIAL));
  const j = data.data;
  return <><PageTitle title="Chain Simulation" sub={j ? `${j.material.name}: from Australian ore to an Indian radar array across ${j.countries.length} countries, about ${j.totalDays} days and $${j.totalCostUsd.toLocaleString()} per wafer lot. Click any dot for full detail.` : "From mine to end use, on the real map."} action={j?.material.name ?? "Gallium Nitride (GaN)"}/>
    <ApiError message={data.error}/>
    {j ? <JourneyMap journey={j} onInspect={(slug) => { setSelected(slug); setPage("Supply Chain Explorer"); }}/> : <Busy text="Loading journey…"/>}
    <p className="journey-attr">{j?.attribution ?? ""}</p>
  </>;
}

const escapeHtml = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const roleOf = (p: Journey["steps"][number]["from"]) => !p ? "" : p.type === "LOGISTICS" ? (p.isChokepoint ? "Port / maritime chokepoint" : "Port / logistics node") : p.type === "RAW_MATERIAL" ? "Mine / raw-material source" : p.type === "PROCESSING" ? "Processor / refiner (supplier)" : p.type === "MANUFACTURER" ? "Manufacturer / assembly plant (supplier)" : p.type === "SUPPLIER" ? "Supplier" : p.type === "END_USE" ? "End-use programme" : p.typeLabel;

/** Everything about one dot: the place itself, and what the journey does there (arrive, dwell, depart, time, cost). */
function placePopup(p: NonNullable<Journey["steps"][number]["from"]>, steps: Journey["steps"]) {
  const h = escapeHtml;
  const inbound = steps.filter(s => s.to?.slug === p.slug);
  const onSite = steps.filter(s => s.from?.slug === p.slug && !s.to);
  const outbound = steps.filter(s => s.from?.slug === p.slug && s.to);
  const touching = [...inbound, ...onSite, ...outbound].sort((a, b) => a.order - b.order);
  const arrive = inbound[0]?.dayEnd ?? onSite[0]?.dayStart ?? outbound[0]?.dayStart ?? 0;
  const depart = outbound[0]?.dayStart ?? onSite[onSite.length - 1]?.dayEnd ?? arrive;
  const dwell = Math.max(0, depart - arrive);
  const costHere = onSite.reduce((a, s) => a + s.costUsd, 0);
  const costSoFar = touching.length ? touching[touching.length - 1].cumulativeCostUsd : 0;
  const stageColor = STAGE_COLOR[onSite[0]?.stage ?? "LOGISTICS"] ?? "#14b8a6";
  const row = (k: string, v: string) => `<div class="jp-row"><dt>${k}</dt><dd>${v}</dd></div>`;
  const legs = touching.map(s => {
    const kind = s.to ? (s.from?.slug === p.slug ? "Departs" : "Arrives") : "On site";
    const via = s.to ? `${h(s.mode)}${s.carrier ? ` · ${h(s.carrier)}` : ""}` : h(s.carrier ?? s.stage);
    const where = s.to ? (s.from?.slug === p.slug ? `to ${h(s.to.name)}${s.to.countryName ? `, ${h(s.to.countryName)}` : ""}` : `from ${h(s.from?.name)}${s.from?.countryName ? `, ${h(s.from.countryName)}` : ""}`) : h(s.title);
    return `<li><b>${kind}</b> ${where}<br><small>${via} · ${s.durationDays ? `${s.durationDays} day${s.durationDays > 1 ? "s" : ""} (day ${s.dayStart}–${s.dayEnd})` : "same day"} · ${usd(s.costUsd)}${s.cargo ? `<br>${h(s.cargo)}` : ""}</small></li>`;
  }).join("");
  return `<div class="jp">
    <div class="jp-head"><span class="jp-dot" style="background:${stageColor}"></span><div><small>${h(roleOf(p))}</small><b>${h(p.name)}</b><span>${h(p.region ?? "")}</span></div><em class="badge ${p.risk === "high" ? "red" : p.risk === "medium" ? "amber" : "teal"}">${h(p.risk)} risk</em></div>
    ${p.description ? `<p class="jp-desc">${h(p.description)}</p>` : ""}
    <dl class="jp-grid">
      ${row("Country", h(p.countryName ?? p.country ?? "–"))}
      ${row("Role", h(roleOf(p)))}
      ${row("Arrives", `day ${arrive}`)}
      ${row("Departs", outbound.length ? `day ${depart}` : "final stop")}
      ${row("Time here", dwell ? `${dwell} day${dwell > 1 ? "s" : ""}` : outbound.length ? "pass-through" : "final destination")}
      ${row("Cost here", costHere ? usd(costHere) : "–")}
      ${row("Cost so far", usd(costSoFar))}
      ${row("Dependency", `${p.dependencyScore} / 100`)}
      ${row("Evidence", `${h(p.evidenceStatus)} · ${h(p.confidence)} confidence`)}
      ${row("Materials", h(p.materials.map(m => `${m.symbol ?? m.name}${m.role ? ` (${m.role})` : ""}`).join(", ") || "–"))}
      ${row("Links", `${p.connections} connected nodes${p.isChokepoint ? ` · chokepoint${p.chokepointStatus ? ` (${h(p.chokepointStatus)})` : ""}` : ""}`)}
      ${row("Position", `${p.lat?.toFixed(2)}, ${p.lng?.toFixed(2)}`)}
    </dl>
    <ul class="jp-legs">${legs}</ul>
    ${p.evidenceNote ? `<p class="jp-note">${h(p.evidenceNote)}</p>` : ""}
    <button type="button" class="btn primary wide" data-inspect="${h(p.slug)}">Inspect entity in Explorer</button>
  </div>`;
}

function JourneyMap({ journey, onInspect }: { journey: Journey; onInspect: (slug: string) => void }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<{ mover: L.Marker; trail: L.Polyline; pins: L.Marker[]; routes: L.Polyline[] } | null>(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 within the current step
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [basemap, setBasemap] = useState<keyof typeof BASEMAPS>("dark");
  const tileRef = useRef<L.TileLayer | null>(null);
  const stateRef = useRef({ step: 0, progress: 0, playing: true, speed: 1 });
  stateRef.current = { step, progress, playing, speed };
  const steps = journey.steps;

  // Swap the basemap without rebuilding the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const b = BASEMAPS[basemap];
    tileRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: b.maxZoom, crossOrigin: true }).addTo(map);
    tileRef.current.bringToBack();
  }, [basemap]);

  // Build the map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, worldCopyJump: true, minZoom: 2 });
    const b = BASEMAPS.dark;
    tileRef.current = L.tileLayer(b.url, { attribution: b.attr, maxZoom: b.maxZoom, crossOrigin: true }).addTo(map);
    const routes = steps.filter(s => s.path.length > 1).map(s => L.polyline(s.path, { color: MODE_STYLE[s.mode]?.color ?? "#fff", weight: 2, opacity: 0.35, dashArray: MODE_STYLE[s.mode]?.dash }).addTo(map));
    const places = new Map<string, Journey["steps"][number]["from"]>();
    steps.forEach(s => { if (s.from) places.set(s.from.slug, s.from); if (s.to) places.set(s.to.slug, s.to); });
    const pins = [...places.values()].filter((p): p is NonNullable<typeof p> => !!p && p.lat != null && p.lng != null).map(p => {
      const stage = steps.find(s => s.from?.slug === p.slug && s.mode === "site")?.stage ?? "LOGISTICS";
      const m = L.marker([p.lat!, p.lng!], { icon: L.divIcon({ className: "", html: `<div class="jm-pin" style="color:${STAGE_COLOR[stage] ?? "#14b8a6"}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
      m.bindTooltip(`<b>${p.name}</b><br>${p.region ?? ""}${p.isChokepoint ? " · chokepoint" : ""}<br><span style="opacity:.7">Click for full detail</span>`, { direction: "top", offset: [0, -10], className: "jm-label", opacity: 1 });
      m.bindPopup(() => placePopup(p, steps), { className: "jm-popup", maxWidth: 360, minWidth: 300, autoPanPadding: [24, 24] });
      m.on("popupopen", (ev) => { const btn = ev.popup.getElement()?.querySelector<HTMLButtonElement>("button[data-inspect]"); if (btn) btn.onclick = () => onInspect(p.slug); });
      return m;
    });
    const trail = L.polyline([], { color: "#3b82f6", weight: 3.5, opacity: 0.95 }).addTo(map);
    const mover = L.marker(steps[0]?.path[0] ?? [0, 0], { icon: L.divIcon({ className: "", html: '<div class="jm-mover"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(map);
    if (journey.bounds) map.fitBounds([[journey.bounds.south, journey.bounds.west], [journey.bounds.north, journey.bounds.east]], { padding: [40, 40] });
    mapRef.current = map;
    layerRef.current = { mover, trail, pins, routes };
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animation loop: travel steps move the marker along the path; site steps dwell with a pulse
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const st = stateRef.current;
      if (!st.playing) return;
      const s = steps[st.step];
      if (!s) return;
      const secs = s.path.length > 1 ? 3 + Math.min(6, s.durationDays * 0.3) : 2.4; // seconds per step at 1x
      let p = st.progress + (dt * st.speed) / secs;
      if (p >= 1) {
        if (st.step + 1 < steps.length) { setStep(st.step + 1); setProgress(0); }
        else { setProgress(1); setPlaying(false); }
        return;
      }
      setProgress(p);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [steps]);

  // Draw the marker + trail for the current step/progress
  useEffect(() => {
    const ly = layerRef.current, map = mapRef.current;
    if (!ly || !map) return;
    const s = steps[step];
    if (!s) return;
    const done = steps.slice(0, step).flatMap(x => x.path);
    if (s.path.length > 1) {
      const pts = s.path.map(([a, b]) => L.latLng(a, b));
      const lens = pts.slice(1).map((p, i) => pts[i].distanceTo(p));
      const total = lens.reduce((a, b) => a + b, 0) || 1;
      let target = progress * total, i = 0;
      while (i < lens.length - 1 && target > lens[i]) { target -= lens[i]; i++; }
      const f = lens[i] ? Math.min(1, target / lens[i]) : 1;
      const pos = L.latLng(pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f, pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f);
      ly.mover.setLatLng(pos);
      ly.trail.setLatLngs([...done.map(([a, b]) => L.latLng(a, b)), ...pts.slice(0, i + 1), pos]);
      if (!map.getBounds().pad(-0.2).contains(pos)) map.panTo(pos, { animate: true, duration: 0.6 });
    } else if (s.path.length === 1) {
      ly.mover.setLatLng(s.path[0]);
      ly.trail.setLatLngs(done.map(([a, b]) => L.latLng(a, b)));
      const el = ly.mover.getElement()?.firstElementChild as HTMLElement | null;
      if (el) el.style.borderColor = STAGE_COLOR[s.stage] ?? "#3b82f6";
    }
    ly.routes.forEach((r, k) => { const idx = steps.filter(x => x.path.length > 1).indexOf(steps.filter(x => x.path.length > 1)[k]); r.setStyle({ opacity: idx <= steps.slice(0, step + 1).filter(x => x.path.length > 1).length - 1 ? 0.25 : 0.45 }); });
  }, [step, progress, steps]);

  const jump = (i: number) => { setStep(i); setProgress(0); setPlaying(true); };
  const s = steps[step];
  const overall = steps.length ? (step + progress) / steps.length : 0;
  const dayAt = steps.slice(0, step).reduce((a, x) => a + x.durationDays, 0) + Math.round((s?.durationDays ?? 0) * progress);
  return <div className="journey">
    <div className="journey-map" ref={mapEl}/>
    <aside className="journey-side">
      <div className="journey-now"><small>STEP {step + 1} OF {steps.length} · {s?.stage.replace("_", " ")} · DAY {dayAt} OF {journey.totalDays}</small><h3>{s?.title}</h3><p>{s?.description}</p>
        {s && <dl className="journey-facts">
          <div><dt>Where</dt><dd>{s.from?.name}{s.from?.countryName ? `, ${s.from.countryName}` : ""}{s.to ? ` → ${s.to.name}${s.to.countryName ? `, ${s.to.countryName}` : ""}` : ""}</dd></div>
          <div><dt>Time</dt><dd>{s.durationDays ? `${s.durationDays} day${s.durationDays > 1 ? "s" : ""} (day ${s.dayStart} → ${s.dayEnd})` : "Same day"}</dd></div>
          <div><dt>Cost</dt><dd>${s.costUsd.toLocaleString()} this step · ${s.cumulativeCostUsd.toLocaleString()} so far of ${journey.totalCostUsd.toLocaleString()}</dd></div>
          {s.cargo && <div><dt>Cargo</dt><dd>{s.cargo}</dd></div>}
          {s.carrier && <div><dt>Via</dt><dd>{s.carrier}</dd></div>}
        </dl>}
      </div>
      <div className="journey-controls">
        <button className="btn primary" onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={15}/> : <Play size={15}/>}{playing ? "Pause" : "Play"}</button>
        <button className="btn secondary" onClick={() => jump(Math.min(steps.length - 1, step + 1))}><SkipForward size={15}/></button>
        <button className="btn secondary" onClick={() => jump(0)}><RotateCcw size={15}/></button>
        <select value={speed} onChange={e => setSpeed(+e.target.value)}>{SPEEDS.map(x => <option key={x} value={x}>{x}× speed</option>)}</select>
        <select value={basemap} onChange={e => setBasemap(e.target.value as keyof typeof BASEMAPS)} title="Basemap">{Object.entries(BASEMAPS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select>
      </div>
      <div className="journey-progress"><i style={{ width: `${overall * 100}%` }}/></div>
      <ol className="journey-steps">{steps.map((x, i) => <li key={x.order} className={i === step ? "active" : i < step ? "done" : ""} onClick={() => jump(i)}><span className="n">{i + 1}</span><span><b>{x.title}</b><small>{x.from?.name}{x.to ? ` → ${x.to.name}` : ""} · {x.mode}</small></span><span className="d">{x.durationDays ? `${x.durationDays} d` : "–"}</span></li>)}</ol>
      <div className="journey-legend"><span><i style={{ background: MODE_STYLE.sea.color }}/>Sea</span><span><i style={{ background: MODE_STYLE.air.color }}/>Air</span><span><i style={{ background: MODE_STYLE.road.color }}/>Road</span><span><i style={{ background: "#3b82f6" }}/>Travelled</span></div>
    </aside>
  </div>;
}

function GenericPage({ page, setPage, selected, setSelected }: { page: Page; setPage: (p: Page) => void; selected: string; setSelected: (s: string) => void }) {
  if (page === "Global Map") return <GlobalMapPage selected={selected} setSelected={setSelected} setPage={setPage}/>;
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
