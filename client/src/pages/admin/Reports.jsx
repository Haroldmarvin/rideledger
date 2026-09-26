import { useState } from 'react';
import { Printer, FileSpreadsheet, FileDown, FileBarChart, Play } from 'lucide-react';
import api from '../../services/api';
import { downloadFile } from '../../services/download';
import { useLookups } from '../../hooks/useLookups';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import LoadingButton from '../../components/LoadingButton';
import Logo from '../../components/Logo';
import { TableSkeleton } from '../../components/Skeleton';
import { formatMoney } from '../../utils/money';
import { formatDate, formatDateTime, presetRange } from '../../utils/format';
import { PAYMENT_METHODS, DELIVERY_STATUSES, EXPENSE_STATUSES } from '../../utils/constants';

const TYPES = [
  { key: 'daily', title: 'Daily Delivery Report', range: 'today' },
  { key: 'rider', title: 'Individual Rider Report', range: '30d', needsRider: true },
  { key: 'weekly', title: 'Weekly Delivery Report', range: '7d' },
  { key: 'monthly', title: 'Monthly Delivery Report', range: 'month' },
  { key: 'revenue', title: 'Revenue / Fees Report', range: 'month' },
  { key: 'collections', title: 'Payment Collection Report', range: 'month' },
  { key: 'outstanding', title: 'Outstanding / Unpaid Delivery Report', range: '30d' },
  { key: 'expenses', title: 'Expense Report', range: 'month' },
  { key: 'performance', title: 'Rider Performance Report', range: 'month' },
  { key: 'reconciliation', title: 'Cash Reconciliation Report', range: '7d' },
];

function cell(value, format, symbol) {
  if (format === 'money') return formatMoney(value, symbol);
  if (value === null || value === undefined || value === '') return '—';
  return value;
}

