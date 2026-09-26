import { useEffect, useState } from 'react';
import api from '../services/api';

let cache = { riders: null, bikes: null, at: 0 };

/** Riders & bikes for filter dropdowns (admin). Cached for 60s. */
export function useLookups({ riders = true, bikes = true } = {}) {
  const [state, setState] = useState({ riders: cache.riders || [], bikes: cache.bikes || [] });
  useEffect(() => {
    let alive = true;
    const fresh = Date.now() - cache.at < 60000;
    if (fresh && (!riders || cache.riders) && (!bikes || cache.bikes)) return undefined;
    Promise.all([
      riders ? api.get('/riders').then((r) => r.data.items).catch(() => cache.riders || []) : Promise.resolve(cache.riders || []),
      bikes ? api.get('/bikes').then((r) => r.data.items).catch(() => cache.bikes || []) : Promise.resolve(cache.bikes || []),
    ]).then(([r, b]) => {
      cache = { riders: r, bikes: b, at: Date.now() };
      if (alive) setState({ riders: r, bikes: b });
    });
    return () => { alive = false; };
  }, [riders, bikes]);
  return state;
}

export function invalidateLookups() { cache = { riders: null, bikes: null, at: 0 }; }
