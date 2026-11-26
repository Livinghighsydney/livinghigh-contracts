import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import type { TemplateField, DataKey } from "../api/templates";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/* ---------- Field palette (like PandaDoc's right-hand panel) ---------- */

type FieldType = TemplateField["type"];

interface PaletteItem {
  key: string;
  label: string;
  type: FieldType;
  dataKey?: DataKey;
  w: number; // default size, percent of page
  h: number;
}

const TENANT_FIELDS: PaletteItem[] = [
  { key: "signature", label: "Signature",   type: "SIGNATURE", w: 24, h: 6 },
  { key: "initials",  label: "Initials",    type: "INITIALS",  w: 10, h: 4 },
  { key: "date",      label: "Date signed", type: "DATE",      w: 16, h: 3 },
  { key: "name",      label: "Full name",   type: "NAME",      w: 24, h: 3 },
  { key: "email",     label: "Email",       type: "EMAIL",     w: 24, h: 3 },
  { key: "text",      label: "Text box",    type: "TEXT",      w: 24, h: 3 },
];

const DATA_FIELDS: PaletteItem[] = [
  { key: "d_tenant_name",      label: "Tenant name",      type: "TEXT", dataKey: "tenant_name",      w: 26, h: 3 },
  { key: "d_tenant_email",     label: "Tenant email",     type: "TEXT", dataKey: "tenant_email",     w: 26, h: 3 },
  { key: "d_property_address", label: "Property address", type: "TEXT", dataKey: "property_address", w: 40, h: 3 },
  { key: "d_room_number",      label: "Room number",      type: "TEXT", dataKey: "room_number",      w: 10, h: 3 },
  { key: "d_weekly_rent",      label: "Weekly rent",      type: "TEXT", dataKey: "weekly_rent",      w: 14, h: 3 },
  { key: "d_bond_amount",      label: "Bond amount",      type: "TEXT", dataKey: "bond_amount",      w: 14, h: 3 },
  { key: "d_start_date",       label: "Start date",       type: "TEXT", dataKey: "start_date",       w: 14, h: 3 },
  { key: "d_end_date",         label: "End date",         type: "TEXT", dataKey: "end_date",         w: 14, h: 3 },
];

const ALL_ITEMS = [...TENANT_FIELDS, ...DATA_FIELDS];
const DRAG_MIME = "application/x-lh-field";
const PAGE_WIDTH = 760;
const MIN_SIZE = 2; // percent