export default function Reports() {
  const { today } = useConfig();
  const toast = useToast();
  const { riders, bikes } = useLookups();
  const [type, setType] = useState('daily');
  const [f, setF] = useState({ ...presetRange('today', today), rider: '', bike: '', status: '', paymentMethod: '' });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);
  const meta = TYPES.find((t) => t.key === type);

  const chooseType = (key) => {
    const t = TYPES.find((x) => x.key === key);
    setType(key);
    setF((cur) => ({ ...cur, ...presetRange(t.range, today), status: '' }));
    setReport(null);
    setError(null);
  };

  const params = () => {
    const p = { type, from: f.from, to: f.to };
    for (const k of ['rider', 'bike', 'status', 'paymentMethod']) if (f[k]) p[k] = f[k];
    return p;
  };

  const run = async () => {
    if (meta.needsRider && !f.rider) { setError({ message: 'Please choose a rider for the Individual Rider Report.' }); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports', { params: params() });
      setReport(res.data.report);
    } catch (e) { setError(e); setReport(null); } finally { setLoading(false); }
  };

  const exportAs = async (kind) => {
    if (meta.needsRider && !f.rider) { setError({ message: 'Please choose a rider first.' }); return; }
    setExporting(kind);
    try {
      await downloadFile(`/reports/export/${kind}`, params(), `AfriKapitalKitchen_${type}.${kind === 'excel' ? 'xlsx' : 'pdf'}`);
      toast.success(`${kind === 'excel' ? 'Excel' : 'PDF'} report downloaded.`);
    } catch (e) { toast.error(e.message || 'Export failed.'); } finally { setExporting(null); }
  };

  const statusOptions = type === 'expenses' ? EXPENSE_STATUSES : DELIVERY_STATUSES;
  const sym = report?.currencySymbol || '$';

  return (
    <div>
      <div className="d-print-none">
        <PageHeader title="Reports" subtitle="View, print and export management reports" />
        <div className="row g-3 mb-3">
          <div className="col-lg-3">
            <div className="list-group rl-report-types">
              {TYPES.map((t) => (
                <button type="button" key={t.key} className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${type === t.key ? 'active' : ''}`} onClick={() => chooseType(t.key)}>
                  <FileBarChart size={16} className="flex-shrink-0" /> <span className="small">{t.title}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="col-lg-9">
            <div className="card mb-3">
              <div className="card-body">
                <div className="fw-semibold mb-3">{meta.title}</div>
                <div className="row g-2">
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">From</label><input type="date" className="form-control" value={f.from} max={f.to} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">To</label><input type="date" className="form-control" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">Rider{meta.needsRider && <span className="text-danger"> *</span>}</label><select className="form-select" value={f.rider} onChange={(e) => setF({ ...f, rider: e.target.value })}><option value="">All riders</option>{riders.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></div>
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">Bike</label><select className="form-select" value={f.bike} onChange={(e) => setF({ ...f, bike: e.target.value })} disabled={['expenses', 'reconciliation'].includes(type)}><option value="">All bikes</option>{bikes.map((b) => <option key={b._id} value={b._id}>{b.bikeId}</option>)}</select></div>
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">Status</label><select className="form-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} disabled={type === 'reconciliation'}><option value="">All</option>{statusOptions.map((s) => <option key={s}>{s}</option>)}</select></div>
                  <div className="col-6 col-md-3"><label className="form-label small mb-1">Payment method</label><select className="form-select" value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} disabled={['expenses', 'reconciliation'].includes(type)}><option value="">All</option>{PAYMENT_METHODS.map((s) => <option key={s}>{s}</option>)}</select></div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <LoadingButton loading={loading} loadingText="Generating…" onClick={run} className="btn btn-primary d-flex align-items-center gap-1"><Play size={16} /> View report</LoadingButton>
                  <LoadingButton loading={exporting === 'pdf'} loadingText="Preparing PDF…" onClick={() => exportAs('pdf')} className="btn btn-outline-danger d-flex align-items-center gap-1"><FileDown size={16} /> Export PDF</LoadingButton>
                  <LoadingButton loading={exporting === 'excel'} loadingText="Preparing Excel…" onClick={() => exportAs('excel')} className="btn btn-outline-success d-flex align-items-center gap-1"><FileSpreadsheet size={16} /> Export Excel</LoadingButton>
                  <button type="button" className="btn btn-outline-secondary d-flex align-items-center gap-1" disabled={!report} onClick={() => window.print()}><Printer size={16} /> Print</button>
                </div>
              </div>
            </div>
            <ErrorAlert error={error} />
            {loading && !report && <div className="card"><TableSkeleton rows={8} cols={7} /></div>}
            {!loading && !report && !error && <div className="card"><EmptyState icon={FileBarChart} title="Choose filters and view the report." message="You can also export straight to PDF or Excel." /></div>}
          </div>
        </div>
      </div>

      {report && (
        <div className={`card rl-report ${loading ? 'opacity-50' : ''}`}>
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 border-bottom pb-3 mb-3">
              <div><Logo size={60} /><div className="small text-secondary mt-1">{report.company}</div></div>
              <div className="text-md-end">
                <h2 className="h5 fw-bold mb-1">{report.title}</h2>
                <div className="small">Period: <strong>{formatDate(report.period.from)}</strong> – <strong>{formatDate(report.period.to)}</strong></div>
                <div className="small text-secondary">Generated {formatDateTime(report.generatedAt)} by {report.generatedBy}</div>
                <div className="small text-secondary">Filters: {report.filters.length ? report.filters.map(([k, v]) => `${k}: ${v}`).join(' · ') : 'None'}</div>
              </div>
            </div>
            {report.summary.length > 0 && (
              <div className="rl-report-summary mb-3">
                {report.summary.map((s) => (
                  <div key={s.label}><span>{s.label}</span><strong className={s.format === 'money' && s.value < 0 ? 'text-danger' : ''}>{s.format === 'money' ? formatMoney(s.value, sym) : s.value}</strong></div>
                ))}
              </div>
            )}
            {report.rows.length === 0 ? <EmptyState title="No records for the selected period and filters." /> : (
              <div className="table-responsive">
                <table className="table table-sm table-striped align-middle mb-0 rl-table rl-report-table">
                  <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.format ? 'text-end' : ''}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={i}>{report.columns.map((c) => <td key={c.key} className={`${c.format ? 'text-end' : ''} ${c.format === 'money' && r[c.key] < 0 ? 'text-danger' : ''} ${c.key.endsWith('Id') ? 'font-monospace small' : ''}`}>{cell(r[c.key], c.format, sym)}</td>)}</tr>
                    ))}
                  </tbody>
                  {Object.keys(report.totals).length > 0 && (
                    <tfoot><tr className="fw-bold">{report.columns.map((c, i) => <td key={c.key} className={c.format ? 'text-end' : ''}>{i === 0 ? 'TOTAL' : report.totals[c.key] !== undefined ? cell(report.totals[c.key], c.format, sym) : ''}</td>)}</tr></tfoot>
                  )}
                </table>
              </div>
            )}
            {report.notes.map((n) => <div key={n} className="small text-secondary mt-2">Note: {n}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
