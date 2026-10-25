// پنل گزارش مدیر سازمان: فیلتر تاریخ/وضعیت، روند صدور در طول زمان، و برای هر متغیر انتخابی
// (فیلدهای انتخابی/متنی فرم) نمودار میله‌ای + دایره‌ای. کلیک روی هر مقدار، بقیه‌ی نمودارها را فیلتر می‌کند.
// همه‌چیز از کارت‌هایی که داشبورد قبلاً بارگذاری کرده محاسبه می‌شود؛ درخواست جدیدی به سرور نمی‌رود.
import jalaali from 'jalaali-js';
import { downloadBlob } from './pdf.js';

const { useState, useMemo, useRef } = React;

// رنگ‌ها: یک رنگ برای نمودارهای تک‌سری، پنج رنگ دسته‌ای به ترتیب ثابت (اعتبارسنجی‌شده برای کوررنگی) + خاکستری برای «سایر»
const SERIES = '#2a78d6';
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER_COLOR = '#a8a7a1';
const MUTED_BAR = '#d6d5d0';
const GRID = '#e6e5e0';
const PIE_SLICES = 5;   // بیشتر از این در «سایر» جمع می‌شود
const BAR_ROWS = 12;

const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

/** فیلدهایی که می‌توانند «متغیر گزارش» باشند. */
export const reportableFields = (tenant) => (tenant.fields || []).filter(f => f.type === 'select' || f.type === 'text');

