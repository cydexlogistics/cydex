import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/address';
import { verificationDocUrl } from '@/lib/verification';

// pdf.js is large: only load it when someone opens a PDF
const PdfPages = lazy(() => import('@/components/verification/PdfPages'));

type ViewDoc = (path: string, title?: string) => void;
const DocumentViewerContext = createContext<ViewDoc | null>(null);

const ZOOMS = [1, 1.5, 2, 3];
const isPdf = (path: string) => path.toLowerCase().endsWith('.pdf');

// Shows a verification document in a popup instead of a new tab, so it works
// inside the installed app:  const viewDoc = useDocumentViewer(); viewDoc(path, 'ID document')
export const DocumentViewerProvider = ({ children }: { children: ReactNode }) => {
  const [doc, setDoc] = useState<{ path: string; title: string } | null>(null);
  const [urls, setUrls] = useState<{ view: string; download: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  const view = useCallback<ViewDoc>((path, title = 'Document') => setDoc({ path, title }), []);

  useEffect(() => {
    setUrls(null);
    setError(null);
    setZoom(0);
    if (!doc) return;
    let live = true;
    Promise.all([verificationDocUrl(doc.path), verificationDocUrl(doc.path, true)])
      .then(([v, d]) => live && setUrls({ view: v, download: d }))
      .catch((e) => live && setError(errorMessage(e, 'Could not open the document')));
    return () => { live = false; };
  }, [doc]);

  const scale = ZOOMS[zoom];

  return (
    <DocumentViewerContext.Provider value={view}>
      {children}
      <Dialog open={!!doc} onOpenChange={(open) => !open && setDoc(null)}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-h-[90vh] sm:max-w-3xl">
          <DialogHeader className="border-b px-4 py-3 pr-12 text-left">
            <DialogTitle className="capitalize">{doc?.title}</DialogTitle>
            <DialogDescription className="sr-only">Preview of the uploaded document</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
            {error ? (
              <p className="py-10 text-center text-sm text-destructive">{error}</p>
            ) : !urls || !doc ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : isPdf(doc.path) ? (
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <PdfPages url={urls.view} zoom={scale} />
              </Suspense>
            ) : (
              <img
                src={urls.view}
                alt={doc.title}
                style={{ width: `${scale * 100}%` }}
                className="mx-auto block max-w-none rounded bg-white object-contain"
                onError={() => setError('This image couldn’t be displayed. Use Download to view it.')}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm tabular-nums text-muted-foreground">{scale * 100}%</span>
              <Button variant="outline" size="icon" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" asChild disabled={!urls}>
              <a href={urls?.download} target="_blank" rel="noopener noreferrer" aria-disabled={!urls}>
                <Download className="mr-2 h-4 w-4" /> Download
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DocumentViewerContext.Provider>
  );
};

export const useDocumentViewer = () => {
  const view = useContext(DocumentViewerContext);
  if (!view) throw new Error('useDocumentViewer must be used inside DocumentViewerProvider');
  return view;
};
