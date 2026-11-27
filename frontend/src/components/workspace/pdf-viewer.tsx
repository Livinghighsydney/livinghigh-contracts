import { useEffect, useState, useRef, useMemo, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { makeAgreement } from "@/lib/pdf";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
export default function PdfViewer({
  url,
  overlay,
  onPageVisible,
}: {
  url?: string;
  overlay?: (page: number) => ReactNode;
  onPageVisible?: (page: number) => void;
}) {
  const [sample, setSample] = useState<Uint8Array>();
  const [pages, setPages] = useState(2);
  const [width, setWidth] = useState(540);
  const [error, setError] = useState(false);
  const [useSample, setUseSample] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!url || useSample)
      void makeAgreement()
        .then((bytes) => setSample(new Uint8Array(bytes)))
        .catch(() => setError(true));
  }, [url, useSample]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const resize = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.min(entry.contentRect.width, 650));
    });
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const el = container.current;
    if (!el || !onPageVisible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            onPageVisible(Number((entry.target as HTMLElement).dataset["page"]));
      },
      { threshold: 0.3 },
    );
    el.querySelectorAll(".pdf-page").forEach((p) => obs.observe(p));
    return () => obs.disconnect();
  }, [pages, sample, url, onPageVisible]);
  // Template PDFs come from our API, which needs the session cookie.
  const file = useMemo(
    () => (!useSample && url ? { url, withCredentials: true } : sample ? { data: sample } : undefined),
    [url, sample, useSample],
  );
  return (
    <div ref={container}>
      {error ? (
        <div className="empty-state">
          <p>The PDF couldn’t be opened.</p>
          <Button
            variant="outline"
            onClick={() => {
              setError(false);
              setUseSample(true);
              void makeAgreement().then((bytes) => setSample(new Uint8Array(bytes))).catch(() => setError(true));
            }}
          >
            Try sample agreement
          </Button>
        </div>
      ) : file ? (
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          onLoadError={() => setError(true)}
          loading={
            <div className="empty-state">
              <LoaderCircle className="animate-spin" />
              Opening agreement…
            </div>
          }
        >
          {Array.from({ length: pages }, (_, i) => (
            <div key={i}>
              <p className="pdf-label">
                Page {i + 1} of {pages}
              </p>
              <div className="pdf-page" data-page={i + 1} style={{ width }}>
                <Page
                  pageNumber={i + 1}
                  width={width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                {overlay?.(i + 1)}
              </div>
            </div>
          ))}
        </Document>
      ) : (
        <div className="empty-state">
          <LoaderCircle className="animate-spin" />
          Opening agreement…
        </div>
      )}
    </div>
  );
}