// --- تاریخ: همه‌ی محاسبات روی روزهای تقویمی (UTC) تا منطقه‌ی زمانی مرورگر اثری نداشته باشد ---
const dayNum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS : null; };
const numToIso = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const partsOf = (n) => { const d = new Date(n * DAY_MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** کلید و برچسب بازه‌ی زمانی یک روز (روزانه، هفتگی یا ماهانه؛ ماه شمسی برای فارسی). */
const makeBucketer = (unit, lang, fmt) => {
    const fa = lang === 'fa'; const satWeek = fa || lang === 'ar';
    const dayLabel = (n) => { const [y, m, d] = partsOf(n); if (fa) { const j = jalaali.toJalaali(y, m, d); return fmt(`${j.jm}/${j.jd}`); } return `${EN_MONTHS[m - 1]} ${d}`; };
    const fullDay = (n) => { const [y, m, d] = partsOf(n); if (fa) { const j = jalaali.toJalaali(y, m, d); return fmt(`${j.jd} ${FA_MONTHS[j.jm - 1]} ${j.jy}`); } return `${EN_MONTHS[m - 1]} ${d}, ${y}`; };
    if (unit === 'day') return { key: n => n, start: n => n, next: n => n + 1, label: dayLabel, title: fullDay };
    if (unit === 'week') {
        // شروع هفته: شنبه (فارسی/عربی) یا دوشنبه
        const start = (n) => { const dow = new Date(n * DAY_MS).getUTCDay(); const off = satWeek ? (dow + 1) % 7 : (dow + 6) % 7; return n - off; };
        return { key: start, start, next: n => n + 7, label: dayLabel, title: n => `${fullDay(n)} – ${fullDay(n + 6)}` };
    }
    if (fa) {
        const start = (n) => { const [y, m, d] = partsOf(n); const j = jalaali.toJalaali(y, m, d); const g = jalaali.toGregorian(j.jy, j.jm, 1); return Date.UTC(g.gy, g.gm - 1, g.gd) / DAY_MS; };
        const next = (n) => { const [y, m, d] = partsOf(n); const j = jalaali.toJalaali(y, m, d); const ny = j.jm === 12 ? j.jy + 1 : j.jy; const nm = j.jm === 12 ? 1 : j.jm + 1; const g = jalaali.toGregorian(ny, nm, 1); return Date.UTC(g.gy, g.gm - 1, g.gd) / DAY_MS; };
        const label = (n) => { const [y, m, d] = partsOf(n); const j = jalaali.toJalaali(y, m, d); return `${FA_MONTHS[j.jm - 1]} ${fmt(String(j.jy).slice(2))}`; };
        const title = (n) => { const [y, m, d] = partsOf(n); const j = jalaali.toJalaali(y, m, d); return `${FA_MONTHS[j.jm - 1]} ${fmt(j.jy)}`; };
        return { key: start, start, next, label, title };
    }
    const start = (n) => { const [y, m] = partsOf(n); return Date.UTC(y, m - 1, 1) / DAY_MS; };
    const next = (n) => { const [y, m] = partsOf(n); return Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / DAY_MS; };
    return { key: start, start, next, label: n => { const [y, m] = partsOf(n); return `${EN_MONTHS[m - 1]} ${String(y).slice(2)}`; }, title: n => { const [y, m] = partsOf(n); return `${EN_MONTHS[m - 1]} ${y}`; } };
};

const valueKey = (v) => String(v ?? '').trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').toLowerCase();

/** شمارش مقادیر یک فیلد؛ خروجی مرتب از بیشترین به کمترین. */
const countValues = (cards, field, emptyLabel) => {
    const map = new Map();
    cards.forEach(c => {
        const raw = (c.cardData || {})[field.id]; const k = valueKey(raw);
        const e = map.get(k); if (e) e.count++; else map.set(k, { key: k, label: k ? String(raw).trim() : emptyLabel, count: 1, empty: !k });
    });
    return [...map.values()].sort((a, b) => (a.empty - b.empty) || (b.count - a.count) || a.label.localeCompare(b.label, 'fa'));
};

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
const downloadCsv = (rows, name) => downloadBlob(new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' }), name);

// ==========================================

function Tooltip({ tip }) {
    if (!tip) return null;
    return (
        <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
            <div className="font-bold text-slate-800">{tip.title}</div>
            <div className="text-slate-600">{tip.body}</div>
        </div>
    );
}

/** روند صدور: ستون‌های نازک با گوشه‌ی گرد در انتهای داده، خطوط راهنمای کم‌رنگ و راهنمای شناور. */
function TimelineChart({ buckets, fmt, t, unitLabel }) {
    const wrapRef = useRef(null); const [tip, setTip] = useState(null); const [hover, setHover] = useState(-1);
    const max = Math.max(1, ...buckets.map(b => b.count));
    const step = niceStep(max); const top = Math.ceil(max / step) * step; const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const H = 200; const n = buckets.length;
    const labelEvery = Math.max(1, Math.ceil(n / 12));
    const show = (i, e) => {
        const b = buckets[i]; const box = wrapRef.current.getBoundingClientRect(); const col = e.currentTarget.getBoundingClientRect();
        setHover(i); setTip({ x: col.left - box.left + col.width / 2, y: col.top - box.top, title: b.title, body: t('report_cards_n', fmt(b.count)) });
    };
    return (
        <div ref={wrapRef} className="relative" onMouseLeave={() => { setHover(-1); setTip(null); }}>
            <div className="flex gap-2" dir="ltr">
                <div className="relative shrink-0 w-8 text-[10px] text-slate-500" style={{ height: H }} aria-hidden="true">
                    {ticks.map(v => <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: H - (v / top) * H }}>{fmt(v)}</span>)}
                </div>
                <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-x-0 top-0" style={{ height: H }} aria-hidden="true">
                        {ticks.map(v => <div key={v} className="absolute inset-x-0" style={{ top: H - (v / top) * H, borderTop: `1px solid ${GRID}` }} />)}
                    </div>
                    <div className="relative flex items-end" style={{ height: H, gap: n > 40 ? 1 : 2 }} role="list" aria-label={unitLabel}>
                        {buckets.map((b, i) => (
                            <div key={b.start} role="listitem" tabIndex={0} aria-label={`${b.title}: ${t('report_cards_n', fmt(b.count))}`}
                                onMouseEnter={e => show(i, e)} onFocus={e => show(i, e)} onBlur={() => { setHover(-1); setTip(null); }}
                                className="relative flex-1 h-full flex items-end justify-center outline-none focus-visible:bg-indigo-50/60 rounded-sm" style={{ background: hover === i ? 'rgba(42,120,214,.06)' : undefined }}>
                                <div style={{ width: '100%', maxWidth: 28, height: b.count ? Math.max(2, (b.count / top) * H) : 0, background: SERIES, borderRadius: '4px 4px 0 0' }} />
                            </div>
                        ))}
                    </div>
                    <div className="flex mt-1.5 text-[10px] text-slate-500" style={{ gap: n > 40 ? 1 : 2 }} aria-hidden="true">
                        {buckets.map((b, i) => <div key={b.start} className="flex-1 min-w-0 text-center whitespace-nowrap overflow-visible">{i % labelEvery === 0 ? b.label : ''}</div>)}
                    </div>
                </div>
            </div>
            <Tooltip tip={tip} />
        </div>
    );
}
const niceStep = (max) => { const raw = max / 4; const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const m = raw / p; return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p); };

