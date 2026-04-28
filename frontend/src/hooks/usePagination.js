import { useCallback, useEffect, useState } from 'react';

export function usePagination(loader, initialParams = {}) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [params, setParams] = useState(initialParams);
  const [totalCount, setTotalCount] = useState(0);

  const loadPage = useCallback(async (nextParams = params, nextCursor = null, reset = false) => {
    setLoading(true);
    setError('');
    try {
      const result = await loader({ ...nextParams, cursor: nextCursor });
      const nextItems = result.items || result.feeds || result.albums || [];
      setItems((current) => (reset ? nextItems : [...current, ...nextItems]));
      setCursor(result.cursor || null);
      setHasMore(Boolean(result.hasMore ?? result.cursor));
      if (result.totalCount !== undefined) setTotalCount(result.totalCount);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [loader, params]);

  useEffect(() => {
    loadPage(params, null, true);
  }, [params, loadPage]);

  return {
    items,
    cursor,
    hasMore,
    loading,
    error,
    totalCount,
    refresh: () => loadPage(params, null, true),
    loadMore: () => loadPage(params, cursor, false),
    setParams
  };
}
