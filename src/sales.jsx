// مرکز فروش سوپرادمین: سفارش‌ها، درخواست‌های مشاوره، محتوای صفحه‌ی معرفی، پلن‌ها، اتصال‌ها (زرین‌پال، پیامک، ایمیل، بله، ایتا)
// و گزارش ارسال اعلان‌ها. همه‌ی متن‌های این بخش فارسی است (پنل سوپرادمین).
const { useState, useEffect, useMemo } = React;

const ORDER_ST = { pending_payment: ['در انتظار پرداخت', 'bg-amber-50 text-amber-800'], paid: ['پرداخت‌شده', 'bg-sky-50 text-sky-800'], in_progress: ['در حال آماده‌سازی', 'bg-indigo-50 text-indigo-800'], delivered: ['تحویل‌شده', 'bg-emerald-50 text-emerald-800'], cancelled: ['لغو‌شده', 'bg-slate-100 text-slate-600'] };
const LEAD_ST = { new: ['جدید', 'bg-amber-50 text-amber-800'], contacted: ['تماس گرفته شد', 'bg-sky-50 text-sky-800'], won: ['مشتری شد', 'bg-emerald-50 text-emerald-800'], lost: ['منصرف شد', 'bg-slate-100 text-slate-600'] };
const FIELD_T = { text: 'متن', select: 'انتخابی', date: 'تاریخ', photo: 'عکس', number: 'عدد' };
const LANDING_ICON_KEYS = ['layers', 'qr', 'languages', 'cube', 'chart', 'printer', 'shield', 'table', 'badge', 'ticket', 'users', 'school', 'sparkles', 'wand', 'rocket', 'palette', 'zap', 'heart', 'award', 'fingerprint', 'excel', 'mobile', 'lock', 'search', 'verified', 'camera', 'card', 'building', 'globe', 'clock', 'star', 'message'];
const fa = (s) => String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const money = (n) => fa(Number(n || 0).toLocaleString('en-US')).replace(/,/g, '٬');
const dt = (s) => { if (!s) return '—'; try { return new Date(String(s).replace(' ', 'T')).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return s; } };
const inp = 'w-full border rounded-xl px-3 py-2 text-sm bg-white/90 focus:ring-2 focus:ring-indigo-500 outline-none';
const lbl = 'text-xs font-bold text-slate-600 block mb-1';

