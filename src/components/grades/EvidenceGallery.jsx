import { useState, useEffect, useCallback } from 'react';
import { Paperclip, FileText, Loader2, RefreshCw, ImageOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { downloadEvidence, getEvidenceUrls, isImageEvidence } from '../../lib/gradeChangeRequestService';
import { evidenceFileName } from '../../lib/gradeChangeRules';
import EvidenceViewer from '../common/EvidenceViewer';

// The attachments on a grade change request, shown where the request is read.
//
// IMAGES RENDER INLINE on purpose. Reviewing a dispute means holding the
// student's account and the photograph of the paper in mind at the same time;
// a "View attachment" link that opens a new tab breaks exactly that comparison.
// PDFs still link out, because they cannot be shown reliably in place.
//
// Links are signed and short-lived, so they are fetched when the request is
// displayed rather than stored. A failure is offered a retry instead of being
// swallowed: evidence is required on every dispute, so a reviewer who cannot
// see it cannot do their job, and silence would leave them guessing.
//
// Opening a file full size goes to EvidenceViewer rather than to a new tab.
// The thumbnails keep their signed URLs -- <img src> needs one and a thumbnail
// navigates nowhere -- but nothing hands a reviewer a link they could paste
// somewhere it would still work.

export default function EvidenceGallery({ request, className }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(null);

  const openItem = useCallback((item) => setViewing({
    name: evidenceFileName(item.objectKey),
    contentType: item.contentType,
    load: () => downloadEvidence({
      objectKey: item.objectKey,
      storage: item.storage,
      requestId: request?.requestId
    })
  }), [request?.requestId]);

  const count = request?.evidence?.length || 0;

  const load = useCallback(async () => {
    if (!count) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const signed = await getEvidenceUrls(request);
      setItems(signed);
      setFailed(signed.some((i) => !i.url));
    } catch {
      setItems([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
    // request identity is what matters; a new object with the same id and the
    // same attachments does not need another round of signing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.requestId, count]);

  useEffect(() => { load(); }, [load]);

  if (!count) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="text-micro font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        {count === 1 ? 'Attachment' : `${count} attachments`}
      </span>

      {loading ? (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Opening…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const image = isImageEvidence(item.contentType);
              if (!item.url) {
                return (
                  <div
                    key={item.id}
                    className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-1"
                  >
                    <ImageOff className="h-4 w-4" />
                    <span className="text-[10px]">Unavailable</span>
                  </div>
                );
              }
              if (!image) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className="w-24 h-24 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-600 transition-colors cursor-pointer"
                  >
                    <FileText className="h-5 w-5 text-slate-400" />
                    <span className="text-[10px] font-semibold">Open PDF</span>
                  </button>
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  title="Open full size"
                  className="block w-24 h-24 rounded-xl border border-slate-200 overflow-hidden hover:border-sage-400 transition-colors cursor-pointer"
                >
                  <img
                    src={item.url}
                    alt="Evidence submitted with this request"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>

          {failed && (
            <button
              onClick={load}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Some attachments did not open — try again
            </button>
          )}
        </>
      )}

      <EvidenceViewer source={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
