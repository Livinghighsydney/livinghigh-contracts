import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { PenLine, AlertCircle } from "lucide-react";
import { choiceFontSize, fieldValue, ptToCss } from "@/lib/contracts";
import { boxText } from "./field-settings";
import type { Contract, Template } from "@/api/types";
const PdfViewer = lazy(() => import("./pdf-viewer"));
export { PdfViewer };
export function PdfPreview({
  template,
  contract,
}: {
  template: Template;
  contract?: Partial<Contract>;
}) {
  return (
    <div className="pdf-wrap">
      <div className="flex justify-center gap-5 text-[10px] mb-5">
        <span className="text-primary">● Filled from contract</span>
        <span className="text-tenant">● Tenant fills in</span>
      </div>
      <ClientOnly fallback={<p className="empty-state">Opening agreement…</p>}>
        <Suspense fallback={<p className="empty-state">Opening agreement…</p>}>
          <PdfViewer
            {...(template.pdfUrl ? { url: template.pdfUrl } : {})}
            overlay={(page) =>
              template.fields
                .filter((f) => f.page === page)
                .map((f) => {
                  const value = f.dataKey ? fieldValue(f, contract) : boxText(f, contract?.custom_values ?? (f.staffFill ? {} : undefined));
                  return (
                    <div
                      key={f.id}
                      className={`pdf-box ${f.dataKey || f.staffFill ? "" : "tenant-box"} ${f.tickOnly ? (f.showText ? "tick-only with-text" : "tick-only") : ""} ${(f.dataKey || (f.staffFill && f.type !== "CHECKBOX")) && !value ? "blank-box" : ""}`}
                      style={{
                        left: `${f.positionX}%`,
                        top: `${f.positionY}%`,
                        width: `${f.width}%`,
                        height: `${f.height}%`,
                        ...(choiceFontSize(f) ? { fontSize: ptToCss(choiceFontSize(f)!) } : {}),
                      }}
                    >
                      {!f.dataKey && !f.staffFill && !f.tickOnly && <PenLine size={10} />}{" "}
                      {f.tickOnly ? value : value || (
                        <>
                          <AlertCircle size={10} />
                          Missing {f.label.toLowerCase()}
                        </>
                      )}
                    </div>
                  );
                })
            }
          />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
