import { useEffect, useRef } from 'react';
import { getThumbnailStatus } from '../api';

const POLL_INTERVAL_MS = 2000;

/**
 * Polls thumbnail job status for any staged items with thumbPending === true.
 * When a thumbnail is ready, calls onThumbReady(uniquePhotoId, thumbUrl).
 *
 * @param {Array} items - Array of staged photo objects with { id (uniquePhotoId), thumbPending }
 * @param {Function} onThumbReady - Called with (uniquePhotoId, thumbUrl) when done
 */
export function useThumbnailPoller(items, onThumbReady) {
  // Keep a ref to track which IDs are already resolved so we don't double-call
  const resolvedIds = useRef(new Set());

  useEffect(() => {
    const pending = items.filter(
      (item) => item.thumbPending && !resolvedIds.current.has(item.id)
    );

    if (pending.length === 0) return;

    const intervalId = setInterval(async () => {
      for (const item of pending) {
        if (resolvedIds.current.has(item.id)) continue;

        try {
          const { status, thumbUrl } = await getThumbnailStatus(item.id);

          if (status === 'done' && thumbUrl) {
            resolvedIds.current.add(item.id);
            onThumbReady(item.id, thumbUrl);
          }
          // 'queued', 'processing', 'failed' — keep polling
        } catch (err) {
          // Network error — keep polling silently
          console.warn(`Thumb status poll error for ${item.id}:`, err.message);
        }
      }

      // If all pending are resolved, we can clear — React will re-run
      // this effect when items change (thumbPending flips to false)
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [items, onThumbReady]);
}
