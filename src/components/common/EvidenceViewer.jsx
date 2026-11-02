import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, RefreshCw, X } from 'lucide-react';

// One place to look at an attachment, without leaving the page.
//
// WHY A BLOB AND NOT A SIGNED URL
//   The obvious build is an <iframe src={signedUrl}>. It works, and it puts a
//   300-second public link to a student's work into the DOM, into the browser's
//   network log, and -- the moment anyone uses the frame's own context menu --
//   into a shareable address. Anyone holding that string can open the file
//   without being logged in at all.
//
//   Fetching the bytes through the authenticated session instead means no such
//   link is ever minted. The blob: URL that replaces it is scoped to this
//   document and dies with it, and we revoke it explicitly on close rather than
//   waiting for the tab to be closed.
//
// WHY NOT A NEW TAB
//   Reviewing means holding the submitted work and the task description in mind
//   at the same time. A new tab is the one arrangement that guarantees you
//   cannot see both. EvidenceGallery already made this argument for inline
//   images; this extends it to PDFs, which it had to link out for.
//
// PDFs
//   Rendered by the browser's own viewer in an iframe. That is unavailable in
//   some mobile webviews, so Download is always offered rather than kept for
//   the failure case -- a reviewer who cannot see the file still needs it.

export default function EvidenceViewer({ source, onClose }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef(null);

  const name = source?.name || 'attachment';
  const isImage = Boolean(source?.contentType?.startsWith('image/'));

  useEffect(() => {
    if (!source) return undefined;
    let revoked = '';
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      setUrl('');
      try {
        const blob = await source.load();
        if (!blob) throw new Error('That file came back empty.');
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      } catch (err) {
        if (!cancelled) setError(err.message || 'That file could not be opened.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Revoking is not housekeeping here: an un-revoked object URL keeps the
    // whole file in memory and stays readable for the life of the document.
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [source, attempt]);

  useEffect(() => { if (source) closeRef.current?.focus(); }, [source]);

  const keys = useCallback((event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }, [onClose]);

  if (!source) return null;

  return (
    <div className="fixed inset-0 z-50 bg-sage-950/60 p-4 flex items-center justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-viewer-title"
        onKeyDown={keys}
        className="rounded-xl bg-sage-50 border border-sage-200 p-5 w-full max-w-3xl max-h-full overflow-y-auto space-y-4 text-sage-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="evidence-viewer-title" className="font-display font-semibold">Submitted work</h2>
            <p className="text-xs truncate">{name}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close attachment"
            onClick={onClose}
            className="rounded-lg border border-sage-200 bg-sage-50 px-2 py-1 hover:bg-sage-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-sage-100 p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the file…
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-sage-400 p-3 text-sm space-y-2">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt(n => n + 1)}
              className="inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <RefreshCw className="h-3 w-3" /> Try again
            </button>
          </div>
        )}

        {url && isImage && (
          <img
            src={url}
            alt={`Work submitted for this task: ${name}`}
            className="max-h-[70vh] w-auto mx-auto rounded-lg border border-sage-200 object-contain"
          />
        )}

        {url && !isImage && (
          <>
            <iframe
              src={url}
              title={`Submitted work: ${name}`}
              className="w-full h-[70vh] rounded-lg border border-sage-200 bg-sage-100"
            />
            <p className="flex items-center gap-1 text-xs">
              <FileText className="h-3 w-3" />
              If the document does not appear, your browser cannot display PDFs in place — download it instead.
            </p>
          </>
        )}

        {url && (
          <a
            href={url}
            download={name}
            className="inline-flex items-center gap-1 rounded-lg border border-sage-200 bg-sage-50 px-3 py-1.5 text-sm font-semibold hover:bg-sage-100"
          >
            <Download className="h-4 w-4" /> Download
          </a>
        )}
      </div>
    </div>
  );
}