/** نمودار میله‌ای افقی رتبه‌بندی‌شده؛ هر میله دکمه‌ای برای فیلتر روی آن مقدار است. */
function BarList({ rows, total, fmt, pct, selectedKey, onPick, t }) {
    const shown = rows.slice(0, BAR_ROWS); const rest = rows.slice(BAR_ROWS);
    const restCount = rest.reduce((s, r) => s + r.count, 0);
    const max = Math.max(1, ...shown.map(r => r.count), restCount);
    const line = (r, i, isRest) => {
        const active = selectedKey === undefined || selectedKey === r.key;
        const color = isRest ? OTHER_COLOR : active ? SERIES : MUTED_BAR;
        const body = (
            <>
                <span className={`viz-bar-label text-xs truncate ${isRest || r.empty ? 'text-slate-500 italic' : 'text-slate-700'} ${selectedKey === r.key ? 'font-bold' : ''}`} title={r.label}>{r.label}</span>
                <span className="viz-bar-track"><span className="viz-bar" style={{ width: `${(r.count / max) * 100}%`, background: color }} /></span>
                <span className="viz-bar-value text-xs text-slate-700 tabular-nums">{fmt(r.count)} <span className="text-slate-400">({pct(r.count)})</span></span>
            </>
        );
        return isRest
            ? <div key="__rest" className="viz-bar-row">{body}</div>
            : <button key={r.key || '__empty'} type="button" className={`viz-bar-row viz-bar-btn ${selectedKey === r.key ? 'is-selected' : ''}`} aria-pressed={selectedKey === r.key} onClick={() => onPick(r.key)} title={t('report_filter_hint')}>{body}</button>;
    };
    return (
        <div className="space-y-0.5">
            {shown.map((r, i) => line(r, i, false))}
            {rest.length > 0 && line({ key: '__rest', label: t('report_other_n', fmt(rest.length)), count: restCount }, -1, true)}
        </div>
    );
}

