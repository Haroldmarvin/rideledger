import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * GET data from the API with loading / error / reload handling.
 * Re-fetches whenever `url` or the serialized `params` change. Pass url = null to skip.
 */
export function useApi(url, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const reqId = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!url) { setLoading(false); return; }
    const id = ++reqId.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      if (id === reqId.current) setData(res.data);
    } catch (e) {
      if (id === reqId.current) setError(e);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => { load(); }, [load]);

  return { data, setData, loading, error, reload: load };
}
