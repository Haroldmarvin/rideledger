import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, CheckCircle2, BadgeDollarSign, Wallet, Banknote, Smartphone, Clock, Receipt, Scale, AlertCircle, FilePenLine } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, LabelList } from 'recharts';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { useConfig } from '../../context/ConfigContext';
import FilterBar, { toParams } from '../../components/FilterBar';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import Money from '../../components/Money';
import { StatusBadge } from '../../components/Badges';
import { Skeleton } from '../../components/Skeleton';
import { presetRange, formatDate } from '../../utils/format';

const SERIES = { primary: '#2a78d6', secondary: '#eb6834' };
const GRID = '#e8e8e4';
const AXIS = { fontSize: 12, fill: '#52514e' };

function ChartCard({ title, subtitle, children, loading, height = 260 }) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="fw-semibold">{title}</div>
        {subtitle && <div className="small text-secondary mb-2">{subtitle}</div>}
        {loading ? <Skeleton height={height} /> : <div style={{ height }}>{children}</div>}
      </div>
    </div>
  );
}

function MoneyTooltip({ active, payload, label, money, isMoney, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rl-chart-tip">
      <div className="fw-semibold mb-1">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="d-flex align-items-center gap-2">
          <span className="rl-chart-dot" style={{ background: p.color }} /> <span className="text-secondary">{p.name}</span>
          <strong className="ms-auto">{isMoney ? money(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { today, money } = useConfig();
  const [filters, setFilters] = useState({ preset: 'today', ...presetRange('today', today) });
  const { riders, bikes } = useLookups();
  const { data, loading, error, reload } = useApi('/dashboard', toParams(filters));
  const k = data?.kpis;
  const first = loading && !data;
  const shortMoney = (c) => money(c).replace(/\.00$/, '');

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={data ? `${formatDate(data.filters.from)}${data.filters.to !== data.filters.from ? ` – ${formatDate(data.filters.to)}` : ''}` : 'Operations overview'} />
      <FilterBar value={filters} onChange={setFilters} riders={riders} bikes={bikes} show={{ search: false, rider: true, bike: true }} />
      <ErrorAlert error={error} onRetry={reload} />

      {data && (data.pending.expenses + data.pending.closeouts + data.pending.corrections) > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {data.pending.expenses > 0 && <Link to="/admin/expenses" className="rl-action-pill"><Receipt size={15} /> {data.pending.expenses} expense{data.pending.expenses > 1 ? 's' : ''} to review</Link>}
          {data.pending.closeouts > 0 && <Link to="/admin/reconciliation" className="rl-action-pill"><Scale size={15} /> {data.pending.closeouts} handover{data.pending.closeouts > 1 ? 's' : ''} to confirm</Link>}
          {data.pending.corrections > 0 && <Link to="/admin/reconciliation?tab=corrections" className="rl-action-pill"><FilePenLine size={15} /> {data.pending.corrections} correction{data.pending.corrections > 1 ? 's' : ''} to review</Link>}
        </div>
      )}

      <div className={`row g-2 g-md-3 mb-3 ${loading && data ? 'opacity-50' : ''}`}>
        <div className="col-6 col-md-4 col-xl"><StatCard label="Deliveries" value={k?.deliveries} icon={Truck} loading={first} /></div>
        <div className="col-6 col-md-4 col-xl"><StatCard label="Successful" value={k?.delivered} icon={CheckCircle2} tone="success" loading={first} hint={k && k.deliveries ? `${k.failed} failed · ${k.returned} returned · ${k.cancelled} cancelled` : null} /></div>
        <div className="col-6 col-md-4 col-xl"><StatCard label="Delivery Fees" cents={k?.totalFees} icon={BadgeDollarSign} loading={first} /></div>
        <div className="col-6 col-md-4 col-xl"><StatCard label="Total Collections" cents={k?.totalCollected} icon={Wallet} tone="success" loading={first} hint={k && k.extraCollected > 0 ? `Incl. ${money(k.extraCollected)} extra (order money)` : null} /></div>
        <div className="col-6 col-md-4 col-xl"><StatCard label="Cash Collected" cents={k?.cashCollected} icon={Banknote} loading={first} /></div>
      </div>
      <div className={`row g-2 g-md-3 mb-3 ${loading && data ? 'opacity-50' : ''}`}>
        <div className="col-6 col-md-3"><StatCard label="Electronic Payments" cents={k?.electronicCollected} icon={Smartphone} tone="info" loading={first} hint={k ? `MoMo ${money(k.mobileMoneyCollected)} · Bank ${money(k.bankCollected)}` : null} /></div>
        <div className="col-6 col-md-3"><StatCard label="Outstanding Payments" cents={k?.outstanding} icon={Clock} tone="warning" loading={first} hint={k ? `${k.creditCount} on credit` : null} /></div>
        <div className="col-6 col-md-3"><StatCard label="Approved Expenses" cents={k?.approvedExpenses} icon={Receipt} loading={first} /></div>
        <div className="col-6 col-md-3"><StatCard label="Net Amount Due" cents={k?.netAmountDue} icon={Scale} tone={k?.netAmountDue < 0 ? 'danger' : 'primary'} loading={first} hint="Cash − approved expenses" /></div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-7">
          <ChartCard title="Delivery trends" subtitle="Daily deliveries (at least the last 14 days)" loading={first}>
            {data && (
              <ResponsiveContainer>
                <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { day: 'numeric', month: 'short' })} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip content={<MoneyTooltip money={money} labelFormatter={(d) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} />} cursor={{ stroke: '#9c9b95', strokeDasharray: '3 3' }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="deliveries" name="All deliveries" stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                  <Line type="monotone" dataKey="delivered" name="Delivered" stroke={SERIES.secondary} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <div className="col-lg-5">
          <ChartCard title="Payment breakdown" subtitle="Amount collected by method, plus credit still owed" loading={first}>
            {data && (data.paymentBreakdown.every((p) => p.amount === 0)
              ? <EmptyState title="No payments in this period." />
              : (
                <ResponsiveContainer>
                  <BarChart data={data.paymentBreakdown} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 0 }} barCategoryGap={10}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="method" width={110} tick={AXIS} tickLine={false} axisLine={false} />
                    <Tooltip content={<MoneyTooltip money={money} isMoney />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="amount" name="Amount" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={26}>
                      <LabelList dataKey="amount" position="right" formatter={shortMoney} style={{ fontSize: 12, fill: '#0b0b0b' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ))}
          </ChartCard>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body pb-0">
          <div className="fw-semibold">Rider performance</div>
          <div className="small text-secondary mb-2">Factual figures for the selected period — no scores.</div>
        </div>
        {first ? <div className="p-3"><Skeleton height={160} /></div> : data && (
          data.riderPerformance.length === 0 ? <EmptyState title="No riders found." /> : (
            <>
              <div style={{ height: Math.max(140, data.riderPerformance.length * 36) }} className="px-3">
                <ResponsiveContainer>
                  <BarChart data={data.riderPerformance.map((r) => ({ name: r.rider.name, deliveries: r.deliveries, delivered: r.delivered }))} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={AXIS} tickLine={false} axisLine={false} />
                    <Tooltip content={<MoneyTooltip money={money} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="deliveries" name="Deliveries" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={12} />
                    <Bar dataKey="delivered" name="Delivered" fill={SERIES.secondary} radius={[0, 4, 4, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0 rl-table">
                  <thead><tr><th>Rider</th><th className="text-end">Deliveries</th><th className="text-end">Successful</th><th className="text-end">Fees</th><th className="text-end">Collected</th><th className="text-end">Outstanding</th><th className="text-end">Expenses</th><th className="text-end">Cash due</th></tr></thead>
                  <tbody>
                    {data.riderPerformance.map((r) => (
                      <tr key={r.rider._id}>
                        <td><Link to={`/admin/riders/${r.rider._id}`}>{r.rider.name}</Link> {r.rider.status !== 'active' && <StatusBadge status="inactive" />}</td>
                        <td className="text-end">{r.deliveries}</td>
                        <td className="text-end">{r.delivered}</td>
                        <td className="text-end"><Money cents={r.fees} /></td>
                        <td className="text-end"><Money cents={r.collected} /></td>
                        <td className="text-end">{r.outstanding ? <Money cents={r.outstanding} tone="warning-emphasis" /> : '—'}</td>
                        <td className="text-end"><Money cents={r.expenses} /></td>
                        <td className="text-end fw-semibold"><Money cents={r.expectedHandover} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      <div className="card mb-4">
        <div className="card-body d-flex justify-content-between align-items-center pb-2">
          <div className="fw-semibold">Latest deliveries</div>
          <Link to="/admin/deliveries" className="small">View all</Link>
        </div>
        {data?.recent.length === 0 && <EmptyState icon={AlertCircle} title="No deliveries recorded for this period." />}
        {data?.recent.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover table-sm align-middle mb-0 rl-table">
              <thead><tr><th>Delivery</th><th>Rider</th><th>Customer</th><th className="text-end">Fee</th><th className="text-end">Collected</th><th>Status</th></tr></thead>
              <tbody>
                {data.recent.map((d) => (
                  <tr key={d._id}>
                    <td className="font-monospace small"><Link to={`/admin/deliveries/${d._id}`}>{d.deliveryId}</Link><div className="text-secondary">{d.time}</div></td>
                    <td>{d.rider?.name}</td>
                    <td className="text-truncate" style={{ maxWidth: 180 }}>{d.customerName}</td>
                    <td className="text-end"><Money cents={d.deliveryFee} /></td>
                    <td className="text-end"><Money cents={d.amountCollected} /></td>
                    <td><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