function displayLabel(f: TemplateField): string {
  if (f.label) return f.label;
  const item = ALL_ITEMS.find((i) => (f.dataKey ? i.dataKey === f.dataKey : i.type === f.type && !i.dataKey));
  return item?.label ?? f.type;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/* ---------- Component ---------- */

interface Props {
  templateName: string;
  pdfUrl: string;
  existingFields: TemplateField[];
  onSave: (fields: TemplateField[]) => Promise<void>;
  onClose: () => void;
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  orig: TemplateField;
  pageRect: DOMRect;
}

export function FieldPlacer({ templateName, pdfUrl, existingFields, onSave, onClose }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [fields, setFields] = useState<TemplateField[]>(existingFields);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const hasSignature = fields.some((f) => f.type === "SIGNATURE");

  const update = useCallback((id: string, patch: Partial<TemplateField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setDirty(true);
  }, []);

  const remove = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId(null);
    setDirty(true);
  }, []);

  const addField = (item: PaletteItem, page: number, centerX: number, centerY: number) => {
    const f: TemplateField = {
      id: crypto.randomUUID(),
      type: item.type,
      page,
      positionX: clamp(centerX - item.w / 2, 0, 100 - item.w),
      positionY: clamp(centerY - item.h / 2, 0, 100 - item.h),
      width: item.w,
      height: item.h,
      recipient: "tenant",
      dataKey: item.dataKey ?? null,
      label: item.dataKey ? item.label : null,
    };
    setFields((prev) => [...prev, f]);
    setSelectedId(f.id);
    setDirty(true);
  };

  /* Click a palette item → drop it in the middle of the page you are looking at. */
  const addToVisiblePage = (item: PaletteItem) => {
    const view = scrollRef.current?.getBoundingClientRect();
    let best = 1;
    let bestArea = -1;
    for (let p = 1; p <= numPages; p++) {
      const r = pageRefs.current[p]?.getBoundingClientRect();
      if (!r || !view) continue;
      const visible = Math.max(0, Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top));
      if (visible > bestArea) { bestArea = visible; best = p; }
    }
    addField(item, best, 50, 40);
  };

  /* ---- Drag from palette onto a page ---- */
  const onPageDrop = (e: React.DragEvent<HTMLDivElement>, page: number) => {
    e.preventDefault();
    setDropTarget(null);
    const item = ALL_ITEMS.find((i) => i.key === e.dataTransfer.getData(DRAG_MIME));
    const rect = pageRefs.current[page]?.getBoundingClientRect();
    if (!item || !rect) return;
    addField(
      item,
      page,
      ((e.clientX - rect.left) / rect.width) * 100,
      ((e.clientY - rect.top) / rect.height) * 100,
    );
  };

  /* ---- Move / resize a placed field ---- */
  const startDrag = (e: React.PointerEvent, field: TemplateField, mode: DragState["mode"]) => {
    e.stopPropagation();
    e.preventDefault();
    const pageRect = pageRefs.current[field.page]?.getBoundingClientRect();
    if (!pageRect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: field.id, mode, startX: e.clientX, startY: e.clientY, orig: field, pageRect };
    setSelectedId(field.id);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.pageRect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.pageRect.height) * 100;
    const o = d.orig;
    if (d.mode === "move") {
      update(d.id, {
        positionX: clamp(o.positionX + dx, 0, 100 - o.width),
        positionY: clamp(o.positionY + dy, 0, 100 - o.height),
      });
    } else {
      update(d.id, {
        width: clamp(o.width + dx, MIN_SIZE, 100 - o.positionX),
        height: clamp(o.height + dy, MIN_SIZE, 100 - o.positionY),
      });
    }
  };

  const endDrag = () => { drag.current = null; };

  /* ---- Keyboard: Delete removes, arrows nudge, Esc deselects ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || !selected) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected.id); return; }
      if (e.key === "Escape") { setSelectedId(null); return; }
      const step = e.shiftKey ? 1 : 0.25;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        update(selected.id, {
          positionX: clamp(selected.positionX + m[0], 0, 100 - selected.width),
          positionY: clamp(selected.positionY + m[1], 0, 100 - selected.height),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, remove, update]);

  const handleClose = () => {
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) return;
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(fields);
      setDirty(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
        <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-900">
          ← Templates
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <h1 className="truncate font-semibold text-gray-900">{templateName}</h1>
        <div className="ml-auto flex items-center gap-3">
          {saveError && <span className="max-w-xs truncate text-xs text-red-600" title={saveError}>{saveError}</span>}
          {!hasSignature && <span className="text-xs text-amber-700">Add a Signature box to save</span>}
          {dirty && hasSignature && !saveError && <span className="text-xs text-gray-400">Unsaved changes</span>}
          <button
            onClick={handleSave}
            disabled={saving || !hasSignature}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Document */}
        <main
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          onPointerDown={() => setSelectedId(null)}
        >
          <div className="flex flex-col items-center gap-6 py-8">
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={<p className="mt-20 text-sm text-gray-500">Loading document…</p>}
              error={<p className="mt-20 text-sm text-red-600">Could not load the PDF. Close and try again.</p>}
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} className="mb-6">
                  <p className="mb-1 text-xs text-gray-400">Page {pageNum} of {numPages}</p>
                  <div
                    className={`relative bg-white shadow-md ring-2 transition ${
                      dropTarget === pageNum ? "ring-blue-400" : "ring-transparent"
                    }`}
                  >
                    <Page pageNumber={pageNum} width={PAGE_WIDTH} renderAnnotationLayer={false} renderTextLayer={false} />

                    {/* Drop zone + placed fields */}
                    <div
                      ref={(el) => { pageRefs.current[pageNum] = el; }}
                      className="absolute inset-0"
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(DRAG_MIME)) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                          setDropTarget(pageNum);
                        }
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => onPageDrop(e, pageNum)}
                    >
                      {fields.filter((f) => f.page === pageNum).map((f) => {
                        const isSel = f.id === selectedId;
                        const isData = !!f.dataKey;
                        return (
                          <div
                            key={f.id}
                            onPointerDown={(e) => startDrag(e, f, "move")}
                            onPointerMove={onDragMove}
                            onPointerUp={endDrag}
                            className={`group absolute flex cursor-move select-none items-center overflow-hidden rounded-sm border px-1.5 text-[11px] font-medium leading-tight ${
                              isData
                                ? "border-amber-500 bg-amber-300/30 text-amber-900"
                                : "border-blue-500 bg-blue-400/20 text-blue-900"
                            } ${isSel ? "z-10 border-2 shadow-lg" : "hover:shadow"}`}
                            style={{
                              left: `${f.positionX}%`,
                              top: `${f.positionY}%`,
                              width: `${f.width}%`,
                              height: `${f.height}%`,
                            }}
                            title={isData ? `${displayLabel(f)} — filled in from the contract` : `${displayLabel(f)} — tenant fills in`}
                          >
                            <span className="truncate">{displayLabel(f)}</span>

                            {isSel && (
                              <>
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => remove(f.id)}
                                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-[10px] leading-none text-white hover:bg-red-600"
                                  aria-label="Remove field"
                                >
                                  ×
                                </button>
                                <div
                                  onPointerDown={(e) => startDrag(e, f, "resize")}
                                  onPointerMove={onDragMove}
                                  onPointerUp={endDrag}
                                  className={`absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border-2 bg-white ${
                                    isData ? "border-amber-500" : "border-blue-500"
                                  }`}
                                  aria-label="Resize field"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </Document>
          </div>
        </main>

        {/* Right-hand panel */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900">Fields</h2>
            <p className="mt-1 text-xs text-gray-500">Drag a field onto the document, or click it to add.</p>
          </div>

          <PaletteSection
            title="Tenant fills in"
            hint="The tenant completes these when signing."
            items={TENANT_FIELDS}
            dotClass="bg-blue-500"
            chipClass="border-blue-200 hover:border-blue-400 hover:bg-blue-50"
            onAdd={addToVisiblePage}
          />
          <PaletteSection
            title="Filled from contract"
            hint="Printed automatically from the details staff enter. The tenant can't change them."
            items={DATA_FIELDS}
            dotClass="bg-amber-500"
            chipClass="border-amber-200 hover:border-amber-400 hover:bg-amber-50"
            onAdd={addToVisiblePage}
          />

          {/* Selected field */}
          <div className="mt-auto border-t border-gray-100 p-4">
            {selected ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">Selected</p>
                  <p className="text-sm font-medium text-gray-900">{displayLabel(selected)}</p>
                  <p className="text-xs text-gray-500">
                    Page {selected.page} · {selected.dataKey ? "Filled from contract" : "Tenant fills in"}
                  </p>
                </div>
                {selected.type === "TEXT" && !selected.dataKey && (
                  <label className="block">
                    <span className="text-xs text-gray-600">Label shown to tenant</span>
                    <input
                      value={selected.label ?? ""}
                      onChange={(e) => update(selected.id, { label: e.target.value })}
                      placeholder="e.g. Emergency contact"
                      maxLength={100}
                      className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                )}
                <button
                  onClick={() => remove(selected.id)}
                  className="w-full rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Remove field
                </button>
              </div>
            ) : (
              <div className="space-y-1 text-xs text-gray-500">
                <p><b className="font-medium text-gray-700">{fields.length}</b> field{fields.length !== 1 ? "s" : ""} on this template</p>
                <p>Drag a field to move it. Pull its corner to resize.</p>
                <p>Press Delete to remove the selected field. Arrow keys nudge it.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PaletteSection({
  title, hint, items, dotClass, chipClass, onAdd,
}: {
  title: string;
  hint: string;
  items: PaletteItem[];
  dotClass: string;
  chipClass: string;
  onAdd: (item: PaletteItem) => void;
}) {
  return (
    <section className="border-b border-gray-100 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
      </div>
      <p className="mb-3 mt-1 text-xs text-gray-400">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, item.key);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(item)}
            className={`cursor-grab rounded-md border bg-white px-2 py-2 text-left text-xs font-medium text-gray-700 active:cursor-grabbing ${chipClass}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