/** نمودار دایره‌ای (دونات) با حداکثر ۵ برش + «سایر»، فاصله‌ی ۲ پیکسلی بین برش‌ها و جمع کل در مرکز. */
function Donut({ rows, total, fmt, pct, selectedKey, onPick, t }) {
    const wrapRef = useRef(null); const [tip, setTip] = useState(null); const [hover, setHover] = useState(null);
    const top = rows.slice(0, rows.length > PIE_SLICES + 1 ? PIE_SLICES : PIE_SLICES + 1);
    const restRows = rows.slice(top.length); const restCount = restRows.reduce((s, r) => s + r.count, 0);
    const slices = top.map((r, i) => ({ ...r, color: r.empty ? OTHER_COLOR : CATEGORICAL[i % CATEGORICAL.length] }));
    if (restCount) slices.push({ key: '__rest', label: t('report_other_n', fmt(restRows.length)), count: restCount, color: OTHER_COLOR, rest: true });
    const R = 74, r0 = 50, C = 90; let acc = 0;
    const arcs = slices.map(s => { const a0 = acc / total; acc += s.count; const a1 = acc / total; return { ...s, path: arcPath(C, C, R, r0, a0, a1) }; });
    const show = (s, e) => { const box = wrapRef.current.getBoundingClientRect(); setHover(s.key); setTip({ x: e.clientX - box.left, y: e.clientY - box.top - 8, title: s.label, body: `${t('report_cards_n', fmt(s.count))} · ${pct(s.count)}` }); };
    return (
        <div ref={wrapRef} className="relative flex flex-col sm:flex-row items-center gap-4" onMouseLeave={() => { setTip(null); setHover(null); }}>
            <svg viewBox="0 0 180 180" className="w-40 h-40 shrink-0" role="img" aria-label={slices.map(s => `${s.label}: ${pct(s.count)}`).join('، ')}>
                {arcs.map(s => (
                    <path key={s.key || '__empty'} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2" strokeLinejoin="round"
                        opacity={(selectedKey !== undefined && selectedKey !== s.key) || (hover && hover !== s.key) ? 0.35 : 1}
                        style={{ cursor: s.rest ? 'default' : 'pointer', transition: 'opacity .15s' }}
                        onMouseMove={e => show(s, e)} onClick={() => !s.rest && onPick(s.key)} />
                ))}
                <text x={C} y={C - 2} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 22, fontWeight: 700 }}>{fmt(total)}</text>
                <text x={C} y={C + 18} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11 }}>{t('report_cards')}</text>
            </svg>
            <ul className="flex-1 min-w-0 space-y-1 text-xs w-full" aria-label={t('report_legend')}>
                {slices.map(s => (
                    <li key={s.key || '__empty'} className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden="true" />
                        <span className={`truncate flex-1 ${s.rest || s.empty ? 'text-slate-500 italic' : 'text-slate-700'} ${selectedKey === s.key ? 'font-bold' : ''}`} title={s.label}>{s.label}</span>
                        <span className="tabular-nums text-slate-700 shrink-0">{pct(s.count)}</span>
                    </li>
                ))}
            </ul>
            <Tooltip tip={tip} />
        </div>
    );
}
const arcPath = (cx, cy, R, r0, a0, a1) => {
    if (a1 - a0 >= 0.9999) return `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}Z M${cx} ${cy - r0}A${r0} ${r0} 0 1 0 ${cx + 0.01} ${cy - r0}Z`;
    const p = (r, a) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)];
    const large = a1 - a0 > 0.5 ? 1 : 0; const [x0, y0] = p(R, a0); const [x1, y1] = p(R, a1); const [x2, y2] = p(r0, a1); const [x3, y3] = p(r0, a0);
    return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
};

function VariableCard({ field, rows, total, fmt, pct, selectedKey, onPick, t, Icon, fileBase }) {
    const [mode, setMode] = useState('chart');
    const distinct = rows.filter(r => !r.empty).length;
    const exportCsv = () => downloadCsv([[field.label, t('report_count'), t('report_percent')], ...rows.map(r => [r.label, r.count, pct(r.count)])], `${fileBase}_${field.label}.csv`);
    return (
        <section className="glass-strong rounded-2xl p-4 md:p-5" aria-label={field.label}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="font-bold text-slate-800">{t('report_by', field.label)}</h3>
                    <p className="text-[11px] text-slate-500">{t('report_distinct_n', fmt(distinct))}</p>
                </div>
                <div className="flex items-center gap-1">
                    <div role="radiogroup" aria-label={field.label} className="view-toggle inline-flex bg-slate-100/80 rounded-lg p-0.5">
                        {[['chart', 'ChartPie', t('report_chart')], ['table', 'Table', t('report_table')]].map(([m, ic, lb]) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-600"><Icon name={ic} className="w-3.5 h-3.5" /> {lb}</button>)}
                    </div>
                    <button type="button" onClick={exportCsv} className="p-1.5 rounded-lg text-slate-500 hover:bg-white/70" title={t('report_csv')} aria-label={`${t('report_csv')}: ${field.label}`}><Icon name="Download" className="w-4 h-4" /></button>
                </div>
            </div>
            {total === 0 ? <p className="text-center text-sm text-slate-400 py-8">{t('no_records')}</p>
                : mode === 'table' ? (
                    <div className="max-h-80 overflow-y-auto rounded-xl border border-white/70">
                        <table className="w-full text-sm"><thead className="bg-white/60 text-slate-500 text-xs sticky top-0"><tr><th className="text-start p-2 font-medium">{field.label}</th><th className="text-end p-2 font-medium">{t('report_count')}</th><th className="text-end p-2 font-medium">{t('report_percent')}</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={r.key || '__empty'} className={selectedKey === r.key ? 'bg-indigo-50/70 font-bold' : ''}><td className={`p-2 ${r.empty ? 'italic text-slate-500' : 'text-slate-700'}`}>{r.label}</td><td className="p-2 text-end tabular-nums">{fmt(r.count)}</td><td className="p-2 text-end tabular-nums text-slate-500">{pct(r.count)}</td></tr>)}</tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-5 gap-6 items-center">
                        <div className="md:col-span-3 min-w-0"><BarList rows={rows} total={total} fmt={fmt} pct={pct} selectedKey={selectedKey} onPick={onPick} t={t} /></div>
                        <div className="md:col-span-2 min-w-0">{rows.length >= 2 ? <Donut rows={rows} total={total} fmt={fmt} pct={pct} selectedKey={selectedKey} onPick={onPick} t={t} /> : <p className="text-center text-sm text-slate-500 py-6">{t('report_single_value', rows[0].label)}</p>}</div>
                    </div>
                )}
        </section>
    );
}

