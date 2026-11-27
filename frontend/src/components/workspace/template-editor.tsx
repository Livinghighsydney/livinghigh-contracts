import { useState, useRef, useCallback, Suspense } from "react";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Save,
  PenLine,
  CalendarDays,
  UserRound,
  Mail,
  Type,
  Trash2,
  GripVertical,
  Check,
  FileText,
  LoaderCircle,
  Building2,
  Hash,
  Wallet,
  SquareCheck,
  CircleDot,
  ChevronDownSquare,
} from "lucide-react";
import { FieldSettings, FilledBySwitch, boxText, optionProblem, settingsOf } from "./field-settings";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "./pdf-preview";
import { Empty, UnsavedWarning } from "./common";
import { DataGate } from "./shell";
import { templateApi } from "@/api/templates";
import { authApi } from "@/api/auth";
import type { TemplateField, FieldType, DataKey } from "@/api/types";
import { choiceFontSize, clampField, hasSignature, ptToCss } from "@/lib/contracts";
import { toast } from "sonner";
const TICK_SIZE = { width: 2, height: 1.45 };
type Tool = {
  type: FieldType;
  label: string;
  dataKey?: DataKey;
  /** Starting settings and size for the new field. */
  defaults?: Partial<TemplateField>;
  /** Staff answer it on the New Contract form (tenant sees it locked). */
  staffFill?: boolean;
  size?: { width: number; height: number };
};
// One set of field types (no Number field — money/amounts are plain Text, e.g. "$350 per week"); who fills them is chosen with the "Filled by" picker (like PandaDoc roles).
const CHOICE_SIZE = { width: 25, height: 4 };
const commonTools: Tool[] = [
  { type: "DROPDOWN", label: "Dropdown", size: CHOICE_SIZE, defaults: { label: "Dropdown", options: ["Option 1", "Option 2"] } },
  { type: "TEXT", label: "Text", defaults: { label: "Text" } },
  { type: "RADIO", label: "Radio buttons", size: CHOICE_SIZE, defaults: { label: "Choose one", options: ["Yes", "No"], direction: "horizontal" } },
  { type: "CHECKBOX", label: "Checkbox", size: { width: 30, height: 4 }, defaults: { label: "Checkbox", options: ["I agree"], direction: "vertical" } },
  // Box only — for boxes already printed on the PDF (≈ 4 mm square on A4).
  { type: "CHECKBOX", label: "Tick box", size: TICK_SIZE, defaults: { tickOnly: true, label: "Tick box" } },
];
const tenantTools: Tool[] = [
  { type: "SIGNATURE", label: "Signature" },
  { type: "INITIALS", label: "Initials" },
  { type: "DATE", label: "Date signed" },
  { type: "NAME", label: "Full name" },
  { type: "EMAIL", label: "Email" },
  ...commonTools,
];
// Staff fill these in on the New Contract form (printed on the agreement before the tenant signs).
// Simple, generic fields only (no "tenant name / rent" special boxes) — the label says what it is.
const staffDate: Tool = { type: "TEXT", label: "Date", size: { width: 20, height: 3 }, defaults: { label: "Date", dateInput: true } };
const staffTools: Tool[] = [
  ...commonTools.slice(0, 2), // Dropdown, Text
  // Staff pick a date on New Contract; printed as dd/mm/yyyy.
  staffDate,
  ...commonTools.slice(2),
].map((t): Tool => ({
  ...t,
  staffFill: true,
  defaults: { ...t.defaults, ...(t.defaults?.tickOnly ? { group: "", optionLabel: "", groupMode: "one" as const } : {}) },
}));
const sameTool = (a: Tool, b: Tool) =>
  a.type === b.type &&
  a.dataKey === b.dataKey &&
  Boolean(a.staffFill) === Boolean(b.staffFill) &&
  Boolean(a.defaults?.tickOnly) === Boolean(b.defaults?.tickOnly) &&
  Boolean(a.defaults?.dateInput) === Boolean(b.defaults?.dateInput);
