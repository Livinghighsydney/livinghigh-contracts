import { useState, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
  FileText,
  Send,
  Eye,
  CircleCheck,
  TrendingUp,
  Clock3,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Status, Empty } from "./common";
import { contractApi } from "@/api/contracts";
import { templateApi } from "@/api/templates";
import { useResourceVersion } from "@/api/store";
import { date, time, metrics, isComplete } from "@/lib/contracts";
import type { Contract } from "@/api/types";
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfWeek = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
};
const tabs = ["All", "Draft", "Sent", "Viewed", "Completed", "Cancelled/Expired"];
function Trend({ contracts }: { contracts: Contract[] }) {
  // Last four weeks, ending today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = [0, 1, 2, 3].map((i) => {
    const start = new Date(today.getTime() - (27 - i * 7) * 86400000);
    const end = new Date(start.getTime() + 7 * 86400000);
    const c = contracts.filter(
      (c) => new Date(c.created_at) >= start && new Date(c.created_at) < end,
    );
    return {
      label: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(start),
      sent: c.filter((c) => contractApi.events(c.id).some((e) => e.type === "sent")).length,
      completed: c.filter((c) => isComplete(c.status)).length,
    };
  });
  const max = Math.max(10, ...weeks.map((w) => w.sent));
  const coords = (key: "sent" | "completed") =>
    weeks.map((w, i) => `${45 + i * 140},${155 - (w[key] / max) * 125}`).join(" ");
  return (
    <svg
      className="trend-svg"
      viewBox="0 0 500 190"
      role="img"
      aria-label={`Weekly contracts trend: ${weeks.map((w) => `${w.label}: ${w.sent} sent, ${w.completed} completed`).join("; ")}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line className="chart-grid" x1="40" y1={30 + i * 42} x2="465" y2={30 + i * 42} />
          <text className="chart-label" x="0" y={34 + i * 42}>
            {Math.round(max * (1 - i / 3))}
          </text>
        </g>
      ))}
      <polygon className="chart-area" points={`45,155 ${coords("completed")} 465,155`} />
      <polyline className="chart-sent" points={coords("sent")} />
      <polyline className="chart-completed" points={coords("completed")} />
      {weeks.map((w, i) => (
        <g key={i}>
          <circle
            cx={45 + i * 140}
            cy={155 - (w.completed / max) * 125}
            r="3"
            fill="var(--primary)"
          />
          <text className="chart-label" x={45 + i * 140} y="184" textAnchor="middle">
            {w.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function Dashboard() {
  useResourceVersion();
  const navigate = useNavigate();
  const [range, setRange] = useState("This month");
  const [from, setFrom] = useState(isoDay(startOfMonth(new Date())));
  const [to, setTo] = useState(isoDay(new Date()));
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const all = contractApi.list();
  const ranged = useMemo(() => {
    const now = new Date();
    let start = startOfMonth(now);
    let end = now;
    if (range === "This week") start = startOfWeek(now);
    if (range === "Last 30 days") start = new Date(now.getTime() - 30 * 86400000);
    if (range === "Custom") {
      start = new Date(`${from}T00:00:00`);
      end = new Date(`${to}T23:59:59`);
    }
    return all.filter((c) => new Date(c.created_at) >= start && new Date(c.created_at) <= end);
  }, [all, range, from, to]);
  const m = metrics(ranged, contractApi.events);
  const filtered = all
    .filter(
      (c) =>
        (tab === "All" ||
          (tab === "Completed" && isComplete(c.status)) ||
          (tab === "Cancelled/Expired" && ["cancelled", "rejected"].includes(c.status)) ||
          tab.toLowerCase() === c.status) &&
        `${c.tenant_name} ${c.tenant_email} ${c.property_address}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (ascending ? 1 : -1) *
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
  const rows = filtered.slice(page * 8, page * 8 + 8);
  const cards = [
    { label: "Created", value: m.created, icon: FileText, foot: "Agreements created" },
    { label: "Sent", value: m.sent, icon: Send, foot: "Sent to tenants" },
    { label: "Viewed", value: m.viewed, icon: Eye, foot: "Opened by tenants" },
    { label: "Completed", value: m.completed, icon: CircleCheck, foot: "Signed and ready to file" },
    { label: "Close rate", value: `${m.closeRate}%`, icon: TrendingUp, foot: "Completed / sent" },
  ];
  return (
    <main className="page">
      <PageHeader title="Dashboard" eyebrow="Your workspace" subtitle={new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" }).format(new Date())}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <CalendarDays
              size={14}
              className="absolute left-3 top-3 text-muted-foreground pointer-events-none"
            />
            <select
              aria-label="Metrics date range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="pl-9 text-xs h-10 min-w-[140px]"
            >
              {["This week", "This month", "Last 30 days", "Custom"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <Button asChild className="h-10">
            <Link to="/new-contract">
              <Plus />
              New contract
            </Link>
          </Button>
        </div>
      </PageHeader>
      {range === "Custom" && (
        <div className="flex flex-wrap gap-4 mb-5">
          <label className="field">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          {to < from && <p className="field-error">End date must be after the start date.</p>}
        </div>
      )}
      <section className="metrics-grid" aria-label="Contract metrics">
        {cards.map((card, i) => (
          <div key={card.label} className={`metric-card ${i === 4 ? "metric-highlight" : ""}`}>
            <div className="metric-top">
              <span>{card.label}</span>
              <span
                className={`metric-icon ${i === 1 ? "text-sent bg-sent-soft" : i === 2 ? "text-viewed bg-viewed-soft" : i === 3 ? "text-primary bg-secondary" : ""}`}
              >
                <card.icon />
              </span>
            </div>
            <div className="metric-value">{card.value}</div>
            <div className="metric-foot">
              {i === 3 ? <CircleCheck size={11} /> : i === 4 ? <ArrowUpRight size={11} /> : null}
              {card.foot}
            </div>
          </div>
        ))}
      </section>
      <section className="analytics-grid" aria-label="Contract analytics">
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h2 className="section-title">Contract activity</h2>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Weekly totals · last 4 weeks
              </p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot soft" />
                Sent
              </span>
              <span>
                <i className="legend-dot" />
                Completed
              </span>
            </div>
          </div>
          <Trend contracts={ranged} />
        </div>
        <div className="chart-panel">
          <div className="chart-heading">
            <div>
              <h2 className="section-title">From sent to signed</h2>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {m.closeRate}% of sent agreements completed
              </p>
            </div>
            <TrendingUp size={17} className="text-muted-foreground" />
          </div>
          <div className="mt-6">
            {[
              { label: "Sent", value: m.sent },
              { label: "Viewed", value: m.viewed },
              { label: "Completed", value: m.completed },
            ].map((f) => (
              <div className="funnel-row" key={f.label}>
                <span>{f.label}</span>
                <div className="funnel-track">
                  <div
                    className="funnel-bar"
                    style={{ width: `${m.sent ? (f.value / m.sent) * 100 : 0}%` }}
                  />
                </div>
                <strong className="text-right font-semibold">{f.value}</strong>
              </div>
            ))}
          </div>
          <div className="sign-time">
            <span className="flex items-center gap-2">
              <Clock3 size={14} />
              Average time to sign
            </span>
            <strong>{m.averageHours ? `${m.averageHours.toFixed(1)} hrs` : "—"}</strong>
          </div>
        </div>
      </section>
      <section className="contracts-section">
        <div className="list-heading">
          <h2 className="section-title">
            All contracts<span className="total-pill">{all.length}</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-muted-foreground"
            onClick={() => {
              setAscending(!ascending);
              setPage(0);
            }}
          >
            <ArrowUpDown size={13} />
            {ascending ? "Oldest first" : "Newest first"}
          </Button>
        </div>
        <div className="list-toolbar">
          <div className="tabs" role="tablist" aria-label="Filter contracts">
            {tabs.map((t) => (
              <Button
                key={t}
                variant="ghost"
                role="tab"
                aria-selected={tab === t}
                className={`tab ${tab === t ? "selected" : ""}`}
                onClick={() => {
                  setTab(t);
                  setPage(0);
                }}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="search-box">
            <Search />
            <input
              aria-label="Search contracts"
              placeholder="Search tenant or property…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        <div className="table-scroll">
          <table className="contract-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / room</th>
                <th>Template</th>
                <th>Status</th>
                <th>Last activity</th>
                <th>Created</th>
                <th aria-label="Open contract" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  onClick={() => void navigate({ to: "/contracts/$id", params: { id: c.id } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      void navigate({ to: "/contracts/$id", params: { id: c.id } });
                  }}
                  aria-label={`Open contract for ${c.tenant_name}`}
                >
                  <td>
                    <div className="tenant-cell">
                      <span className={`tenant-avatar tone-${i % 4}`}>
                        {c.tenant_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <div>
                        <div className="cell-name">{c.tenant_name}</div>
                        <div className="cell-secondary">{c.tenant_email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-name">{c.property_address.split(",")[0]}</div>
                    <div className="cell-secondary">
                      {[c.property_address.split(",").slice(1).join(",").trim(), c.room_number && `Room ${c.room_number}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="text-muted-foreground">
                    {templateApi.get(c.template_key)?.name ?? c.template_key}
                  </td>
                  <td>
                    <Status status={c.status} />
                  </td>
                  <td>
                    <div>{date(c.updated_at)}</div>
                    <div className="cell-secondary">{time(c.updated_at)}</div>
                  </td>
                  <td className="text-muted-foreground">{date(c.created_at)}</td>
                  <td>
                    <ChevronRight size={13} className="text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <Empty
            title={all.length ? "No matching contracts" : "No contracts yet"}
            description={
              all.length
                ? "Try another name, property or status."
                : "Create your first agreement when you’re ready."
            }
          />
        )}
        <div className="table-footer">
          <span>
            Showing {filtered.length ? page * 8 + 1 : 0}–{Math.min((page + 1) * 8, filtered.length)}{" "}
            of {filtered.length} contracts
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="px-2">
              {page + 1} / {Math.max(1, Math.ceil(filtered.length / 8))}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Next page"
              disabled={(page + 1) * 8 >= filtered.length}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
      <footer className="page-footer">
        <span>Every agreement. A new beginning.</span>
        <span>All times shown in Sydney time</span>
      </footer>
    </main>
  );
}
