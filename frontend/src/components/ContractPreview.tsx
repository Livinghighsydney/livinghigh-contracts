import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { TemplateField } from "../api/templates";
import { dataValue, type ContractDetailsForm } from "../utils/format";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const TENANT_LABELS: Partial<Record<TemplateField["type"], string>> = {
  SIGNATURE: "Tenant signs here",
  INITIALS: "Initials",
  DATE: "Date signed",
  NAME: "Tenant name",
  EMAIL: "Tenant email",
  TEXT: "Tenant fills in",
};

interface Props {
  pdfUrl: string;
  fields: TemplateField[];
  details: ContractDetailsForm;
  width: number;
}

/** Read-only view of the agreement as the tenant will receive it. */
export function ContractPreview({ pdfUrl, fields, details, width }: Props) {
  const [numPages, setNumPages] = useState(0);
  // Scale text with the page so the preview looks like the real PDF.
  const fontPx = Math.max(8, Math.round(width / 62));

  return (
    <Document
      file={pdfUrl}
      onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      loading={<p className="py-20 text-center text-sm text-gray-500">Loading preview…</p>}
      error={<p className="py-20 text-center text-sm text-red-600">Could not load the preview.</p>}
    >
      <div className="flex flex-col items-center gap-6">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div key={pageNum}>
            <p className="mb-1 text-xs text-gray-400">Page {pageNum} of {numPages}</p>
            <div className="relative bg-white shadow-md">
              <Page pageNumber={pageNum} width={width} renderAnnotationLayer={false} renderTextLayer={false} />
              {fields.filter((f) => f.page === pageNum).map((f) => {
                const box = {
                  left: `${f.positionX}%`,
                  top: `${f.positionY}%`,
                  width: `${f.width}%`,
                  height: `${f.height}%`,
                };
                if (f.dataKey) {
                  const value = dataValue(f.dataKey, details);
                  return (
                    <div
                      key={f.id}
                      style={{ ...box, fontSize: fontPx }}
                      className={`absolute flex items-center overflow-hidden px-0.5 leading-tight ${
                        value ? "bg-amber-200/40 text-gray-900" : "border border-dashed border-red-400 bg-red-50/70 text-red-600"
                      }`}
                      title={value ? undefined : "No value entered — this box will be blank"}
                    >
                      <span className="truncate">{value || "(blank)"}</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={f.id}
                    style={{ ...box, fontSize: Math.max(8, fontPx - 2) }}
                    className="absolute flex items-center overflow-hidden rounded-sm border border-blue-400 bg-blue-100/60 px-1 font-medium text-blue-800"
                  >
                    <span className="truncate">{f.label || TENANT_LABELS[f.type]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Document>
  );
}