export function SalesCenter({ kit, onClose, onBuildTenant, onOpenTenant }) {
    const { Icon, useEscape } = kit; useEscape(onClose);
    const [tab, setTab] = useState('orders');
    const tabs = [['orders', 'ShoppingCart', 'سفارش‌ها'], ['leads', 'PhoneCall', 'درخواست‌های مشاوره'], ['landing', 'LayoutTemplate', 'صفحه‌ی معرفی'], ['plans', 'Tags', 'پلن‌ها'], ['integrations', 'Plug', 'اتصال‌ها'], ['log', 'ScrollText', 'گزارش ارسال‌ها']];
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-stretch justify-center sm:p-4">
            <div role="dialog" aria-modal="true" aria-label="فروش و صفحه‌ی معرفی" className="glass-strong sm:rounded-3xl w-full max-w-7xl flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 me-auto"><Icon name="Store" className="w-5 h-5" /> فروش و صفحه‌ی معرفی</h2>
                    <a href="./" target="_blank" rel="noopener" className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl flex items-center gap-1.5"><Icon name="ExternalLink" className="w-4 h-4" /> مشاهده‌ی صفحه</a>
                    <button onClick={onClose} aria-label="بستن" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-4 h-4" /></button>
                </div>
                <div role="tablist" aria-label="بخش‌های فروش" className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0">
                    {tabs.map(([k, ic, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold shrink-0 ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon name={ic} className="w-4 h-4" /> {l}</button>)}
                </div>
                <div className="flex-1 overflow-y-auto p-4 sm:p-6" role="tabpanel">
                    {tab === 'orders' && <OrdersTab kit={kit} onBuildTenant={onBuildTenant} onOpenTenant={onOpenTenant} />}
                    {tab === 'leads' && <LeadsTab kit={kit} />}
                    {tab === 'landing' && <LandingTab kit={kit} />}
                    {tab === 'plans' && <PlansTab kit={kit} />}
                    {tab === 'integrations' && <IntegrationsTab kit={kit} />}
                    {tab === 'log' && <LogTab kit={kit} />}
                </div>
            </div>
        </div>
    );
}

// ---------------- سفارش‌ها ----------------
function OrdersTab({ kit, onBuildTenant, onOpenTenant }) {
    const { apiGet, apiPost, Icon, notifyError, notifySuccess, askConfirm } = kit;
    const [list, setList] = useState(null); const [filter, setFilter] = useState('active'); const [q, setQ] = useState(''); const [openId, setOpenId] = useState(null);
    const touched = React.useRef(false);
    const load = () => apiGet('sales_orders').then(l => { setList(l); if (!touched.current) { touched.current = true; const a = (l || []).filter(o => ['paid', 'in_progress'].includes(o.status)).length; if (!a) setFilter((l || []).some(o => o.status === 'pending_payment') ? 'pending_payment' : 'all'); } }).catch(notifyError);
    useEffect(() => { load(); }, []);
    const shown = (list || []).filter(o => (filter === 'all' || (filter === 'active' ? ['paid', 'in_progress'].includes(o.status) : o.status === filter))
        && (!q || `${o.code} ${o.mobile} ${(o.data.org || {}).name || ''} ${(o.data.applicant || {}).name || ''}`.includes(q.trim())));
    const open = list && list.find(o => o.id === openId);
    const counts = useMemo(() => { const c = {}; (list || []).forEach(o => { c[o.status] = (c[o.status] || 0) + 1; }); c.active = (c.paid || 0) + (c.in_progress || 0); c.all = (list || []).length; return c; }, [list]);
    if (open) return <OrderDetail kit={kit} order={open} onBack={() => setOpenId(null)} onChanged={load} onBuildTenant={onBuildTenant} onOpenTenant={onOpenTenant} />;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
                {[['active', 'نیازمند اقدام'], ['pending_payment', 'در انتظار پرداخت'], ['delivered', 'تحویل‌شده'], ['cancelled', 'لغو‌شده'], ['all', 'همه']].map(([k, l]) => <button key={k} onClick={() => { touched.current = true; setFilter(k); }} aria-pressed={filter === k} className={`px-3 py-1.5 rounded-full text-sm font-bold border ${filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/70 text-slate-600'}`}>{l} <span className="opacity-70">{fa(counts[k] || 0)}</span></button>)}
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="جستجو: کد، موبایل، نام…" aria-label="جستجوی سفارش" className={`${inp} max-w-xs ms-auto`} />
            </div>
            {!list ? <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p> : shown.length === 0 ? <div className="text-center text-slate-600 py-10 bg-white/50 rounded-2xl space-y-3"><p className="font-bold">{filter === 'active' ? 'سفارشی که نیاز به اقدام داشته باشد نیست.' : 'سفارشی در این دسته نیست.'}</p>{(list || []).length > 0 && filter !== 'all' && <button type="button" onClick={() => setFilter('all')} className="text-sm font-bold text-indigo-700 underline">نمایش همه‌ی سفارش‌ها ({(list || []).length})</button>}</div> : (
                <div className="overflow-x-auto bg-white/70 rounded-2xl border">
                    <table className="w-full text-sm stack-table">
                        <thead className="bg-slate-50 text-slate-600"><tr>{['کد', 'سازمان', 'درخواست‌دهنده', 'پلن', 'مبلغ', 'وضعیت', 'تاریخ', ''].map((h, i) => <th key={i} className="p-3 text-start font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
                        <tbody>{shown.map(o => (
                            <tr key={o.id} className="border-t hover:bg-indigo-50/40 cursor-pointer" onClick={() => setOpenId(o.id)}>
                                <td className="p-3 font-mono font-bold" data-label="کد">{fa(o.code)}{o.type === 'renewal' && <span className="ms-1 text-[10px] bg-violet-50 text-violet-700 rounded-full px-1.5">تمدید</span>}</td>
                                <td className="p-3 font-bold" data-label="سازمان">{(o.data.org || {}).name}</td>
                                <td className="p-3" data-label="درخواست‌دهنده">{(o.data.applicant || {}).name} <span className="text-slate-500 text-xs" dir="ltr">{fa(o.mobile)}</span></td>
                                <td className="p-3" data-label="پلن">{(o.plan.name || {}).fa}</td>
                                <td className="p-3 whitespace-nowrap" data-label="مبلغ">{money(o.amount)}</td>
                                <td className="p-3" data-label="وضعیت"><span className={`text-xs font-bold rounded-full px-2 py-1 ${ORDER_ST[o.status][1]}`}>{ORDER_ST[o.status][0]}</span></td>
                                <td className="p-3 whitespace-nowrap text-xs text-slate-500" data-label="تاریخ">{dt(o.paid_at || o.created_at)}</td>
                                <td className="p-3"><Icon name="ChevronLeft" className="w-4 h-4 text-slate-400" /></td>
                            </tr>))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function OrderDetail({ kit, order: o, onBack, onChanged, onBuildTenant, onOpenTenant }) {
    const { apiPost, Icon, notifyError, notifySuccess, askConfirm } = kit;
    const d = o.data; const [status, setStatus] = useState(o.status); const [note, setNote] = useState(o.admin_note || ''); const [notifyCustomer, setNotifyCustomer] = useState(true); const [busy, setBusy] = useState(false);
    const save = async () => { setBusy(true); try { await apiPost('sales_order_update', { id: o.id, status, note, notifyCustomer }); notifySuccess('سفارش به‌روز شد.'); onChanged(); } catch (e) { notifyError(e); } setBusy(false); };
    const del = async () => { if (!(await askConfirm(`سفارش ${fa(o.code)} حذف شود؟`, { danger: true, okText: 'حذف' }))) return; try { await apiPost('sales_order_delete', { id: o.id }); onChanged(); onBack(); } catch (e) { notifyError(e); } };
    const build = async () => { setBusy(true); try { if (o.status === 'paid') await apiPost('sales_order_update', { id: o.id, status: 'in_progress', note, notifyCustomer }); await onBuildTenant(o); } catch (e) { notifyError(e); } setBusy(false); };
    const row = (k, v) => v ? <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100"><span className="text-slate-500">{k}</span><span className="font-bold text-slate-800 text-end break-all">{v}</span></div> : null;
    return (
        <div className="space-y-5">
            <button onClick={onBack} className="text-sm font-bold text-slate-600 flex items-center gap-1"><Icon name="ArrowRight" className="w-4 h-4" /> بازگشت به فهرست</button>
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-black text-slate-800 me-auto">سفارش {fa(o.code)} — {(d.org || {}).name}</h3>
                <span className={`text-sm font-bold rounded-full px-3 py-1 ${ORDER_ST[o.status][1]}`}>{ORDER_ST[o.status][0]}</span>
            </div>
            {o.type === 'new' && ['paid', 'in_progress'].includes(o.status) && !o.tenant_id && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-indigo-900 me-auto">سازمان را از روی این سفارش بسازید: نام، لوگو، طرح‌ها، فیلدها و قانون تغییر طرح بر اساس «{d.variantField || 'رده'}» خودکار پر می‌شود. پس از انتشار، لینک و رمزها برای مشتری پیامک و ایمیل می‌شود.</p>
                    <button onClick={build} disabled={busy} className="btn-grad px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"><Icon name="Wand2" className="w-4 h-4" /> ساخت سازمان از این سفارش</button>
                </div>
            )}
            {o.tenant_id && <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center gap-3 text-sm"><span className="me-auto text-emerald-900">سازمان: <b>{o.tenantName || o.tenant_id}</b></span>{o.tenantLink && <a href={o.tenantLink} target="_blank" rel="noopener" className="font-bold text-emerald-800 underline">لینک سامانه</a>}<button onClick={() => onOpenTenant(o.tenant_id)} className="font-bold text-emerald-800 underline">ویرایش سازمان</button></div>}
            <div className="grid lg:grid-cols-3 gap-4">
                <section className="bg-white/70 border rounded-2xl p-4 text-sm"><h4 className="font-bold mb-2 text-slate-700">درخواست‌دهنده</h4>
                    {row('نام', (d.applicant || {}).name)}{row('موبایل', <a href={`tel:${o.mobile}`} dir="ltr">{fa(o.mobile)}</a>)}{row('ایمیل', (d.applicant || {}).email)}{row('سمت', (d.applicant || {}).role)}{row('کد ملی', (d.applicant || {}).nationalId)}{row('زبان صفحه', d.lang === 'en' ? 'English' : 'فارسی')}</section>
                <section className="bg-white/70 border rounded-2xl p-4 text-sm"><h4 className="font-bold mb-2 text-slate-700">سازمان</h4>
                    {(d.org || {}).logo && <img src={d.org.logo} alt="لوگو" className="h-14 object-contain mb-2" />}
                    {row('نام', (d.org || {}).name)}{row('تلفن', (d.org || {}).phone)}{row('وب‌سایت', (d.org || {}).website)}{row('نشانی', (d.org || {}).address)}{row('زبان فرم', { fa: 'فارسی', en: 'English', ar: 'العربية', tr: 'Türkçe' }[(d.org || {}).cardLang])}</section>
                <section className="bg-white/70 border rounded-2xl p-4 text-sm"><h4 className="font-bold mb-2 text-slate-700">پلن و پرداخت</h4>
                    {row('پلن', (o.plan.name || {}).fa)}{row('مبلغ', `${money(o.amount)} تومان`)}{row('سقف کارت', o.plan.cardLimit ? fa(o.plan.cardLimit) : 'نامحدود')}{row('مدت', o.plan.durationDays ? `${fa(o.plan.durationDays)} روز` : 'نامحدود')}{row('ثبت', dt(o.created_at))}{row('پرداخت', dt(o.paid_at))}{row('کد پیگیری', o.payment.refId && fa(o.payment.refId))}{row('کارت', o.payment.cardPan && <span dir="ltr">{o.payment.cardPan}</span>)}{row('تحویل', dt(o.delivered_at))}</section>
            </div>
            {o.type === 'new' && (<>
                <section className="bg-white/70 border rounded-2xl p-4">
                    <h4 className="font-bold mb-3 text-slate-700">طرح‌های کارت ({d.layout === 'single' ? 'یک‌رو' : 'دورو'}){d.variantField && <span className="font-normal text-sm text-slate-500"> — بر اساس «{d.variantField}»</span>}</h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{(d.variants || []).map((v, i) => (
                        <div key={i} className="border rounded-xl p-3 bg-white">
                            {v.name && <p className="font-bold text-sm mb-2">{v.name}</p>}
                            <div className="flex gap-2">{[['روی', v.front], ['پشت', v.back]].filter(x => x[1]).map(([k, u]) => <a key={k} href={u} target="_blank" rel="noopener" download className="flex-1 group"><img src={u} alt={`${k} ${v.name}`} className="w-full aspect-[1.586] object-cover rounded-lg border" /><span className="text-[11px] text-slate-500 group-hover:text-indigo-700 flex items-center gap-1 mt-1"><Icon name="Download" className="w-3 h-3" /> {k}</span></a>)}</div>
                        </div>))}</div>
                </section>
                <section className="bg-white/70 border rounded-2xl p-4">
                    <h4 className="font-bold mb-3 text-slate-700">فیلدهای فرم</h4>
                    <table className="w-full text-sm"><thead className="text-slate-500"><tr><th className="text-start p-1.5">عنوان</th><th className="text-start p-1.5">نوع</th><th className="text-start p-1.5">الزامی</th><th className="text-start p-1.5">روی کارت</th><th className="text-start p-1.5">گزینه‌ها</th></tr></thead>
                        <tbody>{(d.fields || []).map((f, i) => <tr key={i} className="border-t"><td className="p-1.5 font-bold">{f.label}</td><td className="p-1.5">{FIELD_T[f.type] || f.type}</td><td className="p-1.5">{f.required ? '✓' : '—'}</td><td className="p-1.5">{f.onCard ? '✓' : '—'}</td><td className="p-1.5 text-xs text-slate-500">{(f.options || []).join('، ')}</td></tr>)}</tbody></table>
                    {d.notes && <p className="mt-3 text-sm bg-amber-50 border border-amber-100 rounded-xl p-3 whitespace-pre-line"><b>توضیحات مشتری:</b> {d.notes}</p>}
                </section>
            </>)}
            <section className="bg-white/70 border rounded-2xl p-4 grid sm:grid-cols-[220px_1fr] gap-4 items-start">
                <div><label className={lbl} htmlFor="o-status">وضعیت</label><select id="o-status" value={status} onChange={e => setStatus(e.target.value)} className={inp}>{Object.entries(ORDER_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                    {status === 'in_progress' && status !== o.status && <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer"><input type="checkbox" checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)} className="accent-indigo-600" /> به مشتری پیامک شود</label>}</div>
                <div><label className={lbl} htmlFor="o-note">یادداشت داخلی (فقط برای شما)</label><textarea id="o-note" rows={3} value={note} onChange={e => setNote(e.target.value)} className={inp} /></div>
                <div className="sm:col-span-2 flex flex-wrap gap-2"><button onClick={save} disabled={busy} className="btn-grad px-5 py-2 rounded-xl font-bold">ذخیره</button>{['pending_payment', 'cancelled'].includes(o.status) && <button onClick={del} className="px-4 py-2 rounded-xl font-bold text-red-600 hover:bg-red-50">حذف سفارش</button>}</div>
            </section>
        </div>
    );
}

// ---------------- درخواست‌های مشاوره ----------------
function LeadsTab({ kit }) {
    const { apiGet, apiPost, Icon, notifyError, notifySuccess, askConfirm } = kit;
    const [list, setList] = useState(null); const [filter, setFilter] = useState('new');
    const load = () => apiGet('sales_leads').then(setList).catch(notifyError);
    useEffect(() => { load(); }, []);
    const upd = async (l, patch) => { const n = { ...l, ...patch }; setList(ls => ls.map(x => x.id === l.id ? n : x)); try { await apiPost('sales_lead_update', { id: l.id, status: n.status, note: n.note || '' }); } catch (e) { notifyError(e); } };
    const del = async (l) => { if (!(await askConfirm(`درخواست «${l.name}» حذف شود؟`, { danger: true, okText: 'حذف' }))) return; try { await apiPost('sales_lead_delete', { id: l.id }); setList(ls => ls.filter(x => x.id !== l.id)); } catch (e) { notifyError(e); } };
    const shown = (list || []).filter(l => filter === 'all' || l.status === filter);
    const wa = (m) => `https://wa.me/98${String(m).replace(/^0/, '')}`;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">{[...Object.entries(LEAD_ST).map(([k, [l]]) => [k, l]), ['all', 'همه']].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`px-3 py-1.5 rounded-full text-sm font-bold border ${filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/70 text-slate-600'}`}>{l} <span className="opacity-70">{fa((list || []).filter(x => k === 'all' || x.status === k).length)}</span></button>)}</div>
            {!list ? <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p> : shown.length === 0 ? <p className="text-center text-slate-500 py-10 bg-white/50 rounded-2xl">درخواستی نیست.</p> : (
                <div className="grid lg:grid-cols-2 gap-3">{shown.map(l => (
                    <div key={l.id} className="bg-white/80 border rounded-2xl p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2"><b className="text-slate-800">{l.name}</b>{l.org && <span className="text-sm text-slate-500">— {l.org}</span>}<span className="ms-auto text-xs text-slate-500">{dt(l.created_at)}</span></div>
                        <div className="flex flex-wrap gap-2 text-sm"><a href={`tel:${l.mobile}`} className="font-bold text-indigo-700 flex items-center gap-1" dir="ltr"><Icon name="Phone" className="w-3.5 h-3.5" /> {fa(l.mobile)}</a><a href={wa(l.mobile)} target="_blank" rel="noopener" className="text-emerald-700 font-bold">واتس‌اپ</a>{l.email && <a href={`mailto:${l.email}`} className="text-slate-600" dir="ltr">{l.email}</a>}{l.cards && <span className="text-slate-500">تعداد کارت: {l.cards}</span>}{l.lang === 'en' && <span className="text-xs bg-slate-100 rounded px-1.5">EN</span>}</div>
                        {l.message && <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-2.5 whitespace-pre-line">{l.message}</p>}
                        <div className="flex flex-wrap gap-2 items-center"><select value={l.status} onChange={e => upd(l, { status: e.target.value })} aria-label="وضعیت" className={`${inp} w-auto`}>{Object.entries(LEAD_ST).map(([k, [lb]]) => <option key={k} value={k}>{lb}</option>)}</select>
                            <input defaultValue={l.note || ''} onBlur={e => e.target.value !== (l.note || '') && upd(l, { note: e.target.value })} placeholder="یادداشت…" aria-label="یادداشت" className={`${inp} flex-1 min-w-[140px]`} />
                            <button onClick={() => del(l)} aria-label="حذف" className="p-2 rounded-lg text-red-600 hover:bg-red-50"><Icon name="Trash2" className="w-4 h-4" /></button></div>
                    </div>))}</div>
            )}
        </div>
    );
}

// ---------------- ویرایشگر فهرست ساده ----------------
function ListEditor({ kit, items, proto, onChange, renderItem, addLabel = 'افزودن' }) {
    const { Icon } = kit;
    const move = (i, dir) => { const a = [...items]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
    return (
        <div className="space-y-2">
            {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-start bg-white/60 border rounded-xl p-2">
                    <div className="flex-1 min-w-0">{renderItem(it, (v) => onChange(items.map((x, j) => j === i ? v : x)), i)}</div>
                    <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="بالا" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><Icon name="ArrowUp" className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="پایین" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><Icon name="ArrowDown" className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="حذف" className="p-1 rounded text-red-600 hover:bg-red-50"><Icon name="Trash2" className="w-3.5 h-3.5" /></button>
                    </div>
                </div>
            ))}
            <button type="button" onClick={() => onChange([...items, typeof proto === 'object' ? { ...proto } : proto])} className="text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl px-3 py-1.5">+ {addLabel}</button>
        </div>
    );
}

// اجزای ثابت (بیرون از رندر تعریف می‌شوند تا ورودی‌ها با هر تایپ دوباره ساخته نشوند و فوکوس از دست نرود)
function Sec({ title, children, hint }) { return <section className="bg-white/60 border rounded-2xl p-4 space-y-3"><h4 className="font-bold text-slate-800">{title}</h4>{hint && <p className="text-xs text-slate-500 -mt-2">{hint}</p>}{children}</section>; }
function IconPick({ value, onChange }) { return <select value={value} onChange={e => onChange(e.target.value)} aria-label="آیکون" className={`${inp} w-32`}>{LANDING_ICON_KEYS.map(k => <option key={k} value={k}>{k}</option>)}</select>; }
function Card({ Icon, title, icon, children, hint }) { return <section className="bg-white/70 border rounded-2xl p-4 space-y-3"><h4 className="font-bold text-slate-800 flex items-center gap-2"><Icon name={icon} className="w-4 h-4" /> {title}</h4>{hint && <p className="text-xs text-slate-500 -mt-1 leading-6">{hint}</p>}{children}</section>; }
function TestBox({ channel, placeholder, label = 'آزمایش', state, onTest }) {
    const [target, setTarget] = useState('');
    return (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 rounded-xl p-2">{placeholder !== null && <input value={target} onChange={e => setTarget(e.target.value)} placeholder={placeholder} dir="ltr" aria-label={`گیرنده‌ی آزمایش ${channel}`} className={`${inp} flex-1 min-w-[150px] text-left`} />}<button type="button" onClick={() => onTest(channel, target)} disabled={state && state.busy} className="px-3 py-2 rounded-lg bg-white border font-bold text-sm">{state && state.busy ? '…' : label}</button>{state && !state.busy && <span role="status" className={`text-xs font-bold ${state.ok ? 'text-emerald-700' : 'text-red-600'}`}>{state.msg}</span>}</div>
    );
}

// ---------------- محتوای صفحه‌ی معرفی ----------------
function LandingTab({ kit }) {
    const { apiGet, apiPost, Icon, notifyError, notifySuccess, uploadImageFile, askConfirm } = kit;
    const [data, setData] = useState(null); const [lang, setLang] = useState('fa'); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false);
    useEffect(() => { apiGet('sales_settings').then(r => setData(r.landing)).catch(notifyError); }, []);
    if (!data) return <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p>;
    const L = data[lang]; const C = data.common;
    const setL = (k, v) => { setData(d => ({ ...d, [lang]: { ...d[lang], [k]: v } })); setDirty(true); };
    const setC = (k, v) => { setData(d => ({ ...d, common: { ...d.common, [k]: v } })); setDirty(true); };
    const save = async () => { setSaving(true); try { const r = await apiPost('save_landing', { landing: data }); setData(r.landing); setDirty(false); notifySuccess('صفحه‌ی معرفی ذخیره شد.'); } catch (e) { notifyError(e); } setSaving(false); };
    const dir = lang === 'fa' ? 'rtl' : 'ltr';
    // متن‌های جدید پیش‌فرض سامانه (مثل امکانات تازه) روی محتوای قبلاً ذخیره‌شده اثر نمی‌گذارند؛ با این دکمه‌ها هر بخش به پیش‌فرض به‌روز برمی‌گردد (تا «ذخیره» نزنید اعمال نمی‌شود)
    const resetSection = async (keys, name) => {
        if (askConfirm && !(await askConfirm(`بخش «${name}» (${lang === 'fa' ? 'فارسی' : 'English'}) به متن پیش‌فرض به‌روز برگردد؟ تغییرات سفارشی همین بخش از بین می‌رود، ولی تا «ذخیره» نزنید اعمال نمی‌شود.`, { okText: 'بازگردانی' }))) return;
        try { const d = await apiGet('landing_defaults'); setData(o => ({ ...o, [lang]: { ...o[lang], ...Object.fromEntries(keys.map(k => [k, d[lang][k]])) } })); setDirty(true); } catch (e) { notifyError(e); }
    };
    const text = (k, label, opts = {}) => <div className={opts.wide ? 'sm:col-span-2' : ''}><label className={lbl} htmlFor={`lt-${k}`}>{label}</label>{opts.area ? <textarea id={`lt-${k}`} rows={opts.rows || 3} dir={dir} value={L[k]} onChange={e => setL(k, e.target.value)} className={inp} /> : <input id={`lt-${k}`} dir={dir} value={L[k]} onChange={e => setL(k, e.target.value)} className={inp} />}</div>;
    const ctext = (k, label, opts = {}) => <div><label className={lbl} htmlFor={`lc-${k}`}>{label}</label><input id={`lc-${k}`} dir={opts.dir || 'ltr'} value={C[k]} onChange={e => setC(k, e.target.value)} placeholder={opts.ph} className={`${inp} ${opts.dir === 'rtl' ? '' : 'text-left'}`} /></div>;
    const upload = async (file, cb) => { if (!file) return; const url = await uploadImageFile(file, { keepTransparency: true, maxSize: 1200 }); if (url) cb(url); };
    return (
        <div className="space-y-4">
            <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 py-3 bg-white/80 backdrop-blur border-b flex flex-wrap gap-2 items-center">
                <div role="tablist" aria-label="زبان محتوا" className="flex gap-1 bg-slate-100 rounded-xl p-1">{[['fa', 'فارسی'], ['en', 'English']].map(([k, l]) => <button key={k} role="tab" aria-selected={lang === k} onClick={() => setLang(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${lang === k ? 'bg-white shadow text-indigo-700' : 'text-slate-600'}`}>{l}</button>)}</div>
                <span className="text-xs text-slate-500">متن‌های هر زبان جداست؛ تنظیمات مشترک (تماس، اینماد، نمایش بخش‌ها) پایین صفحه است.</span>
                <details className="relative"><summary className="cursor-pointer text-xs font-bold text-indigo-700 select-none px-2 py-1.5 rounded-lg bg-indigo-50">متن پیش‌فرض جدید ▾</summary><div className="absolute z-20 mt-1 p-2 glass-strong rounded-xl shadow-xl flex flex-col gap-1 min-w-[200px]">{[[['features', 'featuresTitle', 'featuresSubtitle'], 'امکانات'], [['steps', 'stepsTitle'], 'مراحل کار'], [['faq', 'faqTitle'], 'سؤالات متداول']].map(([ks, nm]) => <button key={nm} type="button" onClick={() => resetSection(ks, nm)} className="text-start text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-50">بازگرداندن «{nm}»</button>)}</div></details>
                <button onClick={save} disabled={saving || !dirty} className="ms-auto btn-grad px-5 py-2 rounded-xl font-bold">{saving ? 'در حال ذخیره…' : dirty ? 'ذخیره‌ی تغییرات' : 'ذخیره شد'}</button>
            </div>
            <div className="grid xl:grid-cols-2 gap-4" dir="rtl">
                <Sec title="جست‌وجوی گوگل و اشتراک‌گذاری" hint="عنوان و توضیحی که در نتایج گوگل و پیش‌نمایش لینک در پیام‌رسان‌ها دیده می‌شود.">{text('seoTitle', 'عنوان صفحه')}{text('seoDescription', 'توضیح کوتاه (حدود ۱۶۰ نویسه)', { area: true, rows: 2 })}</Sec>
                <Sec title="بالای صفحه">{text('heroBadge', 'برچسب کوچک')}{text('heroTitle', 'تیتر اصلی')}{text('heroSubtitle', 'توضیح زیر تیتر', { area: true })}<div className="grid sm:grid-cols-2 gap-3">{text('ctaPrimary', 'دکمه‌ی اصلی')}{text('ctaSecondary', 'دکمه‌ی دوم (دمو)')}</div></Sec>
                <Sec title="مشکل و راه‌حل">{text('problemTitle', 'عنوان')}<div className="grid sm:grid-cols-2 gap-3"><div><span className={lbl}>امروز (مشکلات)</span><ListEditor kit={kit} items={L.problemItems} proto="" onChange={v => setL('problemItems', v)} renderItem={(it, set) => <input dir={dir} value={it} onChange={e => set(e.target.value)} className={inp} />} /></div><div><span className={lbl}>با این سامانه</span><ListEditor kit={kit} items={L.solutionItems} proto="" onChange={v => setL('solutionItems', v)} renderItem={(it, set) => <input dir={dir} value={it} onChange={e => set(e.target.value)} className={inp} />} /></div></div></Sec>
                <Sec title="مراحل کار">{text('stepsTitle', 'عنوان')}<ListEditor kit={kit} items={L.steps} proto={{ title: '', text: '' }} onChange={v => setL('steps', v)} renderItem={(it, set) => <div className="space-y-1.5"><input dir={dir} value={it.title} onChange={e => set({ ...it, title: e.target.value })} placeholder="عنوان" className={inp} /><textarea dir={dir} rows={2} value={it.text} onChange={e => set({ ...it, text: e.target.value })} placeholder="توضیح" className={inp} /></div>} /></Sec>
                <Sec title="امکانات">{text('featuresTitle', 'عنوان')}{text('featuresSubtitle', 'زیرعنوان')}<ListEditor kit={kit} items={L.features} proto={{ icon: 'sparkles', title: '', text: '' }} onChange={v => setL('features', v)} renderItem={(it, set) => <div className="space-y-1.5"><div className="flex gap-2"><IconPick value={it.icon} onChange={v => set({ ...it, icon: v })} /><input dir={dir} value={it.title} onChange={e => set({ ...it, title: e.target.value })} placeholder="عنوان" className={inp} /></div><textarea dir={dir} rows={2} value={it.text} onChange={e => set({ ...it, text: e.target.value })} placeholder="توضیح" className={inp} /></div>} /></Sec>
                <Sec title="کاربردها">{text('useCasesTitle', 'عنوان')}<ListEditor kit={kit} items={L.useCases} proto={{ icon: 'badge', title: '', text: '' }} onChange={v => setL('useCases', v)} renderItem={(it, set) => <div className="space-y-1.5"><div className="flex gap-2"><IconPick value={it.icon} onChange={v => set({ ...it, icon: v })} /><input dir={dir} value={it.title} onChange={e => set({ ...it, title: e.target.value })} placeholder="عنوان" className={inp} /></div><input dir={dir} value={it.text} onChange={e => set({ ...it, text: e.target.value })} placeholder="توضیح" className={inp} /></div>} /></Sec>
                <Sec title="دموی زنده">{text('demoTitle', 'عنوان')}{text('demoText', 'توضیح', { area: true, rows: 2 })}</Sec>
                <Sec title="نظر مشتریان" hint="اگر خالی باشد، این بخش نمایش داده نمی‌شود. فقط نظرهای واقعی را وارد کنید.">{text('testimonialsTitle', 'عنوان')}<ListEditor kit={kit} items={L.testimonials} proto={{ name: '', role: '', text: '' }} onChange={v => setL('testimonials', v)} renderItem={(it, set) => <div className="space-y-1.5"><div className="flex gap-2"><input dir={dir} value={it.name} onChange={e => set({ ...it, name: e.target.value })} placeholder="نام" className={inp} /><input dir={dir} value={it.role} onChange={e => set({ ...it, role: e.target.value })} placeholder="سمت / سازمان" className={inp} /></div><textarea dir={dir} rows={2} value={it.text} onChange={e => set({ ...it, text: e.target.value })} placeholder="متن نظر" className={inp} /></div>} /></Sec>
                <Sec title="قیمت‌ها" hint="خود پلن‌ها در زبانه‌ی «پلن‌ها» تعریف می‌شوند.">{text('pricingTitle', 'عنوان')}{text('pricingSubtitle', 'زیرعنوان')}{text('pricingNote', 'یادداشت زیر جدول')}</Sec>
                <Sec title="سؤالات متداول">{text('faqTitle', 'عنوان')}<ListEditor kit={kit} items={L.faq} proto={{ q: '', a: '' }} onChange={v => setL('faq', v)} renderItem={(it, set) => <div className="space-y-1.5"><input dir={dir} value={it.q} onChange={e => set({ ...it, q: e.target.value })} placeholder="سؤال" className={inp} /><textarea dir={dir} rows={2} value={it.a} onChange={e => set({ ...it, a: e.target.value })} placeholder="پاسخ" className={inp} /></div>} /></Sec>
                <Sec title="دعوت پایانی و فرم مشاوره">{text('ctaBandTitle', 'تیتر')}{text('ctaBandText', 'متن')}{text('contactTitle', 'عنوان فرم')}{text('contactText', 'توضیح فرم', { area: true, rows: 2 })}</Sec>
                <Sec title="صفحه‌های قوانین، حریم خصوصی و تماس" hint="برای اینماد لازم است. بین پاراگراف‌ها یک خط خالی بگذارید.">{text('termsText', 'قوانین و مقررات', { area: true, rows: 8 })}{text('privacyText', 'حریم خصوصی', { area: true, rows: 6 })}{text('aboutText', 'متن صفحه‌ی تماس با ما', { area: true, rows: 3 })}</Sec>
            </div>
            <h3 className="font-black text-slate-800 pt-4">تنظیمات مشترک (هر دو زبان)</h3>
            <div className="grid xl:grid-cols-2 gap-4">
                <Sec title="نمایش بخش‌ها">{[['showPricing', 'نمایش قیمت‌ها و دکمه‌ی سفارش آنلاین'], ['demoEnabled', 'نمایش دموی زنده‌ی ساخت کارت'], ['showEnglish', 'نسخه‌ی انگلیسی صفحه (/en)']].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={!!C[k]} onChange={e => setC(k, e.target.checked)} className="accent-indigo-600 w-4 h-4" /> {l}</label>)}</Sec>
                <Sec title="راه‌های ارتباطی" hint="هرکدام خالی بماند نمایش داده نمی‌شود. برای پیام‌رسان‌ها شناسه (مثل @asva) یا لینک کامل بنویسید."><div className="grid sm:grid-cols-2 gap-3">{ctext('phone', 'تلفن')}{ctext('email', 'ایمیل')}{ctext('telegram', 'تلگرام')}{ctext('whatsapp', 'واتس‌اپ (شماره)')}{ctext('bale', 'بله')}{ctext('eitaa', 'ایتا')}{ctext('instagram', 'اینستاگرام')}{ctext('address', 'نشانی', { dir: 'rtl' })}</div></Sec>
                <Sec title="نماد اعتماد الکترونیکی (اینماد)" hint="از کد نماد، عدد بعد از id= و رشته‌ی بعد از Code= را وارد کنید."><div className="grid sm:grid-cols-2 gap-3">{ctext('enamadId', 'id')}{ctext('enamadCode', 'Code')}</div></Sec>
                <Sec title="تصویر اشتراک‌گذاری لینک" hint="تصویر افقی (حدود ۱۲۰۰×۶۳۰) که در تلگرام، واتس‌اپ و… کنار لینک دیده می‌شود.">
                    <div className="flex items-center gap-3">{C.ogImage && <img src={C.ogImage} alt="" className="h-16 rounded-lg border" />}<label className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm cursor-pointer">آپلود<input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files[0]; e.target.value = ''; upload(f, u => setC('ogImage', u)); }} /></label>{C.ogImage && <button onClick={() => setC('ogImage', '')} className="text-sm text-slate-500 underline">حذف</button>}</div></Sec>
                <Sec title="مشتریان (لوگوها)" hint="اگر خالی باشد، نمایش داده نمی‌شود.">
                    <ListEditor kit={kit} items={C.customers} proto={{ name: '', logoUrl: '' }} onChange={v => setC('customers', v)} addLabel="افزودن مشتری" renderItem={(it, set) => <div className="flex gap-2 items-center">{it.logoUrl ? <img src={it.logoUrl} alt="" className="w-10 h-10 object-contain" /> : <span className="w-10 h-10 rounded bg-slate-100" />}<input value={it.name} onChange={e => set({ ...it, name: e.target.value })} placeholder="نام" className={inp} /><label className="px-2 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold cursor-pointer shrink-0">لوگو<input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files[0]; e.target.value = ''; upload(f, u => set({ ...it, logoUrl: u })); }} /></label></div>} /></Sec>
            </div>
        </div>
    );
}

// ---------------- پلن‌ها ----------------
function PlansTab({ kit }) {
    const { apiGet, apiPost, Icon, notifyError, notifySuccess } = kit;
    const [plans, setPlans] = useState(null); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [err, setErr] = useState('');
    useEffect(() => { apiGet('sales_settings').then(r => setPlans(r.plans.map(p => ({ ...p, featuresText: { fa: p.features.fa.join('\n'), en: p.features.en.join('\n') } })))).catch(notifyError); }, []);
    if (!plans) return <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p>;
    const upd = (i, patch) => { setPlans(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p)); setDirty(true); setErr(''); };
    const updLoc = (i, k, l, v) => upd(i, { [k]: { ...plans[i][k], [l]: v } });
    const save = async () => {
        setSaving(true);
        try { const r = await apiPost('save_plans', { plans: plans.map(p => ({ ...p, features: { fa: p.featuresText.fa.split('\n'), en: p.featuresText.en.split('\n') } })) }); setPlans(r.plans.map(p => ({ ...p, featuresText: { fa: p.features.fa.join('\n'), en: p.features.en.join('\n') } }))); setDirty(false); notifySuccess('پلن‌ها ذخیره شد.'); }
        catch (e) { setErr(e.message); notifyError(e); }
        setSaving(false);
    };
    const move = (i, dir) => { const a = [...plans]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setPlans(a); setDirty(true); };
    const num = (i, k, label, hint) => <div><label className={lbl} htmlFor={`p-${i}-${k}`}>{label}</label><input id={`p-${i}-${k}`} type="number" min="0" dir="ltr" value={plans[i][k]} onChange={e => upd(i, { [k]: Math.max(0, parseInt(e.target.value, 10) || 0) })} className={`${inp} text-center`} />{hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}</div>;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-slate-600 me-auto">قیمت به تومان است. پلنی که قیمتش صفر باشد با دکمه‌ی «تماس بگیرید» نمایش داده می‌شود و آنلاین سفارش داده نمی‌شود.</p>
                <button onClick={() => { setPlans(ps => [...ps, { id: '', active: true, highlight: false, name: { fa: '', en: '' }, desc: { fa: '', en: '' }, price: 0, cardLimit: 100, durationDays: 365, maxVariants: 1, features: { fa: [], en: [] }, featuresText: { fa: '', en: '' } }]); setDirty(true); }} className="px-4 py-2 rounded-xl font-bold bg-indigo-50 text-indigo-700">+ پلن جدید</button>
                <button onClick={save} disabled={saving || !dirty} className="btn-grad px-5 py-2 rounded-xl font-bold">{saving ? 'در حال ذخیره…' : dirty ? 'ذخیره' : 'ذخیره شد'}</button></div>
            {err && <p role="alert" className="text-sm text-red-600 font-bold">{err}</p>}
            <div className="grid xl:grid-cols-2 gap-4">{plans.map((p, i) => (
                <div key={i} className={`bg-white/70 border-2 rounded-2xl p-4 space-y-3 ${p.highlight ? 'border-indigo-300' : 'border-transparent'} ${p.active ? '' : 'opacity-60'}`}>
                    <div className="flex items-center gap-2"><b className="me-auto text-slate-800">پلن {fa(i + 1)}{p.name.fa && ` — ${p.name.fa}`}</b>
                        <label className="text-xs font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={p.active} onChange={e => upd(i, { active: e.target.checked })} className="accent-indigo-600" /> فعال</label>
                        <label className="text-xs font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={p.highlight} onChange={e => upd(i, { highlight: e.target.checked })} className="accent-indigo-600" /> پیشنهاد ویژه</label>
                        <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="جابه‌جایی به قبل" className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"><Icon name="ArrowUp" className="w-4 h-4" /></button>
                        <button onClick={() => move(i, 1)} disabled={i === plans.length - 1} aria-label="جابه‌جایی به بعد" className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30"><Icon name="ArrowDown" className="w-4 h-4" /></button>
                        <button onClick={() => { setPlans(ps => ps.filter((_, j) => j !== i)); setDirty(true); }} aria-label="حذف پلن" className="p-1.5 rounded text-red-600 hover:bg-red-50"><Icon name="Trash2" className="w-4 h-4" /></button></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={lbl}>نام (فارسی) *</label><input value={p.name.fa} onChange={e => updLoc(i, 'name', 'fa', e.target.value)} className={inp} /></div>
                        <div><label className={lbl}>Name (English)</label><input dir="ltr" value={p.name.en} onChange={e => updLoc(i, 'name', 'en', e.target.value)} className={`${inp} text-left`} /></div>
                        <div><label className={lbl}>توضیح کوتاه</label><input value={p.desc.fa} onChange={e => updLoc(i, 'desc', 'fa', e.target.value)} className={inp} /></div>
                        <div><label className={lbl}>Short description</label><input dir="ltr" value={p.desc.en} onChange={e => updLoc(i, 'desc', 'en', e.target.value)} className={`${inp} text-left`} /></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{num(i, 'price', 'قیمت (تومان)', p.price > 0 ? money(p.price) : 'تماس بگیرید')}{num(i, 'cardLimit', 'سقف کارت', '۰ = نامحدود')}{num(i, 'durationDays', 'مدت (روز)', '۰ = نامحدود')}{num(i, 'maxVariants', 'حداکثر طرح', '۰ = نامحدود')}</div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={lbl}>ویژگی‌ها (هر خط یکی)</label><textarea rows={5} value={p.featuresText.fa} onChange={e => upd(i, { featuresText: { ...p.featuresText, fa: e.target.value } })} className={inp} /></div>
                        <div><label className={lbl}>Features (one per line)</label><textarea rows={5} dir="ltr" value={p.featuresText.en} onChange={e => upd(i, { featuresText: { ...p.featuresText, en: e.target.value } })} className={`${inp} text-left`} /></div>
                    </div>
                </div>))}</div>
        </div>
    );
}

// ---------------- اتصال‌ها ----------------
function IntegrationsTab({ kit }) {
    const { apiGet, apiPost, Icon, notifyError, notifySuccess, notify } = kit;
    const [cfg, setCfg] = useState(null); const [meta, setMeta] = useState({}); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false); const [errs, setErrs] = useState({}); const [tests, setTests] = useState({});
    const load = () => apiGet('sales_settings').then(r => { setCfg(r.integrations); setMeta({ baseUrl: r.baseUrl, cronLastRun: r.cronLastRun }); }).catch(notifyError);
    useEffect(() => { load(); }, []);
    if (!cfg) return <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p>;
    const set = (g, k, v) => { setCfg(c => ({ ...c, [g]: { ...c[g], [k]: v } })); setDirty(true); setErrs({}); };
    const save = async () => {
        setSaving(true);
        try { const r = await apiPost('save_integrations', { integrations: cfg }); setCfg(r.integrations); setDirty(false); notifySuccess('تنظیمات اتصال‌ها ذخیره شد.'); }
        catch (e) { if (e.field) setErrs({ [e.field]: e.message }); notifyError(e); }
        setSaving(false);
    };
    const test = async (channel, target) => {
        if (dirty) { notify('اول تغییرات را ذخیره کنید، بعد آزمایش کنید.', 'warning'); return; }
        setTests(t => ({ ...t, [channel]: { busy: true } }));
        try { const r = await apiPost('test_integration', { channel, target }); setTests(t => ({ ...t, [channel]: { ok: r.success, msg: r.success ? 'موفق بود ✓' : (r.error || 'ناموفق') } })); }
        catch (e) { setTests(t => ({ ...t, [channel]: { ok: false, msg: e.message } })); }
    };
    const field = (g, k, label, opts = {}) => {
        const secret = opts.secret; const id = `in-${g}-${k}`; const e = errs[`${g}.${k}`];
        return (
            <div className={opts.wide ? 'sm:col-span-2' : ''}><label className={lbl} htmlFor={id}>{label}</label>
                {opts.area ? <textarea id={id} rows={2} dir="ltr" value={cfg[g][k]} onChange={ev => set(g, k, ev.target.value)} placeholder={opts.ph} className={`${inp} text-left`} />
                    : <input id={id} type={secret ? 'password' : (opts.type || 'text')} dir="ltr" autoComplete="off" value={cfg[g][k]} onChange={ev => set(g, k, opts.type === 'number' ? (parseInt(ev.target.value, 10) || 0) : ev.target.value)} placeholder={secret && cfg[g][k + 'Set'] ? `ذخیره شده (${cfg[g][k + 'Hint']}) — برای تغییر، مقدار جدید بنویسید` : opts.ph} className={`${inp} text-left`} />}
                {secret && cfg[g][k + 'Set'] && <button type="button" onClick={() => set(g, k, '__clear__')} className="text-[11px] text-slate-500 underline mt-0.5">پاک کردن مقدار ذخیره‌شده</button>}
                {opts.hint && !e && <p className="text-[11px] text-slate-500 mt-0.5">{opts.hint}</p>}{e && <p role="alert" className="text-xs text-red-600 font-bold mt-0.5">{e}</p>}</div>
        );
    };
    const toggle = (g, k, label) => <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={!!cfg[g][k]} onChange={e => set(g, k, e.target.checked)} className="accent-indigo-600 w-4 h-4" /> {label}</label>;
    const cronUrl = `${meta.baseUrl}api.php?action=cron&key=${cfg.shop.cronKey}`;
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3"><p className="text-sm text-slate-600 me-auto">کلیدها و رمزها پس از ذخیره نمایش داده نمی‌شوند. بعد از ذخیره، با دکمه‌ی «آزمایش» از درستی هر اتصال مطمئن شوید.</p><button onClick={save} disabled={saving || !dirty} className="btn-grad px-5 py-2 rounded-xl font-bold">{saving ? 'در حال ذخیره…' : dirty ? 'ذخیره' : 'ذخیره شد'}</button></div>
            <div className="grid xl:grid-cols-2 gap-4">
                <Card Icon={Icon} title="درگاه پرداخت زرین‌پال" icon="CreditCard" hint="مرچنت کد را از پنل زرین‌پال (درگاه‌ها ← تنظیمات) کپی کنید. «حالت آزمایشی» فقط برای تست با درگاه شبیه‌سازی‌شده‌ی زرین‌پال است و پول واقعی جابه‌جا نمی‌شود.">
                    <div className="grid sm:grid-cols-2 gap-3">{field('zarinpal', 'merchantId', 'مرچنت کد', { secret: true, ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', wide: true })}</div>
                    {toggle('zarinpal', 'sandbox', 'حالت آزمایشی (Sandbox)')}<TestBox onTest={test} state={tests.zarinpal} channel="zarinpal" placeholder={null} label="آزمایش اتصال" />
                </Card>
                <Card Icon={Icon} title="پیامک (ایران پیامک)" icon="MessageSquare" hint="کلید API را از پنل ایران پیامک (بخش وب‌سرویس) بسازید. برای کد تأیید، در پنل یک «الگو» (پترن) با متغیر code بسازید، مثلاً: «کد تأیید شما: %code%» و کد الگو را اینجا بگذارید. پیامک‌های دیگر (اطلاع‌رسانی سفارش) به‌صورت متن ساده از همین خط ارسال می‌شوند.">
                    {toggle('sms', 'enabled', 'ارسال پیامک فعال باشد')}
                    <div className="grid sm:grid-cols-2 gap-3">{field('sms', 'apiKey', 'کلید API', { secret: true, wide: true })}{field('sms', 'line', 'شماره‌ی خط ارسال', { ph: '3000xxxx' })}{field('sms', 'otpPattern', 'کد الگوی کد تأیید')}{field('sms', 'otpVar', 'نام متغیر الگو', { ph: 'code' })}</div>
                    <TestBox onTest={test} state={tests.sms} channel="sms" placeholder="09xxxxxxxxx" label="آزمایش پیامک ساده" /><TestBox onTest={test} state={tests.otp} channel="otp" placeholder="09xxxxxxxxx" label="آزمایش الگوی کد تأیید" />
                </Card>
                <Card Icon={Icon} title="ایمیل" icon="Mail" hint="در cPanel یک ایمیل مثل noreply@دامنه‌ی‌شما بسازید و همان را به‌عنوان فرستنده وارد کنید. ایمیل‌ها با تابع mail هاست ارسال می‌شوند.">
                    {toggle('email', 'enabled', 'ارسال ایمیل فعال باشد')}
                    <div className="grid sm:grid-cols-2 gap-3">{field('email', 'from', 'ایمیل فرستنده', { ph: 'noreply@example.com' })}{field('email', 'fromName', 'نام فرستنده', { ph: 'Asva Studio' })}</div>
                    <TestBox onTest={test} state={tests.email} channel="email" placeholder="you@example.com" />
                </Card>
                <Card Icon={Icon} title="پیام‌رسان بله" icon="Send" hint="در بله با @botfather یک ربات بسازید و توکن را اینجا بگذارید. ربات را به گروه/کانال مدیران اضافه کنید و شناسه‌ی گفت‌وگو (chat id) را وارد کنید (چند شناسه را با فاصله جدا کنید).">
                    {toggle('bale', 'enabled', 'اعلان در بله')}
                    <div className="grid sm:grid-cols-2 gap-3">{field('bale', 'token', 'توکن ربات', { secret: true, wide: true })}{field('bale', 'chatIds', 'شناسه‌ی گفت‌وگو', { wide: true })}</div>
                    <TestBox onTest={test} state={tests.bale} channel="bale" placeholder="(اختیاری) شناسه‌ی گفت‌وگو" />
                </Card>
                <Card Icon={Icon} title="پیام‌رسان ایتا (ایتایار)" icon="Send" hint="از سایت eitaayar.ir توکن بگیرید، ربات/حساب را مدیر کانال کنید و شناسه‌ی کانال را وارد کنید.">
                    {toggle('eitaa', 'enabled', 'اعلان در ایتا')}
                    <div className="grid sm:grid-cols-2 gap-3">{field('eitaa', 'token', 'توکن ایتایار', { secret: true, wide: true })}{field('eitaa', 'chatIds', 'شناسه‌ی کانال/گفت‌وگو', { wide: true })}</div>
                    <TestBox onTest={test} state={tests.eitaa} channel="eitaa" placeholder="(اختیاری) شناسه‌ی کانال" />
                </Card>
                <Card Icon={Icon} title="گیرندگان اعلان‌های مدیر" icon="BellRing" hint="سفارش پرداخت‌شده، درخواست مشاوره، تمدید و یادآوری پایان اعتبار به این افراد اطلاع داده می‌شود. در پنل هم همیشه ثبت می‌شود.">
                    <div className="grid sm:grid-cols-2 gap-3">{field('notify', 'mobiles', 'موبایل‌ها', { area: true, ph: '09121234567 09351234567' })}{field('notify', 'emails', 'ایمیل‌ها', { area: true, ph: 'a@example.com b@example.com' })}</div>
                    <div className="flex flex-wrap gap-4">{toggle('notify', 'sms', 'پیامک')}{toggle('notify', 'email', 'ایمیل')}{toggle('notify', 'bale', 'بله')}{toggle('notify', 'eitaa', 'ایتا')}</div>
                </Card>
                <Card Icon={Icon} title="فروش آنلاین و کارهای زمان‌بندی‌شده" icon="Clock" hint="برای یادآوری پایان اعتبار و لغو سفارش‌های پرداخت‌نشده، در cPanel ← Cron Jobs دستور زیر را روزی یک بار اجرا کنید.">
                    {toggle('shop', 'enabled', 'ثبت سفارش آنلاین فعال باشد')}
                    <div className="grid sm:grid-cols-2 gap-3">{field('shop', 'reminderDays', 'یادآوری چند روز قبل از پایان', { type: 'number' })}{field('shop', 'unpaidHours', 'لغو سفارش پرداخت‌نشده بعد از (ساعت)', { type: 'number' })}</div>
                    <div><span className={lbl}>دستور Cron Job</span><div className="flex gap-2"><code dir="ltr" className="flex-1 text-[11px] bg-slate-900 text-emerald-300 rounded-lg p-2 break-all">{`curl -s "${cronUrl}" > /dev/null`}</code><button type="button" onClick={() => { navigator.clipboard.writeText(`curl -s "${cronUrl}" > /dev/null`).then(() => notifySuccess('کپی شد.')); }} className="px-3 rounded-lg bg-white border text-sm font-bold">کپی</button></div>
                        <p className="text-[11px] text-slate-500 mt-1">آخرین اجرا: {meta.cronLastRun ? dt(meta.cronLastRun) : 'هنوز اجرا نشده'}</p></div>
                </Card>
            </div>
        </div>
    );
}

// ---------------- گزارش ارسال‌ها ----------------
function LogTab({ kit }) {
    const { apiGet, notifyError } = kit; const [rows, setRows] = useState(null);
    useEffect(() => { apiGet('notify_log').then(setRows).catch(notifyError); }, []);
    const CH = { sms: 'پیامک', email: 'ایمیل', bale: 'بله', eitaa: 'ایتا', zarinpal: 'زرین‌پال' };
    if (!rows) return <p className="text-center text-slate-500 py-10">در حال بارگذاری…</p>;
    if (!rows.length) return <p className="text-center text-slate-500 py-10 bg-white/50 rounded-2xl">هنوز چیزی ارسال نشده است.</p>;
    return (
        <div className="overflow-x-auto bg-white/70 rounded-2xl border">
            <table className="w-full text-sm stack-table"><thead className="bg-slate-50 text-slate-600"><tr>{['زمان', 'کانال', 'گیرنده', 'موضوع', 'نتیجه'].map(h => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
                <tbody>{rows.map(r => <tr key={r.id} className="border-t"><td className="p-3 text-xs whitespace-nowrap" data-label="زمان">{dt(r.created_at)}</td><td className="p-3" data-label="کانال">{CH[r.channel] || r.channel}</td><td className="p-3 text-xs" dir="ltr" data-label="گیرنده">{r.target}</td><td className="p-3" data-label="موضوع">{r.subject}</td><td className="p-3" data-label="نتیجه">{Number(r.ok) ? <span className="text-emerald-700 font-bold">ارسال شد</span> : <span className="text-red-600 text-xs font-bold">{r.error || 'ناموفق'}</span>}</td></tr>)}</tbody></table>
        </div>
    );
}
