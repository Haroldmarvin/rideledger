import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle2, CloudOff, CalendarClock, User, StickyNote, AlertTriangle, Info } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { offlineQueue, newClientRef, drafts } from '../../services/offlineQueue';
import FormField from '../../components/FormField';
import MoneyInput from '../../components/MoneyInput';
import LoadingButton from '../../components/LoadingButton';
import ErrorAlert from '../../components/ErrorAlert';
import Money from '../../components/Money';
import { CardSkeleton } from '../../components/Skeleton';
import { toCents, centsToInput } from '../../utils/money';
import { PAYMENT_METHODS, DELIVERY_STATUSES } from '../../utils/constants';

const PHONE_RE = /^\+?\d{7,15}$/;
const RECENT_KEY = 'rl_recent_places';

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || { pickups: [], destinations: [] }; } catch { return { pickups: [], destinations: [] }; }
}
function rememberPlaces(pickup, destination) {
  const r = loadRecent();
  const push = (arr, v) => [v, ...arr.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8);
  if (pickup) r.pickups = push(r.pickups, pickup);
  if (destination) r.destinations = push(r.destinations, destination);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

function emptyForm(defaultFee, lastPickup, bike) {
  return {
    customerName: '', customerPhone: '', pickupLocation: lastPickup || '', destination: '', orderReference: '',
    deliveryFee: Number.isInteger(defaultFee) ? centsToInput(defaultFee) : '', amountCollected: Number.isInteger(defaultFee) ? centsToInput(defaultFee) : '',
    paymentMethod: 'Cash', status: 'Delivered', remarks: '', bike: bike || '', rider: '', reason: '',
  };
}

/** Client-side validation for instant feedback. The server re-validates and recalculates everything. */
function validate(f, { needRider }) {
  const e = {};
  if (needRider && !f.rider) e.rider = 'Please choose the rider.';
  if (f.customerName.trim().length < 2) e.customerName = 'Please enter the customer name.';
  const phone = f.customerPhone.replace(/[\s\-().]/g, '');
  if (!phone) e.customerPhone = 'Please enter the customer phone number.';
  else if (!PHONE_RE.test(phone)) e.customerPhone = 'Phone number looks wrong. Use digits only, e.g. 0777123456.';
  if (!f.pickupLocation.trim()) e.pickupLocation = 'Please enter the pickup location.';
  if (!f.destination.trim()) e.destination = 'Please enter the destination.';
  if (!f.paymentMethod) e.paymentMethod = 'Please choose how the customer paid.';
  if (!f.status) e.status = 'Please choose the delivery status.';
  const fee = toCents(f.deliveryFee);
  const col = f.amountCollected === '' ? 0 : toCents(f.amountCollected);
  if (f.deliveryFee === '' || Number.isNaN(fee)) e.deliveryFee = 'Please enter the delivery fee.';
  if (Number.isNaN(col)) e.amountCollected = 'Please enter a valid amount.';
  if (!e.deliveryFee && !e.amountCollected) {
    if (f.paymentMethod === 'Credit/Unpaid' && col > 0) e.amountCollected = 'Payment is Credit/Unpaid, so amount collected should be 0.';
  }
  return e;
}

export default function DeliveryForm({ mode = 'create' }) {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const { currentFee, settings, today, money, reload: reloadConfig } = useConfig();
  const toast = useToast();
  const navigate = useNavigate();
  const base = isAdmin ? '/admin/deliveries' : '/rider/deliveries';
  const isEdit = mode === 'edit';

  const assignedBike = user?.riderProfile?.bike?._id || '';
  const recent = useMemo(loadRecent, []);
  const [form, setForm] = useState(() => emptyForm(currentFee, recent.pickups[0], assignedBike));
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [saved, setSaved] = useState(null); // last saved delivery (for "continue working")
  const [draftRestored, setDraftRestored] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [now, setNow] = useState(new Date());
  const firstInput = useRef(null);

  const { bikes, riders } = useLookups({ riders: isAdmin, bikes: true });
  const existing = useApi(isEdit ? `/deliveries/${id}` : null);
  const lock = existing.data?.lock;
  const perms = existing.data?.permissions;

  useEffect(() => { reloadConfig(); }, [reloadConfig]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  // Restore a draft (create mode, riders)
  useEffect(() => {
    if (isEdit || !user) return;
    const d = drafts.load(user._id);
    if (d && (d.customerName || d.customerPhone || d.destination)) {
      setForm((f) => ({ ...f, ...d }));
      setDraftRestored(true);
    }
  }, [isEdit, user]);

  // Prefill default fee once config arrives
  useEffect(() => {
    if (isEdit || !Number.isInteger(currentFee)) return;
    setForm((f) => (f.deliveryFee === '' ? { ...f, deliveryFee: centsToInput(currentFee), amountCollected: f.amountCollected === '' ? centsToInput(currentFee) : f.amountCollected } : f));
  }, [currentFee, isEdit]);

  // Load existing delivery for editing
  useEffect(() => {
    const d = existing.data?.delivery;
    if (!d) return;
    setForm({
      customerName: d.customerName, customerPhone: d.customerPhone, pickupLocation: d.pickupLocation, destination: d.destination,
      orderReference: d.orderReference || '', deliveryFee: centsToInput(d.deliveryFee), amountCollected: centsToInput(d.amountCollected),
      paymentMethod: d.paymentMethod, status: d.status, remarks: d.remarks || '', bike: d.bike?._id || '', rider: d.rider?._id || '',
      reason: '',
    });
    if (d.remarks) setShowNotes(true);
  }, [existing.data]);

  // Auto-save draft while typing (create mode)
  useEffect(() => {
    if (isEdit || !user) return undefined;
    const t = setTimeout(() => {
      const { reason, ...rest } = form;
      if (rest.customerName || rest.customerPhone || rest.destination) drafts.save(user._id, rest);
    }, 500);
    return () => clearTimeout(t);
  }, [form, isEdit, user]);

  const set = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (touched) setErrors(validate(next, { isAdmin, needRider: isAdmin && !isEdit }));
      return next;
    });
  };

  const setPayment = (pm) => set(pm === 'Credit/Unpaid' ? { paymentMethod: pm, amountCollected: '0.00' } : { paymentMethod: pm, amountCollected: form.paymentMethod === 'Credit/Unpaid' ? form.deliveryFee : form.amountCollected });
  const setStatus = (st) => {
    if ((st === 'Failed' || st === 'Cancelled') && form.status === 'Delivered') set({ status: st, amountCollected: '0.00' });
    else set({ status: st });
  };

  const feeCents = toCents(form.deliveryFee);
  const colCents = form.amountCollected === '' ? 0 : toCents(form.amountCollected);
  const amountsValid = !Number.isNaN(feeCents) && !Number.isNaN(colCents);
  // Same rules as the server: outstanding never goes below zero; anything paid above the fee is "extra" (e.g. order money)
  const outstanding = amountsValid ? Math.max(feeCents - colCents, 0) : null;
  const extra = amountsValid ? Math.max(colCents - feeCents, 0) : 0;
  const feeLocked = !isAdmin && settings?.allowRiderFeeOverride === false;
  const warnings = [];
  if (form.status === 'Delivered' && feeCents === 0 && colCents === 0) warnings.push('Delivered with a zero fee and nothing collected — please double-check.');
  if (Number.isInteger(currentFee) && !isEdit && feeCents !== currentFee && !Number.isNaN(feeCents)) warnings.push(`Fee differs from the standard fee (${money(currentFee)}). Management will see this.`);
  if (['Failed', 'Cancelled'].includes(form.status) && colCents > 0) warnings.push('Money collected on a delivery that was not completed.');

  const buildPayload = () => {
    const p = {
      customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim(), pickupLocation: form.pickupLocation.trim(),
      destination: form.destination.trim(), orderReference: form.orderReference.trim(), deliveryFee: feeCents, amountCollected: colCents,
      paymentMethod: form.paymentMethod, status: form.status, remarks: form.remarks.trim(), bike: form.bike || null,
    };
    if (isAdmin && !isEdit) p.rider = form.rider;
    if (isAdmin && form.reason.trim()) p.reason = form.reason.trim();
    return p;
  };

  const resetForNext = () => {
    setForm((f) => emptyForm(currentFee, f.pickupLocation, f.bike || assignedBike));
    setErrors({});
    setTouched(false);
    setDraftRestored(false);
    if (user) drafts.clear(user._id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => firstInput.current?.focus(), 250);
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    const errs = validate(form, { isAdmin, needRider: isAdmin && !isEdit });
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = document.querySelector('.is-invalid');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (isEdit && perms?.requiresReason && !form.reason.trim()) { setErrors({ reason: 'This day is closed. Please give a reason for the correction.' }); return; }

    const payload = buildPayload();
    setBusy(true);
    try {
      if (isEdit) {
        const res = await api.patch(`/deliveries/${id}`, payload);
        toast.success(res.data.unchanged ? 'No changes to save.' : `Delivery ${res.data.delivery.deliveryId} updated.`);
        navigate(`${base}/${id}`, { replace: true });
        return;
      }
      payload.clientRef = newClientRef();
      payload.recordedAt = new Date().toISOString();
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline && !isAdmin) {
        offlineQueue.add(user._id, payload);
        rememberPlaces(payload.pickupLocation, payload.destination);
        toast.warning('Saved Locally — Waiting for Connection. It will sync automatically.');
        setSaved({ local: true, customerName: payload.customerName });
        resetForNext();
        return;
      }
      try {
        const res = await api.post('/deliveries', payload);
        rememberPlaces(payload.pickupLocation, payload.destination);
        toast.success(`Saved ${res.data.delivery.deliveryId}`);
        setSaved(res.data.delivery);
        if (isAdmin) { navigate(`${base}/${res.data.delivery._id}`); return; }
        resetForNext();
      } catch (err) {
        if (err.isNetwork && !isAdmin) {
          offlineQueue.add(user._id, payload);
          rememberPlaces(payload.pickupLocation, payload.destination);
          toast.warning('No connection. Saved Locally — Waiting for Connection.');
          setSaved({ local: true, customerName: payload.customerName });
          resetForNext();
          return;
        }
        throw err;
      }
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setServerError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (isEdit && existing.loading) return <div className="container-narrow"><CardSkeleton rows={6} /></div>;
  if (isEdit && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />;
  if (isEdit && perms && !perms.canEdit) {
    return (
      <div className="container-narrow">
        <div className="alert alert-warning">{perms.reason}</div>
        <Link to={`${base}/${id}`} className="btn btn-primary">Back to delivery</Link>
      </div>
    );
  }

  const inv = (k) => (errors[k] ? 'is-invalid' : '');

  return (
    <form className="container-narrow rl-delivery-form" onSubmit={submit} noValidate>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-light rl-icon-btn" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="flex-grow-1">
          <h1 className="h5 fw-bold mb-0">{isEdit ? `Edit ${existing.data?.delivery?.deliveryId || 'delivery'}` : 'New Delivery'}</h1>
          {!isEdit && (
            <div className="small text-secondary d-flex flex-wrap gap-2">
              <span className="d-flex align-items-center gap-1"><CalendarClock size={13} /> {today} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              {!isAdmin && <span className="d-flex align-items-center gap-1"><User size={13} /> {user?.name}</span>}
              <span>ID assigned on save</span>
            </div>
          )}
        </div>
      </div>

      {saved && !isEdit && (
        <div className={`alert ${saved.local ? 'alert-warning' : 'alert-success'} d-flex align-items-center gap-2 py-2`}>
          {saved.local ? <CloudOff size={18} /> : <CheckCircle2 size={18} />}
          <div className="flex-grow-1 small">
            {saved.local ? <>Saved Locally — Waiting for Connection (<strong>{saved.customerName}</strong>)</> : <>Saved <strong className="font-monospace">{saved.deliveryId}</strong> · {saved.customerName}{saved.outstandingAmount > 0 && <> · owes <Money cents={saved.outstandingAmount} /></>}</>}
          </div>
          <Link to={isAdmin ? base : '/rider'} className="btn btn-sm btn-outline-secondary">Done</Link>
        </div>
      )}
      {draftRestored && !saved && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2 small">
          <Info size={16} /> <span className="flex-grow-1">Unsaved draft restored.</span>
          <button type="button" className="btn btn-sm btn-link p-0" onClick={resetForNext}>Discard</button>
        </div>
      )}
      {isEdit && lock?.locked && isAdmin && (
        <div className="alert alert-warning small d-flex gap-2"><AlertTriangle size={16} className="mt-1" /> This day is closed ({lock.closeoutStatus}). Your correction will be audited and the rider&apos;s closeout recalculated.</div>
      )}
      <ErrorAlert error={serverError} />

      <div className="card mb-3">
        <div className="card-body">
          {isAdmin && !isEdit && (
            <FormField label="Rider" required error={errors.rider} htmlFor="rider">
              <select id="rider" className={`form-select form-select-lg ${inv('rider')}`} value={form.rider} onChange={(e) => {
                const r = riders.find((x) => x._id === e.target.value);
                set({ rider: e.target.value, bike: r?.bike?._id || form.bike });
              }}>
                <option value="">Choose rider…</option>
                {riders.filter((r) => r.status === 'active').map((r) => <option key={r._id} value={r._id}>{r.name} ({r.riderId})</option>)}
              </select>
            </FormField>
          )}
          <FormField label="Customer name" required error={errors.customerName} htmlFor="customerName">
            <input id="customerName" ref={firstInput} className={`form-control form-control-lg ${inv('customerName')}`} value={form.customerName} onChange={(e) => set({ customerName: e.target.value })} autoComplete="off" autoCapitalize="words" maxLength={120} />
          </FormField>
          <FormField label="Customer phone" required error={errors.customerPhone} htmlFor="customerPhone">
            <input id="customerPhone" type="tel" inputMode="tel" className={`form-control form-control-lg ${inv('customerPhone')}`} value={form.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} placeholder="0777123456" maxLength={20} />
          </FormField>
          <div className="row g-2">
            <div className="col-12 col-sm-6">
              <FormField label="Pickup" required error={errors.pickupLocation} htmlFor="pickup">
                <input id="pickup" list="rl-pickups" className={`form-control form-control-lg ${inv('pickupLocation')}`} value={form.pickupLocation} onChange={(e) => set({ pickupLocation: e.target.value })} maxLength={200} />
              </FormField>
            </div>
            <div className="col-12 col-sm-6">
              <FormField label="Destination" required error={errors.destination} htmlFor="destination">
                <input id="destination" list="rl-destinations" className={`form-control form-control-lg ${inv('destination')}`} value={form.destination} onChange={(e) => set({ destination: e.target.value })} maxLength={200} />
              </FormField>
            </div>
          </div>
          <datalist id="rl-pickups">{recent.pickups.map((p) => <option key={p} value={p} />)}</datalist>
          <datalist id="rl-destinations">{recent.destinations.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="row g-2">
            <div className="col-7">
              <FormField label="Order reference" hint="Optional" htmlFor="orderRef" className="mb-0">
                <input id="orderRef" className="form-control" value={form.orderReference} onChange={(e) => set({ orderReference: e.target.value })} maxLength={60} autoCapitalize="characters" />
              </FormField>
            </div>
            <div className="col-5">
              <FormField label="Bike" htmlFor="bike" className="mb-0">
                <select id="bike" className="form-select" value={form.bike} onChange={(e) => set({ bike: e.target.value })}>
                  <option value="">None</option>
                  {bikes.map((b) => <option key={b._id} value={b._id}>{b.bikeId}</option>)}
                </select>
              </FormField>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="form-label fw-medium">Delivery status <span className="text-danger">*</span></div>
          <div className="rl-chips rl-chips-4 mb-3" role="radiogroup" aria-label="Delivery status">
            {DELIVERY_STATUSES.map((s) => (
              <button type="button" key={s} role="radio" aria-checked={form.status === s} className={`rl-chip rl-chip-${s.toLowerCase()} ${form.status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s}</button>
            ))}
          </div>
          <div className="form-label fw-medium">Payment method <span className="text-danger">*</span></div>
          <div className="rl-chips mb-1" role="radiogroup" aria-label="Payment method">
            {PAYMENT_METHODS.map((p) => (
              <button type="button" key={p} role="radio" aria-checked={form.paymentMethod === p} className={`rl-chip ${form.paymentMethod === p ? 'active' : ''}`} onClick={() => setPayment(p)}>{p}</button>
            ))}
          </div>
          {errors.paymentMethod && <div className="invalid-feedback d-block">{errors.paymentMethod}</div>}

          <div className="row g-2 mt-2">
            <div className="col-6">
              <FormField label="Delivery fee" required error={errors.deliveryFee} htmlFor="fee" className="mb-2" hint={feeLocked ? 'Standard fee' : undefined}>
                <MoneyInput id="fee" size="lg" value={form.deliveryFee} invalid={Boolean(errors.deliveryFee)} readOnly={feeLocked}
                  onChange={(v) => set({ deliveryFee: v, ...(form.amountCollected === form.deliveryFee && form.paymentMethod !== 'Credit/Unpaid' ? { amountCollected: v } : {}) })} />
              </FormField>
            </div>
            <div className="col-6">
              <FormField label="Amount collected" error={errors.amountCollected} htmlFor="collected" className="mb-2">
                <MoneyInput id="collected" size="lg" value={form.amountCollected} invalid={Boolean(errors.amountCollected)} readOnly={form.paymentMethod === 'Credit/Unpaid'} onChange={(v) => set({ amountCollected: v })} />
              </FormField>
            </div>
          </div>
          {form.paymentMethod !== 'Credit/Unpaid' && form.amountCollected !== form.deliveryFee && (
            <div className="d-flex gap-2 mb-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => set({ amountCollected: form.deliveryFee })}>Paid in full</button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => set({ amountCollected: '0.00' })}>Nothing collected</button>
            </div>
          )}
          {extra > 0 ? (
            <div className="rl-outstanding rl-outstanding-extra flex-column align-items-stretch gap-1">
              <div className="d-flex justify-content-between"><span>Delivery fee</span><Money cents={feeCents} /></div>
              <div className="d-flex justify-content-between"><span>Extra collected (order money)</span><strong><Money cents={extra} /></strong></div>
              <div className="d-flex justify-content-between border-top pt-1"><span>Total collected</span><strong><Money cents={colCents} /></strong></div>
              <div className="small fw-normal">The full amount counts in your collections{form.paymentMethod === 'Cash' ? ' and cash handover' : ''}. Management sees this breakdown.</div>
            </div>
          ) : (
            <div className={`rl-outstanding ${outstanding > 0 ? 'rl-outstanding-due' : ''}`}>
              <span>Outstanding</span>
              <strong>{outstanding === null ? '—' : <Money cents={outstanding} />}</strong>
            </div>
          )}
          {warnings.map((w) => <div key={w} className="small text-warning-emphasis mt-2 d-flex gap-1"><AlertTriangle size={14} className="mt-1 flex-shrink-0" /> {w}</div>)}
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          {showNotes ? (
            <FormField label="Remarks / notes" htmlFor="remarks" className="mb-0">
              <textarea id="remarks" className="form-control" rows={2} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} maxLength={500} />
            </FormField>
          ) : (
            <button type="button" className="btn btn-link p-0 d-flex align-items-center gap-1" onClick={() => setShowNotes(true)}><StickyNote size={16} /> Add a note</button>
          )}
          {isEdit && isAdmin && (
            <FormField label={`Reason for change${perms?.requiresReason ? '' : ' (optional)'}`} required={perms?.requiresReason} error={errors.reason} htmlFor="reason" className="mt-3 mb-0">
              <textarea id="reason" className={`form-control ${inv('reason')}`} rows={2} value={form.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} />
            </FormField>
          )}
        </div>
      </div>

      <div className="rl-sticky-submit">
        <LoadingButton type="submit" loading={busy} loadingText="Saving…" className="btn btn-primary btn-lg w-100 d-flex align-items-center justify-content-center gap-2">
          <Save size={20} /> {isEdit ? 'Save Changes' : 'Save Delivery'}
        </LoadingButton>
      </div>
    </form>
  );
}
