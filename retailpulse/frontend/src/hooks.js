import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api.js';

/** useApi('/api/x', {params}, [deps]) -> { data, loading, error, reload } */
export function useApi(url, params, deps = []) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify([url, params, ...deps]); const seq = useRef(0);
  const run = useCallback(async () => {
    if (!url) return; const my = ++seq.current; setS((p) => ({ ...p, loading: true, error: null }));
    try { const data = await api.get(url, params); if (my === seq.current) setS({ data, loading: false, error: null }); }
    catch (e) { if (my === seq.current) setS({ data: null, loading: false, error: e }); }
  }, [key]); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run };
}
