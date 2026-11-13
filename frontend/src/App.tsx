import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { Activity, ArrowDownRight, ArrowUpRight, Bolt, ChevronLeft, ChevronRight, Clock3, Ellipsis, FolderPlus, Gauge, KeyRound, LogOut, Plus, RefreshCw, Settings2, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import ProtectedRoute from "./components/ProtectedRoute";
import ProjectDialog from "./components/ProjectDialog";
import AuthPage from "./pages/AuthPage";
import { useAuth } from "./services/auth";
import { ApiError, apiRequest, rangeQuery } from "./services/api";
import type { ApiKey, EndpointCount, ErrorEndpoint, Overview, Project, RecentRequests, SlowEndpoint, StatusGroup, TrafficPoint } from "./types/api";
import { Button, Card, EmptyState, ErrorNotice, LoadingState, SectionTitle, Select, StatusBadge } from "./components/ui";

type DashboardData = { overview: Overview; traffic: { data: TrafficPoint[] }; statuses: { data: StatusGroup[] }; top: { data: EndpointCount[] }; slow: { data: SlowEndpoint[] }; errors: { data: ErrorEndpoint[] }; recent: RecentRequests };
const ranges = [{ value: "1h", label: "Last hour" }, { value: "24h", label: "Last 24 hours" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }];
const chartColors = ["#f0d640", "#ae8cff", "#ff7b67", "#8bc7a0", "#ffb84f", "#89b7ff"];

function App() {
  return <Routes><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/signup" element={<AuthPage mode="signup" />} /><Route element={<ProtectedRoute />}><Route path="/*" element={<Dashboard />} /></Route></Routes>;
}

function Dashboard() {
  const { token, user, signOut } = useAuth(); const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState("");
  const [projectLoading, setProjectLoading] = useState(true); const [projectError, setProjectError] = useState("");
  const [showCreate, setShowCreate] = useState(false); const [range, setRange] = useState("24h"); const [page, setPage] = useState(1);
  const [data, setData] = useState<DashboardData | null>(null); const [loading, setLoading] = useState(false); const [analyticsError, setAnalyticsError] = useState(""); const [reload, setReload] = useState(0);
  const analyticsRequestId = useRef(0);
  const [manageOpen, setManageOpen] = useState(false); const [keys, setKeys] = useState<ApiKey[]>([]); const [keysLoading, setKeysLoading] = useState(false); const [keyAction, setKeyAction] = useState(false); const [newKey, setNewKey] = useState(""); const [manageError, setManageError] = useState("");

  const loadProjects = useCallback(async () => { setProjectLoading(true); setProjectError(""); try { const list = await apiRequest<Project[]>("/api/projects", {}, token); setProjects(list); setProjectId(current => list.some(p => p.id === current) ? current : list[0]?.id ?? ""); } catch (error) { setProjectError(message(error)); if (error instanceof ApiError && error.status === 401) { signOut(); navigate("/login", { replace: true }); } } finally { setProjectLoading(false); } }, [token, signOut, navigate]);
  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const loadAnalytics = useCallback(async () => {
    const requestId = ++analyticsRequestId.current;
    if (!projectId) { setData(null); setLoading(false); return; }
    setLoading(true); setData(null); setAnalyticsError("");
    const root = `/api/analytics/${encodeURIComponent(projectId)}`; const query = rangeQuery(range);
    try {
      const [overview, traffic, statuses, top, slow, errors, recent] = await Promise.all([
        apiRequest<Overview>(`${root}/overview${query}`, {}, token), apiRequest<{ data: TrafficPoint[] }>(`${root}/traffic${query}`, {}, token),
        apiRequest<{ data: StatusGroup[] }>(`${root}/status-codes${query}`, {}, token), apiRequest<{ data: EndpointCount[] }>(`${root}/top-endpoints${query}`, {}, token),
        apiRequest<{ data: SlowEndpoint[] }>(`${root}/slowest-endpoints${query}`, {}, token), apiRequest<{ data: ErrorEndpoint[] }>(`${root}/endpoint-errors${query}`, {}, token),
        apiRequest<RecentRequests>(`${root}/recent-requests?page=${page}&limit=10&range=${range}`, {}, token),
      ]);
      if (requestId === analyticsRequestId.current) setData({ overview, traffic, statuses, top, slow, errors, recent });
    } catch (error) { if (requestId === analyticsRequestId.current) { setAnalyticsError(message(error)); if (error instanceof ApiError && error.status === 401) { signOut(); navigate("/login", { replace: true }); } } }
    finally { if (requestId === analyticsRequestId.current) setLoading(false); }
  }, [projectId, range, page, reload, token, signOut, navigate]);
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  async function createProject(name: string) { const project = await apiRequest<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }, token); setProjects(current => [project, ...current]); setProjectId(project.id); setPage(1); setShowCreate(false); }
  async function deleteProject(project: Project) { if (!window.confirm(`Delete “${project.name}” and all of its associated telemetry?`)) return; setProjectError(""); try { await apiRequest<void>(`/api/projects/${project.id}`, { method: "DELETE" }, token); setProjects(current => current.filter(item => item.id !== project.id)); setProjectId(current => current === project.id ? "" : current); setManageOpen(false); } catch (error) { setProjectError(message(error)); } }
  const selectedProject = projects.find(project => project.id === projectId);
  async function openManagement() { setManageOpen(true); setManageError(""); setNewKey(""); if (!projectId) return; setKeysLoading(true); try { setKeys(await apiRequest<ApiKey[]>(`/api/projects/${projectId}/keys`, {}, token)); } catch (error) { setManageError(message(error)); } finally { setKeysLoading(false); } }
  async function generateKey() { if (!projectId) return; setKeyAction(true); setManageError(""); try { const generated = await apiRequest<{ id: string; rawKey: string; createdAt: string }>(`/api/projects/${projectId}/keys`, { method: "POST" }, token); setNewKey(generated.rawKey); setKeys(await apiRequest<ApiKey[]>(`/api/projects/${projectId}/keys`, {}, token)); } catch (error) { setManageError(message(error)); } finally { setKeyAction(false); } }
  async function revokeKey(key: ApiKey) { if (!projectId || !window.confirm("Revoke this key? Apps using it will stop sending telemetry.")) return; setKeyAction(true); try { await apiRequest<void>(`/api/projects/${projectId}/keys/${key.id}`, { method: "DELETE" }, token); setKeys(await apiRequest<ApiKey[]>(`/api/projects/${projectId}/keys`, {}, token)); } catch (error) { setManageError(message(error)); } finally { setKeyAction(false); } }
  const trafficData = useMemo(() => data?.traffic.data.map(point => ({ ...point, label: new Date(point.timestamp).toLocaleString([], range === "1h" ? { hour: "numeric", minute: "2-digit" } : range === "24h" ? { hour: "numeric" } : { month: "short", day: "numeric" }) })) ?? [], [data, range]);
  const metrics = data?.overview.metrics;

  if (projectLoading) return <div className="center-state"><LoadingState label="Finding your projects" /></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand-mark"><span className="brand-symbol">◒</span> API LENS</a>
      <div className="sidebar-label">WORKSPACE</div>
      <button className="nav-item active"><Activity size={18} /><span>Observatory</span><span className="nav-live" /></button>
      <button className="nav-item" onClick={openManagement} disabled={!projectId}><Settings2 size={18} /><span>Project settings</span></button>
      <div className="sidebar-note"><span>✳</span><strong>Every request<br />has a story.</strong><p>Let’s see what yours are saying.</p></div>
      <div className="sidebar-bottom"><div className="avatar">{user?.email.slice(0, 1).toUpperCase() ?? "A"}</div><div className="user-meta"><strong>{user?.email ?? "API Lens user"}</strong><span>Workspace member</span></div><button className="logout-button" title="Sign out" onClick={() => { signOut(); navigate("/login", { replace: true }); }}><LogOut size={17} /></button></div>
    </aside>

    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>WORKSPACE</span><span className="crumb-slash">/</span><strong>{selectedProject?.name ?? "Observatory"}</strong></div><div className="topbar-right"><span className="live-pill"><span /> LIVE DATA</span><Button className="button-neutral refresh-button" onClick={() => setReload(v => v + 1)} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</Button><button className="avatar top-avatar">{user?.email.slice(0, 1).toUpperCase() ?? "A"}</button></div></header>
      <div className="page-content">
        <div className="welcome-row"><div><div className="hello-eyebrow"><span className="hello-asterisk">✳</span> API OBSERVATORY <span className="hello-tag">PHASE 08</span></div><h1>See your API <em>clearly.</em></h1><p className="welcome-sub">A live pulse check on every request you send our way.</p></div><div className="welcome-sticker"><span>GOOD<br />SIGNALS<br /><b>ONLY ↗</b></span><span className="sticker-spark">✳</span></div></div>

        {projectError && <div className="inline-error"><ShieldAlert size={17} />{projectError}<button onClick={() => void loadProjects()}>Retry</button></div>}
        <div className="toolbar-row"><div className="project-picker"><span className="picker-label">PROJECT</span><Select aria-label="Choose project" value={projectId} onChange={e => { setProjectId(e.target.value); setPage(1); }}><option value="">Select a project…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Button className="button-yellow create-project" onClick={() => setShowCreate(true)}><Plus size={16} /> New project</Button></div>
          <div className="range-picker"><span>TIME WINDOW</span><div className="range-tabs">{ranges.map(item => <button key={item.value} className={range === item.value ? "selected" : ""} onClick={() => { setRange(item.value); setPage(1); }}>{item.label}</button>)}</div></div></div>

        {!projectId ? <Card className="first-project"><div className="first-icon"><FolderPlus size={30} /></div><div><p className="eyebrow">A LITTLE SPACE TO START</p><h2>Make your first project.</h2><p className="muted">Projects keep telemetry tidy. Create one and connect your Express app with an API key.</p><Button onClick={() => setShowCreate(true)}><Plus size={17} /> Create a project</Button></div><div className="first-doodle">✺</div></Card> : <>
          {analyticsError && <ErrorNotice message={analyticsError} retry={() => setReload(v => v + 1)} />}
          {loading && !data ? <Card className="large-loading"><LoadingState /></Card> : data && metrics ? <>
            <section className="metric-grid">
              <MetricCard label="TOTAL REQUESTS" value={metrics.totalRequests.toLocaleString()} icon={<Activity size={19} />} tint="yellow" note="in this time window" loading={loading} />
              <MetricCard label="AVG. LATENCY" value={`${Math.round(metrics.averageLatencyMs)} ms`} icon={<Gauge size={19} />} tint="purple" note="mean response time" loading={loading} />
              <MetricCard label="ERROR RATE" value={`${metrics.errorRate.toFixed(1)}%`} icon={<ShieldAlert size={19} />} tint="coral" note={`${metrics.errorCount.toLocaleString()} failed requests`} loading={loading} trend={metrics.errorRate > 5 ? "up" : "down"} />
              <MetricCard label="SUCCESS RATE" value={`${metrics.successRate.toFixed(1)}%`} icon={<Bolt size={19} />} tint="green" note={`${metrics.successCount.toLocaleString()} healthy requests`} loading={loading} />
            </section>
            <section className="analytics-grid">
              <Card className="traffic-card"><SectionTitle kicker="REQUEST VOLUME" title="Traffic, over time" action={<span className="chart-legend"><i /> REQUESTS</span>} />
                {trafficData.every(point => point.requestCount === 0) ? <EmptyState title="Quiet on the wire" body="No requests landed in this window. Connect an SDK to see traffic." /> : <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={trafficData} margin={{ top: 8, right: 12, bottom: 0, left: -15 }}><CartesianGrid stroke="#ded8cb" strokeDasharray="4 5" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#756f63", fontSize: 11, fontWeight: 600 }} minTickGap={28} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#756f63", fontSize: 11 }} allowDecimals={false} /><Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="requestCount" stroke="#181714" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#f0d640", stroke: "#181714", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div>}
              </Card>
              <Card className="status-card"><SectionTitle kicker="RESPONSE MIX" title="Status codes" /><div className="status-content">{data.statuses.data.length === 0 ? <EmptyState title="No responses yet" body="Status code distribution will appear once requests arrive." /> : <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.statuses.data} dataKey="count" nameKey="statusCode" innerRadius="63%" outerRadius="91%" paddingAngle={2} stroke="#181714" strokeWidth={1}>{data.statuses.data.map((entry, index) => <Cell key={entry.statusCode} fill={entry.statusCode >= 500 ? "#ff7b67" : entry.statusCode >= 400 ? "#f0d640" : chartColors[index % chartColors.length]} />)}</Pie><Tooltip content={<StatusTooltip />} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{metrics.totalRequests.toLocaleString()}</strong><span>REQUESTS</span></div></div><div className="status-list">{data.statuses.data.slice(0, 5).map(group => <div key={group.statusCode} className="status-line"><StatusBadge code={group.statusCode} /><span>{group.count.toLocaleString()}</span><b>{group.percentage.toFixed(1)}%</b></div>)}</div></>}</div></Card>
            </section>
            <section className="endpoint-grid"><EndpointTable title="Top endpoints" kicker="MOST TRAFFIC" rows={data.top.data} value={row => `${row.requestCount.toLocaleString()} req`} empty="No endpoint traffic yet." /><EndpointTable title="Slowest endpoints" kicker="LATENCY WATCH" rows={data.slow.data} value={row => `${Math.round((row as SlowEndpoint).averageLatencyMs)} ms`} empty="No latency data yet." accent="purple" /></section>
            <section className="lower-grid"><Card className="error-card"><SectionTitle kicker="NEEDS A LOOK" title="Endpoint errors" action={<span className="attention-chip"><ShieldAlert size={14} /> {data.errors.data.length} flagged</span>} />{data.errors.data.length === 0 ? <EmptyState title="Nothing alarming" body="Endpoints with failed responses will show up here." /> : <div className="error-endpoint-list">{data.errors.data.map((row, index) => <div className="error-endpoint" key={`${row.method}-${row.route}`}><span className="rank">0{index + 1}</span><div className="endpoint-name"><code>{row.method}</code><strong>{row.route}</strong><span>{row.errorCount} errors / {row.requestCount} requests</span></div><span className="error-rate">{row.errorRate.toFixed(1)}%</span><div className="rate-track"><i style={{ width: `${Math.min(row.errorRate, 100)}%` }} /></div></div>)}</div>}</Card>
              <Card className="signal-card"><div className="signal-icon"><Sparkles size={22} /></div><p className="eyebrow">A SMALL REMINDER</p><h3>Good observability<br />starts with the details.</h3><p>API Lens only collects method, route, status, latency, and timestamp. Your payloads stay yours.</p><div className="privacy-stamp"><span>NO BODIES</span><span>NO HEADERS</span><span>JUST SIGNAL</span></div></Card></section>
            <Card className="requests-card"><SectionTitle kicker="THE LATEST ACTIVITY" title="Recent requests" action={<span className="request-count">{data.recent.pagination.total.toLocaleString()} total</span>} />{data.recent.data.length === 0 ? <EmptyState title="No requests in this window" body="Once your SDK starts sending events, each request will land here." /> : <><div className="table-scroll"><table className="request-table"><thead><tr><th>METHOD</th><th>ROUTE</th><th>STATUS</th><th>LATENCY</th><th>WHEN</th></tr></thead><tbody>{data.recent.data.map(log => <tr key={log.id}><td><span className={`method-tag method-${log.method.toLowerCase()}`}>{log.method}</span></td><td><code className="route-code">{log.route}</code></td><td><StatusBadge code={log.statusCode} /></td><td><span className="latency-cell">{log.latency} <small>ms</small></span></td><td><span className="time-cell"><Clock3 size={13} />{formatRelative(log.timestamp)}</span></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, data.recent.pagination.total)} of {data.recent.pagination.total}</span><div><Button className="button-neutral page-button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}><ChevronLeft size={17} /> Previous</Button><Button className="button-neutral page-button" disabled={page >= data.recent.pagination.totalPages || loading} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={17} /></Button></div></div></>}</Card>
          </> : !analyticsError ? <Card className="large-loading"><LoadingState /></Card> : null}
        </>}
        <footer className="page-footer"><span>API LENS <b>✳</b> A CLEARER VIEW OF YOUR API</span><a href="https://github.com" target="_blank" rel="noreferrer">Built for the curious <ArrowUpRight size={13} /></a></footer>
      </div>
    </main>
    {showCreate && <ProjectDialog onClose={() => setShowCreate(false)} onCreate={createProject} busy={false} />}
    {manageOpen && selectedProject && <div className="dialog-scrim" onMouseDown={e => { if (e.target === e.currentTarget) setManageOpen(false); }}><section className="dialog-card manage-dialog" role="dialog" aria-modal="true"><button className="icon-button dialog-close" onClick={() => setManageOpen(false)} aria-label="Close"><Ellipsis size={18} /></button><span className="dialog-sticker">PROJECT CONTROL</span><h2>{selectedProject.name}</h2><p className="muted">Manage API keys and project lifecycle.</p><div className="manage-section"><div className="manage-heading"><h3><KeyRound size={17} /> API keys</h3><Button className="button-yellow" onClick={() => void generateKey()} busy={keyAction}><Plus size={15} /> Generate key</Button></div>{newKey && <div className="new-key-box"><strong>Copy this key now — it is only shown once.</strong><code>{newKey}</code><Button className="button-neutral copy-key" onClick={() => void navigator.clipboard?.writeText(newKey)}>Copy key</Button></div>}{manageError && <p className="form-error">{manageError}</p>}{keysLoading ? <LoadingState label="Loading keys" /> : keys.length ? keys.map(key => <div className="key-row" key={key.id}><div><strong>lens_••••••••{key.id.slice(-5)}</strong><span>{key.revokedAt ? `Revoked ${new Date(key.revokedAt).toLocaleDateString()}` : `Created ${new Date(key.createdAt).toLocaleDateString()}`}</span></div><span className={`key-state ${key.revokedAt ? "revoked" : "active-key"}`}>{key.revokedAt ? "REVOKED" : "ACTIVE"}</span>{!key.revokedAt && <Button className="revoke-button" disabled={keyAction} onClick={() => void revokeKey(key)}>Revoke</Button>}</div>) : !keysLoading && <p className="muted">No API keys have been created yet.</p>}</div><div className="manage-section danger-zone"><h3><Trash2 size={17} /> Remove project</h3><p>This permanently deletes the project and its stored request logs.</p><Button className="button-danger" onClick={() => selectedProject && void deleteProject(selectedProject)}>Delete project</Button></div></section></div>}
  </div>;
}

function MetricCard({ label, value, icon, tint, note, loading, trend }: { label: string; value: string; icon: ReactNode; tint: string; note: string; loading: boolean; trend?: "up" | "down" }) {
  return <Card className={`metric-card tint-${tint}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{loading ? <i className="value-skeleton" /> : value}</div><div className="metric-note">{trend && (trend === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}{note}</div><span className="metric-ornament" /></Card>;
}
function EndpointTable({ title, kicker, rows, value, empty, accent = "yellow" }: { title: string; kicker: string; rows: EndpointCount[]; value: (row: EndpointCount) => string; empty: string; accent?: string }) {
  return <Card className={`endpoint-card endpoint-${accent}`}><SectionTitle kicker={kicker} title={title} />{rows.length ? <div className="endpoint-list">{rows.map((row, index) => <div className="endpoint-row" key={`${row.method}-${row.route}`}><span className="endpoint-rank">{String(index + 1).padStart(2, "0")}</span><div className="endpoint-name"><strong>{row.route}</strong><span>{row.method}</span></div><b>{value(row)}</b></div>)}</div> : <EmptyState title="No endpoint data" body={empty} />}</Card>;
}
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) { if (!active || !payload?.length) return null; return <div className="chart-tooltip"><span>{label}</span><strong>{Number(payload[0].value).toLocaleString()} requests</strong></div>; }
function StatusTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) { if (!active || !payload?.length) return null; return <div className="chart-tooltip"><span>HTTP {payload[0].name}</span><strong>{Number(payload[0].value).toLocaleString()} requests</strong></div>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Unexpected error. Please try again."; }
function formatRelative(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export default App;
