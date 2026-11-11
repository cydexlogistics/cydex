import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
// Legacy build: includes polyfills for older phone browsers
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Draws every page of a PDF onto canvases. Phone browsers (and installed apps)
// can't reliably show a PDF inside the page, so we render it ourselves.
const PdfPages = ({ url, zoom }: { url: string; zoom: number }) => {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Uploaded files are untrusted: never let pdf.js evaluate code from them
    const task = pdfjs.getDocument({ url, isEvalSupported: false });
    task.promise.then(setDoc, () => setError(true));
    return () => { task.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="w-full">
      {error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">This PDF couldn’t be displayed. Use Download to view it.</p>
      ) : !doc || !width ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} pageNumber={i + 1} width={width * zoom} />
          ))}
        </div>
      )}
    </div>
  );
};

const PdfPage = ({ doc, pageNumber, width }: { doc: pdfjs.PDFDocumentProxy; pageNumber: number; width: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let task: pdfjs.RenderTask | undefined;
    let cancelled = false;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      c.style.width = `${width}px`;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport });
      task.promise.catch(() => {});
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, pageNumber, width]);

  return <canvas ref={canvas} className="mx-auto block max-w-none rounded border bg-white shadow-sm" />;
};

export default PdfPages;
