import { useEffect, useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { PRESETS, presetRange } from '../utils/format';
import { PAYMENT_METHODS, DELIVERY_STATUSES } from '../utils/constants';
import { useConfig } from '../context/ConfigContext';
import { useDebounce } from '../hooks/useDebounce';

/**
 * Reusable filter bar. value = { preset, from, to, rider, bike, status, paymentMethod, search }.
 * `show` picks which controls to render.
 */
export default function FilterBar({ value, onChange, riders = [], bikes = [], show = {}, searchPlaceholder = 'Search ID, customer, phone, order ref…' }) {
  const { today } = useConfig();
  const [search, setSearch] = useState(value.search || '');
  const debounced = useDebounce(search, 350);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if ((value.search || '') !== debounced) onChange({ ...value, search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const set = (patch) => onChange({ ...value, ...patch });
  const setPreset = (preset) => {
    if (preset === 'custom') return set({ preset });
    if (preset === 'all') return set({ preset, from: '', to: '' });
    return set({ preset, ...presetRange(preset, today) });
  };
  const activeCount = ['rider', 'bike', 'status', 'paymentMethod'].filter((k) => value[k]).length;

  return (
    <div className="card rl-filterbar mb-3">
      <div className="card-body p-2 p-md-3">
        <div className="row g-2 align-items-end">
          {show.search !== false && (
            <div className="col-12 col-lg-4">
              <div className="position-relative">
                <Search size={16} className="rl-input-icon" />
                <input type="search" className="form-control ps-5" placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
                {search && <button type="button" className="btn btn-link rl-input-clear" onClick={() => setSearch('')} aria-label="Clear search"><X size={16} /></button>}
              </div>
            </div>
          )}
          {show.dates !== false && (
            <div className="col-6 col-lg-2">
              <select className="form-select" value={value.preset || 'today'} onChange={(e) => setPreset(e.target.value)} aria-label="Date range">
                {show.allDates && <option value="all">All dates</option>}
                {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div className="col-6 d-lg-none">
            <button type="button" className="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2" onClick={() => setOpen((o) => !o)}>
              <SlidersHorizontal size={16} /> Filters{activeCount ? ` (${activeCount})` : ''}
            </button>
          </div>
          {show.dates !== false && value.preset === 'custom' && (
            <>
              <div className="col-6 col-lg-2"><input type="date" className="form-control" value={value.from || ''} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="From date" /></div>
              <div className="col-6 col-lg-2"><input type="date" className="form-control" value={value.to || ''} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To date" /></div>
            </>
          )}
        </div>
        <div className={`row g-2 mt-0 ${open ? '' : 'd-none d-lg-flex'}`}>
          {show.rider && (
            <div className="col-6 col-lg-3 mt-2">
              <select className="form-select" value={value.rider || ''} onChange={(e) => set({ rider: e.target.value })} aria-label="Rider">
                <option value="">All riders</option>
                {riders.map((r) => <option key={r._id} value={r._id}>{r.name}{r.status !== 'active' ? ' (inactive)' : ''}</option>)}
              </select>
            </div>
          )}
          {show.bike && (
            <div className="col-6 col-lg-2 mt-2">
              <select className="form-select" value={value.bike || ''} onChange={(e) => set({ bike: e.target.value })} aria-label="Bike">
                <option value="">All bikes</option>
                {bikes.map((b) => <option key={b._id} value={b._id}>{b.bikeId}</option>)}
              </select>
            </div>
          )}
          {show.status !== false && (
            <div className="col-6 col-lg-2 mt-2">
              <select className="form-select" value={value.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
                <option value="">All statuses</option>
                {(show.statusOptions || DELIVERY_STATUSES).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {show.payment !== false && (
            <div className="col-6 col-lg-2 mt-2">
              <select className="form-select" value={value.paymentMethod || ''} onChange={(e) => set({ paymentMethod: e.target.value })} aria-label="Payment method">
                <option value="">All payments</option>
                {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {activeCount > 0 && (
            <div className="col-12 col-lg-auto mt-2">
              <button type="button" className="btn btn-link text-secondary px-0" onClick={() => set({ rider: '', bike: '', status: '', paymentMethod: '' })}>Clear filters</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Convert FilterBar value to API params (drops empty values). */
export function toParams(v) {
  const p = {};
  for (const k of ['from', 'to', 'rider', 'bike', 'status', 'paymentMethod', 'search']) if (v[k]) p[k] = v[k];
  return p;
}