/** Filled before sending (contract details or staff answers) rather than by the tenant. */
const fromContract = (f: TemplateField) => Boolean(f.dataKey || f.staffFill);
const icons: Record<FieldType, typeof PenLine> = {
  NUMBER: Hash,
  CHECKBOX: SquareCheck,
  RADIO: CircleDot,
  DROPDOWN: ChevronDownSquare,
  SIGNATURE: PenLine,
  INITIALS: PenLine,
  DATE: CalendarDays,
  NAME: UserRound,
  EMAIL: Mail,
  TEXT: Type,
};
/** Waits for templates to load from the backend before opening the editor. */
export function TemplateEditor({ id }: { id: string }) {
  return (
    <DataGate>
      <TemplateEditorScreen id={id} />
    </DataGate>
  );
}
function TemplateEditorScreen({ id }: { id: string }) {
  if (!authApi.canManageTemplates())
    return (
      <main className="page">
        <Empty title="Admins and Managers only" description="Ask an Admin or Manager to change this template’s fields." />
      </main>
    );
  return <TemplateEditorBody id={id} />;
}
function TemplateEditorBody({ id }: { id: string }) {
  const template = templateApi.get(id);
  const navigate = useNavigate();
  const [fields, setFields] = useState<TemplateField[]>(() =>
    structuredClone(template?.fields ?? []),
  );
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const motion = useRef<{
    id: string;
    x: number;
    y: number;
    initial: TemplateField;
    width: number;
    height: number;
    resize: boolean;
  } | null>(null);
  const [role, setRole] = useState<"tenant" | "staff">("tenant");
  const current = fields.find((f) => f.id === selected);
  const firstOptionProblem = fields.map(optionProblem).find(Boolean) ?? "";
  const visiblePage = useCallback((p: number) => setPage(p), []);
  function update(id: string, patch: Partial<TemplateField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? clampField({ ...f, ...patch }) : f)));
    setDirty(true);
  }
  function add(tool: Tool, p = page, x = 15, y = 25) {
    const { defaults, size, ...base } = tool;
    const f = clampField({
      id: crypto.randomUUID(),
      ...base,
      ...defaults,
      required: true,
      page: p,
      positionX: x,
      positionY: y,
      width: size?.width ?? (tool.type === "SIGNATURE" ? 35 : tool.dataKey === "property_address" ? 55 : 25),
      height: size?.height ?? (tool.type === "SIGNATURE" ? 7 : 4),
    });
    setFields((fs) => [...fs, f]);
    setSelected(f.id);
    setDirty(true);
  }
  function remove() {
    setFields((fs) => fs.filter((f) => f.id !== selected));
    setSelected("");
    setDirty(true);
  }
  function begin(e: React.PointerEvent<HTMLDivElement>, f: TemplateField, resize = false) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    motion.current = {
      id: f.id,
      x: e.clientX,
      y: e.clientY,
      initial: f,
      width: rect.width,
      height: rect.height,
      resize,
    };
    setSelected(f.id);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const m = motion.current;
    if (!m) return;
    const dx = ((e.clientX - m.x) / m.width) * 100;
    const dy = ((e.clientY - m.y) / m.height) * 100;
    update(
      m.id,
      m.resize
        ? { width: m.initial.width + dx, height: m.initial.height + dy }
        : { positionX: m.initial.positionX + dx, positionY: m.initial.positionY + dy },
    );
  }
  function leave() {
    if (!dirty || window.confirm("Leave without saving your field changes?"))
      void navigate({ to: "/templates" });
  }
  if (!template)
    return (
      <main className="page">
        <Empty title="Template not found" description="It may have been removed.">
          <Button onClick={() => void navigate({ to: "/templates" })}>Back to templates</Button>
        </Empty>
      </main>
    );
  function toolButton(tool: Tool) {
    const Icon = tool.defaults?.dateInput ? CalendarDays : icons[tool.type];
    return (
      <Button
        variant="ghost"
        className={`editor-tool ${tool.dataKey || tool.staffFill ? "text-primary" : "text-tenant"}`}
        key={`${tool.type}-${tool.dataKey ?? ""}-${tool.staffFill ? "staff" : ""}-${tool.defaults?.tickOnly ? "tick" : ""}-${tool.defaults?.dateInput ? "date" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/livinghigh-field", JSON.stringify(tool));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => add(tool)}
        title={`Add ${tool.label.toLowerCase()} to page ${page}`}
      >
        <Icon />
        {tool.label}
      </Button>
    );
  }
  return (
    <div className="editor">
      <UnsavedWarning dirty={dirty} />
      <header className="editor-header">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" aria-label="Back to templates" onClick={leave}>
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{template.name}</h1>
            <p className="text-[10px] text-muted-foreground mt-1">Template field editor</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span className="editor-status hidden sm:inline">
            {dirty ? "Unsaved changes" : `${fields.length} fields`} · Page {page}
          </span>
          <Button
            disabled={!hasSignature(fields) || Boolean(firstOptionProblem) || saving}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await templateApi.saveFields(id, fields);
                setDirty(false);
                toast.success("Fields saved. Your template is ready to use.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Fields couldn’t be saved. Try again.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}Save fields
          </Button>
        </div>
      </header>
      <div className="editor-layout">
        <aside className="editor-panel">
          <div className="editor-group">
            <h3>Add fields</h3>
            <p className="text-[10px] text-muted-foreground mb-2">Filled by</p>
            <div className="flex rounded-md border border-border p-0.5 mb-3" role="tablist" aria-label="Who fills the new fields">
              {(["tenant", "staff"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={role === r}
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    role === r
                      ? r === "tenant" ? "bg-tenant text-white" : "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r === "tenant" ? "Tenant" : "Staff (before sending)"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mb-3">
              {role === "tenant"
                ? "The tenant completes these when signing."
                : "Staff fill these in on the New Contract form. Printed on the agreement before it’s sent."}
            </p>
            <div className="editor-tools">{(role === "tenant" ? tenantTools : staffTools).map(toolButton)}</div>
          </div>
          {current ? (
            <div className="editor-group">
              <h3>Selected field</h3>
              {!(current.tickOnly && current.staffFill) && (
              <label className="field mb-4">
                {current.staffFill
                  ? "Question shown to staff"
                  : current.type === "TEXT" && !current.dataKey
                    ? "Tenant-facing label"
                    : "Field label"}
                <input
                  aria-label={
                    current.type === "TEXT" && !current.dataKey
                      ? "Tenant-facing label"
                      : "Field label"
                  }
                  value={current.label}
                  onChange={(e) => update(current.id, { label: e.target.value })}
                />
              </label>
              )}
              <FilledBySwitch field={current} onChange={(patch) => update(current.id, patch)} />
              <FieldSettings
                field={current}
                onChange={(patch) => update(current.id, patch)}
                siblings={fields}
                onChangeMany={(patches) => {
                  setFields((fs) => fs.map((f) => (patches[f.id] ? clampField({ ...f, ...patches[f.id] }) : f)));
                  setDirty(true);
                }}
              />
              <dl className="text-[11px] text-muted-foreground grid grid-cols-2 gap-3 mb-4">
                <div>
                  Page <strong className="text-foreground">{current.page}</strong>
                </div>
                <div>{current.dataKey ? "Contract detail" : current.staffFill ? "Staff fill in" : "Tenant fills in"}</div>
                <div>Left {current.positionX.toFixed(1)}%</div>
                <div>Top {current.positionY.toFixed(1)}%</div>
                <div>Width {current.width.toFixed(1)}%</div>
                <div>Height {current.height.toFixed(1)}%</div>
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive w-full"
                onClick={remove}
              >
                <Trash2 />
                Delete field
              </Button>
            </div>
          ) : (
            <div className="editor-group">
              <h3>
                Placed fields <span className="total-pill">{fields.length}</span>
              </h3>
              <div className="flex flex-col gap-1">
                {fields.map((f) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start text-[10px] font-normal"
                    key={f.id}
                    onClick={() => {
                      setSelected(f.id);
                      document
                        .querySelector(`[data-field-id="${f.id}"]`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${fromContract(f) ? "bg-primary" : "bg-tenant"}`}
                    />
                    {f.label}
                    <span className="ml-auto text-muted-foreground">p{f.page}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!hasSignature(fields) && (
            <div className="notice warning">
              <PenLine size={17} />
              <span>Add at least one tenant Signature box before saving.</span>
            </div>
          )}
          {firstOptionProblem && (
            <div className="notice warning">
              <PenLine size={17} />
              <span>{firstOptionProblem}</span>
            </div>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </aside>
        <main className="editor-pages">
          <ClientOnly fallback={<div className="empty-state">Opening agreement…</div>}>
            <Suspense fallback={<div className="empty-state">Opening agreement…</div>}>
              <PdfViewer
                {...(template.pdfUrl ? { url: template.pdfUrl } : {})}
                onPageVisible={visiblePage}
                overlay={(p) => (
                  <div
                    className="absolute inset-0"
                    aria-label={`Fields on page ${p}`}
                    onClick={() => setSelected("")}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData("application/livinghigh-field");
                      if (!raw) return;
                      try {
                        const tool = JSON.parse(raw) as Tool;
                        if (
                          !tenantTools
                            .concat(staffTools)
                            .some((t) => sameTool(t, tool))
                        )
                          return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        add(
                          tool,
                          p,
                          ((e.clientX - rect.left) / rect.width) * 100,
                          ((e.clientY - rect.top) / rect.height) * 100,
                        );
                      } catch {
                        toast.error("This field couldn’t be added. Try clicking it.");
                      }
                    }}
                  >
                    {fields
                      .filter((f) => f.page === p)
                      .map((f) => (
                        <div
                          key={f.id}
                          data-field-id={f.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`${f.label}, page ${p}`}
                          aria-pressed={selected === f.id}
                          className={`pdf-box editable ${fromContract(f) ? "" : "tenant-box"} ${f.tickOnly ? (f.showText ? "tick-only with-text" : "tick-only") : ""} ${selected === f.id ? "selected" : ""}`}
                          title={f.tickOnly ? f.label : undefined}
                          style={{
                            left: `${f.positionX}%`,
                            top: `${f.positionY}%`,
                            width: `${f.width}%`,
                            height: `${f.height}%`,
                            ...(choiceFontSize(f) ? { fontSize: ptToCss(choiceFontSize(f)!) } : {}),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(f.id);
                          }}
                          onPointerDown={(e) => begin(e, f)}
                          onPointerMove={move}
                          onPointerUp={() => {
                            motion.current = null;
                          }}
                          onLostPointerCapture={() => {
                            motion.current = null;
                          }}
                          onKeyDown={(e) => {
                            const amount = e.shiftKey ? 1 : 0.2;
                            if (e.key === "Delete" || e.key === "Backspace") {
                              e.preventDefault();
                              setFields((fs) => fs.filter((x) => x.id !== f.id));
                              setSelected("");
                              setDirty(true);
                            } else if (e.key.startsWith("Arrow")) {
                              e.preventDefault();
                              update(f.id, {
                                positionX:
                                  f.positionX +
                                  (e.key === "ArrowRight"
                                    ? amount
                                    : e.key === "ArrowLeft"
                                      ? -amount
                                      : 0),
                                positionY:
                                  f.positionY +
                                  (e.key === "ArrowDown"
                                    ? amount
                                    : e.key === "ArrowUp"
                                      ? -amount
                                      : 0),
                              });
                            }
                          }}
                        >
                          {!f.tickOnly && <GripVertical size={10} />}
                          <span className="truncate">{boxText(f)}</span>
                          {!fromContract(f) && !f.tickOnly && f.type !== "SIGNATURE" && settingsOf(f).required !== false && (
                            <span className="text-destructive" aria-label="required">*</span>
                          )}
                          {selected === f.id && (
                            <span
                              role="button"
                              aria-label={`Resize ${f.label}`}
                              className="resize-handle"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const parent = e.currentTarget.parentElement;
                                const rect = parent?.parentElement?.getBoundingClientRect();
                                if (!parent || !rect) return;
                                parent.setPointerCapture(e.pointerId);
                                motion.current = {
                                  id: f.id,
                                  x: e.clientX,
                                  y: e.clientY,
                                  initial: f,
                                  width: rect.width,
                                  height: rect.height,
                                  resize: true,
                                };
                              }}
                            />
                          )}
                        </div>
                      ))}
                  </div>
                )}
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}