// ==========================================

export function ReportsPanel({ tenant, cards, loading, t, lang, Icon, formatDate }) {
    const fields = useMemo(() => reportableFields(tenant), [tenant]);
    const [vars, setVars] = useState(() => { const sel = fields.filter(f => f.type === 'select').map(f => f.id); return sel.length ? sel : fields.slice(0, 1).map(f => f.id); });
    const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [status, setStatus] = useState('');
    const [unitPref, setUnitPref] = useState('auto');
    const [drill, setDrill] = useState({}); // { fieldId: valueKey }

    const fa = lang === 'fa';
    const fmt = (n) => { const s = typeof n === 'number' ? n.toLocaleString('en-US') : String(n); return fa ? s.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/,/g, '٬') : s; };
    const fieldById = (id) => fields.find(f => f.id === id);

    // کارت‌های داخل بازه‌ی تاریخ و وضعیت (پیش از فیلتر مقادیر)
    const base = useMemo(() => cards.filter(c => {
        const d = String(c.issuedAt || '').slice(0, 10);
        return (!from || d >= from) && (!to || d <= to) && (!status || (c.status || 'active') === status);
    }), [cards, from, to, status]);
    const matchesDrill = (c, exceptId) => Object.entries(drill).every(([fid, key]) => fid === exceptId || valueKey((c.cardData || {})[fid]) === key);
    const filtered = useMemo(() => base.filter(c => matchesDrill(c)), [base, drill]);

    // روند زمانی
    const timeline = useMemo(() => {
        const days = filtered.map(c => dayNum(String(c.issuedAt))).filter(n => n !== null);
        let lo = from ? dayNum(from) : (days.length ? Math.min(...days) : null); let hi = to ? dayNum(to) : (days.length ? Math.max(...days) : null);
        if (lo === null || hi === null || hi < lo) return { buckets: [], unit: 'day' };
        const span = hi - lo + 1;
        const unit = unitPref !== 'auto' ? unitPref : span <= 45 ? 'day' : span <= 26 * 7 ? 'week' : 'month';
        const bk = makeBucketer(unit, lang, fmt);
        const counts = new Map(); days.forEach(n => { const k = bk.key(n); counts.set(k, (counts.get(k) || 0) + 1); });
        const buckets = []; for (let s = bk.start(lo); s <= hi && buckets.length < 400; s = bk.next(s)) buckets.push({ start: s, count: counts.get(s) || 0, label: bk.label(s), title: bk.title(s) });
        return { buckets, unit };
    }, [filtered, from, to, unitPref, lang]);

    const statusCounts = useMemo(() => { const o = { active: 0, expired: 0, revoked: 0 }; filtered.forEach(c => { const s = c.status || 'active'; if (o[s] !== undefined) o[s]++; }); return o; }, [filtered]);

    const pick = (fid, key) => setDrill(d => { const n = { ...d }; if (n[fid] === key) delete n[fid]; else n[fid] = key; return n; });
    const toggleVar = (id) => setVars(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
    const setRange = (days) => { if (!days) { setFrom(''); setTo(''); return; } const tn = dayNum(todayIso()); setFrom(numToIso(tn - days + 1)); setTo(numToIso(tn)); };
    const rangeActive = (days) => days ? (to === todayIso() && from === numToIso(dayNum(todayIso()) - days + 1)) : (!from && !to);
    const anyFilter = from || to || status || Object.keys(drill).length;
    const fileBase = `Report_${String(tenant.orgName || 'org').replace(/[\\/:*?"<>|\s]+/g, '_')}`;
    const unitNames = { day: t('report_daily'), week: t('report_weekly'), month: t('report_monthly') };

    const exportAll = () => {
        const rows = [[t('report_variable'), t('report_value'), t('report_count'), t('report_percent')]];
        vars.map(fieldById).filter(Boolean).forEach(f => {
            const set = base.filter(c => matchesDrill(c, f.id)); const total = set.length;
            countValues(set, f, t('report_empty_value')).forEach(r => rows.push([f.label, r.label, r.count, total ? `${Math.round(r.count / total * 1000) / 10}%` : '0%']));
        });
        rows.push([]); rows.push([t('report_timeline'), unitNames[timeline.unit]]);
        timeline.buckets.forEach(b => rows.push([b.title, '', b.count, '']));
        downloadCsv(rows, `${fileBase}.csv`);
    };

    const chip = (active) => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/70 text-slate-600 border-slate-200 hover:border-indigo-300'}`;
    const tile = (label, value, icon, cls = 'text-slate-500') => (
        <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <Icon name={icon} className={`w-5 h-5 shrink-0 ${cls}`} />
            <div className="min-w-0"><p className="text-2xl font-bold text-slate-800 tabular-nums leading-tight">{fmt(value)}</p><p className="text-[11px] text-slate-500 truncate">{label}</p></div>
        </div>
    );

    if (loading) return <div className="glass-strong rounded-3xl p-10 text-center text-slate-500">{t('loading')}</div>;
    return (
        <div className="viz-root space-y-5">
            {/* فیلترها: یک ردیف بالای نمودارها */}
            <div className="glass-strong rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap gap-3 items-end text-sm">
                    <div className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('report_period')}</span>
                        <div className="flex flex-wrap gap-1">{[[0, t('report_all_time')], [7, t('report_last_days', fmt(7))], [30, t('report_last_days', fmt(30))], [90, t('report_last_days', fmt(90))], [365, t('report_last_days', fmt(365))]].map(([d, lb]) => <button key={d} type="button" onClick={() => setRange(d)} aria-pressed={rangeActive(d)} className={chip(rangeActive(d))}>{lb}</button>)}</div>
                    </div>
                    <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('date_from')}</span><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 bg-white/80" dir="ltr" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('date_to')}</span><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 bg-white/80" dir="ltr" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('status')}</span><select value={status} onChange={e => setStatus(e.target.value)} className="border rounded-lg px-2 py-1.5 bg-white/80"><option value="">{t('all')}</option><option value="active">{t('status_active')}</option><option value="expired">{t('status_expired')}</option><option value="revoked">{t('status_revoked')}</option></select></label>
                    <div className="flex items-center gap-2 pb-1 ms-auto">
                        {anyFilter ? <button type="button" onClick={() => { setFrom(''); setTo(''); setStatus(''); setDrill({}); }} className="text-xs text-indigo-700 font-bold underline">{t('clear_filters')}</button> : null}
                        <button type="button" onClick={exportAll} className="flex items-center gap-1.5 bg-white/80 border px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 hover:bg-white"><Icon name="FileSpreadsheet" className="w-4 h-4" /> {t('report_csv_all')}</button>
                    </div>
                </div>
                {(from || to) && <p className="text-[11px] text-slate-500">{from ? formatDate(from, lang) : '…'} ← {to ? formatDate(to, lang) : '…'}</p>}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-slate-500">{t('report_variables')}</span>
                    {fields.length === 0 ? <p className="text-xs text-slate-500">{t('report_no_fields')}</p> : (
                        <div className="flex flex-wrap gap-1.5">{fields.map(f => <button key={f.id} type="button" onClick={() => toggleVar(f.id)} aria-pressed={vars.includes(f.id)} className={chip(vars.includes(f.id))}>{vars.includes(f.id) && <Icon name="Check" className="w-3 h-3 inline -mt-0.5 me-1" />}{f.label}</button>)}</div>
                    )}
                </div>
                {Object.keys(drill).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label={t('report_active_filters')}>
                        <span className="text-[11px] text-slate-500">{t('report_active_filters')}:</span>
                        {Object.entries(drill).map(([fid, key]) => { const f = fieldById(fid); const lbl = key ? (base.find(c => valueKey((c.cardData || {})[fid]) === key)?.cardData[fid] ?? key) : t('report_empty_value'); return (
                            <button key={fid} type="button" onClick={() => pick(fid, key)} className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full ps-3 pe-2 py-1 text-xs font-bold" aria-label={`${t('remove')}: ${f ? f.label : ''} = ${lbl}`}>{f ? f.label : fid}: {String(lbl).trim()} <Icon name="X" className="w-3.5 h-3.5" /></button>
                        ); })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tile(t('report_total'), filtered.length, 'CreditCard', 'text-indigo-600')}
                {tile(t('status_active'), statusCounts.active, 'CircleCheck', 'text-green-600')}
                {tile(t('status_expired'), statusCounts.expired, 'Clock', 'text-amber-600')}
                {tile(t('status_revoked'), statusCounts.revoked, 'Ban', 'text-red-600')}
            </div>

            <section className="glass-strong rounded-2xl p-4 md:p-5" aria-label={t('report_timeline')}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="font-bold text-slate-800">{t('report_timeline')}</h3>
                    <div role="radiogroup" aria-label={t('report_timeline')} className="view-toggle inline-flex bg-slate-100/80 rounded-lg p-0.5">
                        {[['auto', t('report_auto')], ['day', unitNames.day], ['week', unitNames.week], ['month', unitNames.month]].map(([u, lb]) => <button key={u} type="button" role="radio" aria-checked={unitPref === u} onClick={() => setUnitPref(u)} className="px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-600">{lb}{u === 'auto' && unitPref === 'auto' ? ` (${unitNames[timeline.unit]})` : ''}</button>)}
                    </div>
                </div>
                {timeline.buckets.length === 0 ? <p className="text-center text-sm text-slate-400 py-10">{t('no_records')}</p>
                    : <TimelineChart buckets={timeline.buckets} fmt={fmt} t={t} unitLabel={`${t('report_timeline')} (${unitNames[timeline.unit]})`} />}
            </section>

            {vars.length === 0 && fields.length > 0 && <p className="text-center text-sm text-slate-500 glass rounded-2xl p-6">{t('report_pick_vars')}</p>}
            {vars.map(fieldById).filter(Boolean).map(f => {
                // نمودار هر متغیر با فیلترهای «سایر» متغیرها محاسبه می‌شود تا مقدار انتخاب‌شده‌ی خودش در کنار بقیه دیده شود
                const set = base.filter(c => matchesDrill(c, f.id)); const total = set.length;
                const pct = (n) => { if (!total) return fmt('0%'); const p = n / total * 100; const s = p > 0 && p < 1 ? '<1' : String(Math.round(p * 10) / 10); return fa ? `${fmt(s)}٪` : `${s}%`; };
                return <VariableCard key={f.id} field={f} rows={countValues(set, f, t('report_empty_value'))} total={total} fmt={fmt} pct={pct} selectedKey={drill[f.id]} onPick={(k) => pick(f.id, k)} t={t} Icon={Icon} fileBase={fileBase} />;
            })}
        </div>
    );
}
