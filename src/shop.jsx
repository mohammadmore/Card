// سفارش آنلاین و پیگیری سفارش (برای مشتری نهایی): انتخاب پلن ← تأیید موبایل ← اطلاعات سازمان ← طرح‌های خام کارت
// (برای هر رده روی و پشت جدا) ← فیلدهای فرم ← بازبینی و پرداخت (زرین‌پال). پیگیری با موبایل و کد پیامکی، و تمدید پلن.
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const STR = {
    fa: {
        order_title: 'سفارش آنلاین سامانه‌ی کارت', track_title: 'پیگیری سفارش', back_home: 'صفحه‌ی اصلی', loading: 'در حال بارگذاری…',
        s_plan: 'پلن', s_mobile: 'موبایل', s_org: 'سازمان', s_design: 'طرح کارت', s_fields: 'فیلدها', s_review: 'بازبینی و پرداخت',
        next: 'مرحله‌ی بعد', prev: 'قبلی', choose_plan: 'پلن مناسب را انتخاب کنید', toman: 'تومان', cards: 'کارت', unlimited: 'نامحدود', designs: 'طرح', days: 'روز', year: 'یک سال', selected: 'انتخاب شد', select: 'انتخاب',
        mobile: 'شماره‌ی موبایل', mobile_hint: 'کد تأیید به این شماره پیامک می‌شود. لینک سامانه و اطلاع‌رسانی‌ها هم به همین شماره ارسال می‌شود.', send_code: 'ارسال کد', code: 'کد تأیید', verify: 'تأیید', resend_in: (s) => `ارسال دوباره تا ${s} ثانیه`, resend: 'ارسال دوباره‌ی کد', change: 'تغییر شماره', verified_as: 'تأییدشده:', code_sent: 'کد تأیید پیامک شد.',
        applicant: 'اطلاعات درخواست‌دهنده', full_name: 'نام و نام خانوادگی', email: 'ایمیل (برای دریافت لینک و رسید)', role_title: 'سمت', national_id: 'کد ملی (اختیاری)',
        org_info: 'اطلاعات سازمان', org_name: 'نام سازمان (همان‌طور که روی سامانه دیده شود)', org_phone: 'تلفن سازمان', org_web: 'وب‌سایت', org_addr: 'نشانی', logo: 'لوگوی سازمان (اختیاری، ترجیحاً PNG شفاف)', card_lang: 'زبان اصلی فرم کارت',
        upload: 'آپلود', uploading: 'در حال آپلود…', replace: 'تغییر', remove: 'حذف',
        layout: 'کارت شما', double: 'دورو (روی و پشت)', single: 'یک‌رو',
        variants_q: 'آیا برای رده‌های مختلف (مثلاً کارشناس، مدیر، مهمان) طرح کارت متفاوت دارید؟', yes_variants: 'بله، چند طرح دارم', no_variants: 'نه، یک طرح',
        variant_field: 'نام فیلدی که نوع کارت را تعیین می‌کند', variant_field_ph: 'مثلاً: رده سازمانی', variant_field_hint: 'در فرم سامانه، کاربر این فیلد را انتخاب می‌کند و طرح کارتش بر اساس آن عوض می‌شود.',
        variant_name: 'نام این نوع', variant_name_ph: 'مثلاً: مدیر', front: 'روی کارت', back: 'پشت کارت', add_variant: 'افزودن نوع کارت', max_variants: (n) => `این پلن حداکثر ${n} طرح دارد.`,
        design_hint: 'فایل خام کارت (بدون متن‌های شخصی) با فرمت JPG. بهتر است عرض تصویر حداقل ۱۰۰۰ پیکسل باشد.', low_res: 'کیفیت تصویر پایین است؛ ممکن است چاپ تار شود.', ratio_warn: 'نسبت ابعاد با روی کارت یکی نیست.',
        fields_title: 'چه اطلاعاتی از هر عضو گرفته شود؟', fields_hint: 'این فهرست فیلدهای فرم سامانه‌ی شماست. جای دقیق هر فیلد روی کارت را ما بر اساس طرح شما می‌چینیم.', f_label: 'عنوان فیلد', f_type: 'نوع', f_required: 'الزامی', f_oncard: 'روی کارت چاپ شود', f_options: 'گزینه‌ها (هر خط یک گزینه)', add_field: 'افزودن فیلد',
        t_text: 'متن', t_select: 'انتخابی (فهرست)', t_date: 'تاریخ', t_photo: 'عکس', t_number: 'عدد', variant_auto: (f) => `فیلد «${f}» با گزینه‌های طرح‌ها خودکار اضافه می‌شود.`,
        notes: 'توضیحات تکمیلی (اختیاری)', notes_ph: 'هر نکته‌ای درباره‌ی چیدمان، رنگ متن‌ها، فونت دلخواه یا موارد خاص…', accept: 'قوانین و مقررات را خوانده‌ام و می‌پذیرم', read_terms: 'مشاهده‌ی قوانین',
        summary: 'خلاصه‌ی سفارش', plan: 'پلن', amount: 'مبلغ قابل پرداخت', pay: 'پرداخت و ثبت سفارش', paying: 'در حال اتصال به درگاه…', variants_count: 'تعداد طرح', fields_count: 'تعداد فیلد',
        req: 'این مورد الزامی است.', need_upload: 'طرح‌ها را آپلود کنید.', need_variant_name: 'برای هر طرح یک نام بنویسید.', dup_variant: 'نام طرح‌ها نباید تکراری باشد.', need_field: 'حداقل یک فیلد لازم است.', need_accept: 'لطفاً قوانین را بپذیرید.',
        st_pending_payment: 'در انتظار پرداخت', st_paid: 'پرداخت‌شده — در صف آماده‌سازی', st_in_progress: 'در حال آماده‌سازی', st_delivered: 'تحویل‌شده', st_cancelled: 'لغو‌شده',
        order_code: 'کد سفارش', ref_id: 'کد پیگیری پرداخت', created: 'تاریخ ثبت', pay_now: 'پرداخت', pay_ok: 'پرداخت با موفقیت انجام شد. سفارش شما ثبت شد و پس از آماده‌سازی، لینک سامانه برایتان پیامک می‌شود.', pay_failed: 'پرداخت انجام نشد.',
        open_system: 'ورود به سامانه', active_until: 'اعتبار تا', card_limit: 'سقف کارت', renew: 'تمدید یا ارتقای پلن', renew_title: 'انتخاب پلن تمدید', renewal: 'تمدید', my_orders: 'سفارش‌های شما', no_orders: 'هنوز سفارشی با این شماره ثبت نشده است.', new_order: 'سفارش جدید', logout: 'خروج', view: 'جزئیات', track_hint: 'برای دیدن سفارش‌ها، شماره‌ی موبایلی را که با آن سفارش داده‌اید تأیید کنید.',
        shop_off: 'ثبت سفارش آنلاین فعلاً فعال نیست. لطفاً با ما تماس بگیرید.', no_plans: 'پلن قابل سفارشی تعریف نشده است.', contact: 'تماس با ما', draft_saved: 'پیش‌نویس ذخیره شد', order_registered: 'سفارش ثبت شد',
    },
    en: {
        order_title: 'Order your card system', track_title: 'Track your order', back_home: 'Home', loading: 'Loading…',
        s_plan: 'Plan', s_mobile: 'Mobile', s_org: 'Organization', s_design: 'Card design', s_fields: 'Fields', s_review: 'Review & pay',
        next: 'Next', prev: 'Back', choose_plan: 'Choose your plan', toman: 'Toman', cards: 'cards', unlimited: 'Unlimited', designs: 'designs', days: 'days', year: 'one year', selected: 'Selected', select: 'Select',
        mobile: 'Mobile number', mobile_hint: 'We will text a verification code. Your system link and updates are sent to this number too.', send_code: 'Send code', code: 'Verification code', verify: 'Verify', resend_in: (s) => `Resend in ${s}s`, resend: 'Resend code', change: 'Change number', verified_as: 'Verified:', code_sent: 'Code sent.',
        applicant: 'Your details', full_name: 'Full name', email: 'Email (for link and receipt)', role_title: 'Job title', national_id: 'National ID (optional)',
        org_info: 'Organization', org_name: 'Organization name (as shown on the system)', org_phone: 'Phone', org_web: 'Website', org_addr: 'Address', logo: 'Logo (optional, transparent PNG preferred)', card_lang: 'Main form language',
        upload: 'Upload', uploading: 'Uploading…', replace: 'Change', remove: 'Remove',
        layout: 'Your card', double: 'Double-sided', single: 'Single-sided',
        variants_q: 'Do different categories (e.g. staff, manager, guest) have different card designs?', yes_variants: 'Yes, several designs', no_variants: 'No, one design',
        variant_field: 'Name of the field that decides the card type', variant_field_ph: 'e.g. Position', variant_field_hint: 'Members pick this in the form and their card design switches accordingly.',
        variant_name: 'Type name', variant_name_ph: 'e.g. Manager', front: 'Front', back: 'Back', add_variant: 'Add card type', max_variants: (n) => `This plan allows up to ${n} designs.`,
        design_hint: 'Blank card artwork (no personal text) as JPG. Ideally at least 1000px wide.', low_res: 'Low resolution; print may look blurry.', ratio_warn: 'Aspect ratio differs from the front.',
        fields_title: 'What should each member enter?', fields_hint: 'These become your form fields. We place each one on the card based on your design.', f_label: 'Field title', f_type: 'Type', f_required: 'Required', f_oncard: 'Print on card', f_options: 'Options (one per line)', add_field: 'Add field',
        t_text: 'Text', t_select: 'Choice (list)', t_date: 'Date', t_photo: 'Photo', t_number: 'Number', variant_auto: (f) => `A "${f}" choice field with your design names is added automatically.`,
        notes: 'Notes (optional)', notes_ph: 'Anything about layout, text colors, preferred fonts or special cases…', accept: 'I have read and accept the terms', read_terms: 'Read the terms',
        summary: 'Order summary', plan: 'Plan', amount: 'Amount', pay: 'Pay & place order', paying: 'Connecting to the gateway…', variants_count: 'Designs', fields_count: 'Fields',
        req: 'This is required.', need_upload: 'Please upload the designs.', need_variant_name: 'Name every design.', dup_variant: 'Design names must be unique.', need_field: 'Add at least one field.', need_accept: 'Please accept the terms.',
        st_pending_payment: 'Awaiting payment', st_paid: 'Paid — queued for setup', st_in_progress: 'Being prepared', st_delivered: 'Delivered', st_cancelled: 'Cancelled',
        order_code: 'Order code', ref_id: 'Payment reference', created: 'Placed on', pay_now: 'Pay', pay_ok: 'Payment successful. Your order is placed; we will text you the system link once it is ready.', pay_failed: 'Payment was not completed.',
        open_system: 'Open the system', active_until: 'Valid until', card_limit: 'Card limit', renew: 'Renew or upgrade', renew_title: 'Choose a renewal plan', renewal: 'Renewal', my_orders: 'Your orders', no_orders: 'No orders for this number yet.', new_order: 'New order', logout: 'Sign out', view: 'Details', track_hint: 'Verify the mobile number you ordered with to see your orders.',
        shop_off: 'Online ordering is currently unavailable. Please contact us.', no_plans: 'No orderable plans yet.', contact: 'Contact us', draft_saved: 'Draft saved', order_registered: 'Order placed',
    },
};
const faNum = (s) => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const fmtMoney = (n, lang) => { const s = Number(n || 0).toLocaleString('en-US'); return lang === 'fa' ? faNum(s).replace(/,/g, '٬') : s; };
const fmtNum = (n, lang) => lang === 'fa' ? faNum(n) : String(n);
const DRAFT_KEY = 'shop_order_draft_v1';

/** آپلود فایل با multipart (فایل خام بدون فشرده‌سازی تا کیفیت چاپ حفظ شود). */
async function uploadOrderFile(file, kind) {
    const fd = new FormData(); fd.append('file', file); fd.append('kind', kind);
    const res = await fetch('api.php?action=order_upload', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd });
    let d = null; try { d = await res.json(); } catch (e) { }
    if (!res.ok || !d || d.error) throw new Error((d && d.error) || `HTTP ${res.status}`);
    return d;
}

function useShopStrings(lang) { return useMemo(() => { const s = STR[lang] || STR.fa; return (k, ...a) => { const v = s[k] ?? STR.fa[k] ?? k; return typeof v === 'function' ? v(...a) : v; }; }, [lang]); }

/** قاب صفحه‌های فروش: سربرگ ساده با لوگو، زبان و حالت نمایش. */
export function ShopShell({ kit, lang, setLang, title, children }) {
    const { Icon, LogoImg, ThemeToggle, usePlatform } = kit; const plat = usePlatform(); const t = useShopStrings(lang);
    useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr'; document.title = `${title} — ${plat.name}`; }, [lang, title, plat.name]);
    const home = lang === 'en' ? './en' : './';
    return (
        <div className="min-h-screen flex flex-col">
            <header className="glass sticky top-0 z-30 border-b border-white/60">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
                    <a href={home} className="flex items-center gap-2.5 min-w-0 me-auto"><LogoImg alt="" className="w-9 h-9 object-contain" /><span className="font-extrabold text-slate-800 truncate">{plat.name}</span></a>
                    <button type="button" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')} className="text-sm font-bold px-3 h-9 rounded-xl bg-slate-50 border text-slate-700 hover:bg-slate-100" lang={lang === 'fa' ? 'en' : 'fa'}>{lang === 'fa' ? 'English' : 'فارسی'}</button>
                    <ThemeToggle compact />
                    <a href={home} className="hidden sm:inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-indigo-700"><Icon name={lang === 'fa' ? 'ArrowRight' : 'ArrowLeft'} className="w-4 h-4" /> {t('back_home')}</a>
                </div>
            </header>
            <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">{children}</main>
        </div>
    );
}

function Field({ label, error, children, hint, id }) {
    return (
        <div>
            <label htmlFor={id} className="text-sm font-bold text-slate-700 block mb-1.5">{label}</label>
            {children}
            {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
            {error && <p role="alert" className="text-xs text-red-600 mt-1 font-bold">{error}</p>}
        </div>
    );
}
const inputCls = 'w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white/90 focus:ring-2 focus:ring-indigo-500 outline-none';

/** تأیید موبایل با کد پیامکی (مشترک بین سفارش و پیگیری). */
function MobileVerify({ kit, t, lang, verified, onVerified, smsReady }) {
    const { apiPost, Icon, notifyError } = kit;
    const [mobile, setMobile] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false); const [err, setErr] = useState({}); const [left, setLeft] = useState(0);
    useEffect(() => { if (left <= 0) return; const id = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(id); }, [left]);
    const send = async () => {
        setBusy(true); setErr({});
        try { const r = await apiPost('otp_send', { mobile }); setMobile(r.mobile); setSent(true); setLeft(r.retryAfter || 60); setTimeout(() => document.getElementById('otp-code')?.focus(), 50); }
        catch (e) { if (e.retryAfter) { setLeft(e.retryAfter); setSent(true); } if (e.field) setErr({ [e.field]: e.message }); else notifyError(e); }
        setBusy(false);
    };
    const verify = async (e) => {
        e && e.preventDefault(); setBusy(true); setErr({});
        try { const r = await apiPost('otp_verify', { mobile, code }); onVerified(r.mobile); }
        catch (ex) { if (ex.field) setErr({ [ex.field]: ex.message }); else notifyError(ex); }
        setBusy(false);
    };
    if (verified) return (
        <div className="flex flex-wrap items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3">
            <Icon name="BadgeCheck" className="w-5 h-5" /><span className="font-bold">{t('verified_as')} <span dir="ltr">{fmtNum(verified, lang)}</span></span>
            <button type="button" onClick={() => onVerified(null)} className="ms-auto text-sm underline">{t('change')}</button>
        </div>
    );
    if (!smsReady) return <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">{t('shop_off')}</p>;
    return (
        <form onSubmit={sent ? verify : (e) => { e.preventDefault(); send(); }} className="space-y-4 max-w-md">
            <Field id="otp-mobile" label={t('mobile')} error={err.mobile} hint={t('mobile_hint')}>
                <div className="flex gap-2">
                    <input id="otp-mobile" value={mobile} onChange={e => { setMobile(e.target.value); setSent(false); setErr({}); }} inputMode="tel" dir="ltr" autoComplete="tel" placeholder="09xxxxxxxxx" className={`${inputCls} text-left`} disabled={busy} />
                    {!sent && <button type="submit" disabled={busy || mobile.trim().length < 10} className="btn-grad px-5 rounded-xl font-bold shrink-0">{t('send_code')}</button>}
                </div>
            </Field>
            {sent && (<>
                <Field id="otp-code" label={t('code')} error={err.code}>
                    <div className="flex gap-2">
                        <input id="otp-code" value={code} onChange={e => { setCode(e.target.value); setErr({}); }} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} className={`${inputCls} text-center tracking-[0.5em] font-bold text-lg`} />
                        <button type="submit" disabled={busy || code.trim().length < 4} className="btn-grad px-5 rounded-xl font-bold shrink-0">{t('verify')}</button>
                    </div>
                </Field>
                <p className="text-sm text-slate-500">{left > 0 ? t('resend_in', fmtNum(left, lang)) : <button type="button" onClick={send} disabled={busy} className="text-indigo-700 font-bold underline">{t('resend')}</button>}</p>
            </>)}
        </form>
    );
}

function PlanCards({ plans, lang, t, selected, onSelect }) {
    return (
        <div className={`grid gap-4 ${plans.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {plans.map(p => {
                const on = selected === p.id; const name = p.name[lang] || p.name.fa; const feats = (p.features[lang] || []).length ? p.features[lang] : p.features.fa;
                return (
                    <button key={p.id} type="button" onClick={() => onSelect(p.id)} aria-pressed={on} disabled={p.price <= 0}
                        className={`text-start rounded-2xl p-5 border-2 transition-all bg-white/80 ${on ? 'border-indigo-500 shadow-lg ring-4 ring-indigo-500/15' : 'border-transparent hover:border-indigo-200'} ${p.price <= 0 ? 'opacity-60 cursor-not-allowed' : ''}`}>
                        <div className="flex items-center justify-between gap-2"><span className="font-black text-lg text-slate-800">{name}</span>{p.highlight && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">★</span>}</div>
                        <div className="mt-2 mb-3">{p.price > 0 ? <><span className="text-2xl font-black text-slate-800">{fmtMoney(p.price, lang)}</span> <span className="text-xs text-slate-500">{t('toman')}</span></> : <span className="font-bold text-slate-600">{t('contact')}</span>}</div>
                        <ul className="space-y-1 text-sm text-slate-600">{feats.map((f, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-600">✓</span>{f}</li>)}</ul>
                        <span className={`mt-4 block text-center rounded-xl py-2 text-sm font-bold ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{on ? t('selected') : t('select')}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** خانه‌ی آپلود یک طرح (روی یا پشت). */
function DesignSlot({ kit, t, label, value, meta, onChange, refRatio, error }) {
    const { Icon, notifyError } = kit; const [busy, setBusy] = useState(false);
    const pick = async (file) => {
        if (!file) return;
        if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) { notifyError({ message: t('design_hint') }); return; }
        setBusy(true);
        try { const r = await uploadOrderFile(file, 'design'); onChange(r.url, { w: r.width, h: r.height }); } catch (e) { notifyError(e); }
        setBusy(false);
    };
    const low = meta && meta.w < 1000; const ratioOff = meta && refRatio && Math.abs(meta.w / meta.h - refRatio) > 0.03;
    return (
        <div className="flex-1 min-w-[150px]">
            <span className="text-xs font-bold text-slate-600 block mb-1">{label}</span>
            <label className={`relative block aspect-[1.586] rounded-xl border-2 border-dashed overflow-hidden cursor-pointer transition ${error ? 'border-red-400 bg-red-50/50' : 'border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50'} ${busy ? 'animate-pulse pointer-events-none' : ''}`}>
                {value ? <img src={value} alt={label} className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-indigo-700 text-xs font-bold"><Icon name="UploadCloud" className="w-6 h-6" />{busy ? t('uploading') : t('upload')} JPG</span>}
                {value && <span className="absolute bottom-1.5 end-1.5 bg-white/90 text-slate-700 text-[11px] font-bold rounded-lg px-2 py-0.5">{busy ? t('uploading') : t('replace')}</span>}
                <input type="file" accept="image/jpeg,.jpg,.jpeg" className="sr-only" onChange={e => { const f = e.target.files[0]; e.target.value = ''; pick(f); }} />
            </label>
            {meta && <p className="text-[11px] text-slate-500 mt-1" dir="ltr">{meta.w}×{meta.h}px</p>}
            {low && <p className="text-[11px] text-amber-700 font-bold">{t('low_res')}</p>}
            {ratioOff && <p className="text-[11px] text-amber-700 font-bold">{t('ratio_warn')}</p>}
        </div>
    );
}

const DEFAULT_FIELDS = (lang) => lang === 'en'
    ? [{ label: 'Full name', type: 'text', required: true, onCard: true, options: '' }, { label: 'Photo', type: 'photo', required: true, onCard: true, options: '' }, { label: 'Staff number', type: 'text', required: false, onCard: true, options: '' }]
    : [{ label: 'نام و نام خانوادگی', type: 'text', required: true, onCard: true, options: '' }, { label: 'عکس', type: 'photo', required: true, onCard: true, options: '' }, { label: 'کد پرسنلی', type: 'text', required: false, onCard: true, options: '' }];
const emptyDraft = (lang) => ({
    planId: '', applicant: { name: '', email: '', role: '', nationalId: '' }, org: { name: '', phone: '', website: '', address: '', logo: '', cardLang: lang },
    layout: 'double', multi: false, variantField: '', variants: [{ name: '', front: '', back: '', fm: null, bm: null }], fields: DEFAULT_FIELDS(lang), notes: '', acceptTerms: false,
});

export function OrderPage({ kit, lang, setLang }) {
    const { apiGet, apiPost, Icon, notifyError, notify } = kit; const t = useShopStrings(lang);
    const [shop, setShop] = useState(null); const [step, setStep] = useState(0); const [errs, setErrs] = useState({}); const [paying, setPaying] = useState(false); const [showTerms, setShowTerms] = useState(false);
    const [d, setD] = useState(() => { try { const s = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (s && s.v === 1) return { ...emptyDraft(lang), ...s.d }; } catch (e) { } return emptyDraft(lang); });
    const set = (patch) => setD(p => ({ ...p, ...patch }));
    const setIn = (k, sub, v) => setD(p => ({ ...p, [k]: { ...p[k], [sub]: v } }));
    useEffect(() => { const id = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, d })); } catch (e) { } }, 400); return () => clearTimeout(id); }, [d]);
    useEffect(() => {
        apiGet('shop_info').then(s => {
            setShop(s);
            const qp = new URLSearchParams(location.search).get('plan');
            setD(p => { const valid = (id) => s.plans.some(x => x.id === id && x.price > 0); const planId = valid(qp) ? qp : (valid(p.planId) ? p.planId : (s.plans.find(x => x.price > 0) || {}).id || ''); return { ...p, planId }; });
            if (s.verifiedMobile) setVerified(s.verifiedMobile);
        }).catch(e => notifyError(e));
    }, []);
    const [verified, setVerified] = useState(null);
    const plan = shop && shop.plans.find(p => p.id === d.planId);
    const maxV = plan ? plan.maxVariants : 0;

    const steps = ['s_plan', 's_mobile', 's_org', 's_design', 's_fields', 's_review'];
    const validate = (s) => {
        const e = {};
        if (s === 0 && !plan) e.plan = t('req');
        if (s === 1 && !verified) e.mobile = t('req');
        if (s === 2) { if (!d.applicant.name.trim()) e['applicant.name'] = t('req'); if (!d.org.name.trim()) e['org.name'] = t('req'); if (d.applicant.email && !/^\S+@\S+\.\S+$/.test(d.applicant.email)) e['applicant.email'] = 'Email?'; }
        if (s === 3) {
            const vs = d.multi ? d.variants : d.variants.slice(0, 1);
            vs.forEach((v, i) => { if (!v.front) e[`variants.${i}.front`] = t('need_upload'); if (d.layout === 'double' && !v.back) e[`variants.${i}.back`] = t('need_upload'); if (d.multi && !v.name.trim()) e[`variants.${i}.name`] = t('need_variant_name'); });
            if (d.multi) { if (!d.variantField.trim()) e.variantField = t('req'); const names = vs.map(v => v.name.trim()); if (new Set(names).size !== names.length) e.variants = t('dup_variant'); }
        }
        if (s === 4 && !d.fields.some(f => f.label.trim())) e.fields = t('need_field');
        if (s === 5 && !d.acceptTerms) e.acceptTerms = t('need_accept');
        return e;
    };
    const go = (to) => {
        if (to > step) for (let s = step; s < to; s++) { const e = validate(s); if (Object.keys(e).length) { setErrs(e); setStep(s); setTimeout(() => document.querySelector('[role=alert]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50); return; } }
        setErrs({}); setStep(to); window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const pay = async () => {
        const e = validate(5); if (Object.keys(e).length) { setErrs(e); return; }
        setPaying(true);
        try {
            const vs = (d.multi ? d.variants : d.variants.slice(0, 1)).map(v => ({ name: d.multi ? v.name.trim() : '', front: v.front, back: d.layout === 'double' ? v.back : '' }));
            const r = await apiPost('order_create', { planId: d.planId, lang, applicant: d.applicant, org: d.org, layout: d.layout, variantField: d.multi ? d.variantField : '', variants: vs, fields: d.fields.filter(f => f.label.trim()), notes: d.notes, acceptTerms: d.acceptTerms });
            const o = r.order;
            try { localStorage.removeItem(DRAFT_KEY); } catch (er) { }
            notify(t('order_registered'), 'success');
            history.replaceState(null, '', `?view=order&o=${o.id}&k=${o.token}${lang === 'en' ? '&lang=en' : ''}`);
            const p = await apiPost('order_pay', { id: o.id, token: o.token });
            window.location.href = p.url;
        } catch (ex) {
            setPaying(false);
            if (ex.field) { const map = { plan: 0, mobile: 1, 'applicant.name': 2, 'applicant.email': 2, 'org.name': 2, 'org.logo': 2, variantField: 3, variants: 3, fields: 4, acceptTerms: 5 }; const s = map[ex.field] ?? (ex.field.startsWith('variants') ? 3 : step); setErrs({ [ex.field]: ex.message }); setStep(s); }
            if (ex.status === 401) setVerified(null);
            // اگر سفارش ساخته شده ولی اتصال به درگاه نشد، به صفحه‌ی وضعیت سفارش می‌رویم تا دوباره پرداخت کند
            if (/view=order/.test(location.search)) { notifyError(ex); setTimeout(() => location.reload(), 1500); return; }
            notifyError(ex);
        }
    };

    if (!shop) return <ShopShell kit={kit} lang={lang} setLang={setLang} title={t('order_title')}><p className="text-center text-slate-500 py-20">{t('loading')}</p></ShopShell>;
    if (!shop.enabled || !shop.plans.some(p => p.price > 0)) return <ShopShell kit={kit} lang={lang} setLang={setLang} title={t('order_title')}><div className="glass rounded-3xl p-8 text-center text-slate-600">{shop.enabled ? t('no_plans') : t('shop_off')}</div></ShopShell>;
    const err = (k) => errs[k];
    const variantList = d.multi ? d.variants : d.variants.slice(0, 1);
    const updVariant = (i, patch) => setD(p => ({ ...p, variants: p.variants.map((v, j) => j === i ? { ...v, ...patch } : v) }));
    const updField = (i, patch) => setD(p => ({ ...p, fields: p.fields.map((f, j) => j === i ? { ...f, ...patch } : f) }));
    const btn = 'px-5 py-2.5 rounded-xl font-bold';

    return (
        <ShopShell kit={kit} lang={lang} setLang={setLang} title={t('order_title')}>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-6">{t('order_title')}</h1>
            <nav aria-label="steps" className="flex gap-1.5 overflow-x-auto pb-2 mb-6">
                {steps.map((s, i) => (
                    <button key={s} type="button" onClick={() => i < step && go(i)} aria-current={i === step ? 'step' : undefined} disabled={i > step}
                        className={`flex items-center gap-2 shrink-0 rounded-full ps-1.5 pe-3 py-1.5 text-sm font-bold ${i === step ? 'bg-indigo-600 text-white' : i < step ? 'bg-white/80 text-indigo-700 border' : 'bg-white/50 text-slate-400 border'}`}>
                        <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${i === step ? 'bg-white/25' : 'bg-slate-100'}`}>{i < step ? '✓' : fmtNum(i + 1, lang)}</span>{t(s)}
                    </button>
                ))}
            </nav>

            <section className="glass rounded-3xl p-5 sm:p-8">
                {step === 0 && (<div><h2 className="font-bold text-lg mb-4 text-slate-800">{t('choose_plan')}</h2><PlanCards plans={shop.plans} lang={lang} t={t} selected={d.planId} onSelect={(id) => { set({ planId: id }); setErrs({}); }} />{err('plan') && <p role="alert" className="text-red-600 text-sm font-bold mt-3">{err('plan')}</p>}</div>)}

                {step === 1 && (<div><h2 className="font-bold text-lg mb-4 text-slate-800">{t('s_mobile')}</h2>
                    <MobileVerify kit={kit} t={t} lang={lang} verified={verified} smsReady={shop.smsReady} onVerified={(m) => { if (!m) apiPost('otp_logout').catch(() => { }); setVerified(m); setErrs({}); }} />
                    {err('mobile') && <p role="alert" className="text-red-600 text-sm font-bold mt-3">{err('mobile')}</p>}</div>)}

                {step === 2 && (<div className="space-y-8">
                    <div><h2 className="font-bold text-lg mb-4 text-slate-800">{t('applicant')}</h2>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <Field id="a-name" label={`${t('full_name')} *`} error={err('applicant.name')}><input id="a-name" value={d.applicant.name} onChange={e => setIn('applicant', 'name', e.target.value)} autoComplete="name" className={inputCls} /></Field>
                            <Field id="a-email" label={t('email')} error={err('applicant.email')}><input id="a-email" type="email" dir="ltr" value={d.applicant.email} onChange={e => setIn('applicant', 'email', e.target.value)} autoComplete="email" className={`${inputCls} text-left`} /></Field>
                            <Field id="a-role" label={t('role_title')}><input id="a-role" value={d.applicant.role} onChange={e => setIn('applicant', 'role', e.target.value)} className={inputCls} /></Field>
                            <Field id="a-nid" label={t('national_id')}><input id="a-nid" dir="ltr" inputMode="numeric" value={d.applicant.nationalId} onChange={e => setIn('applicant', 'nationalId', e.target.value)} className={`${inputCls} text-left`} /></Field>
                        </div></div>
                    <div><h2 className="font-bold text-lg mb-4 text-slate-800">{t('org_info')}</h2>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <Field id="o-name" label={`${t('org_name')} *`} error={err('org.name')}><input id="o-name" value={d.org.name} onChange={e => setIn('org', 'name', e.target.value)} autoComplete="organization" className={inputCls} /></Field>
                            <Field id="o-phone" label={t('org_phone')}><input id="o-phone" dir="ltr" value={d.org.phone} onChange={e => setIn('org', 'phone', e.target.value)} className={`${inputCls} text-left`} /></Field>
                            <Field id="o-web" label={t('org_web')}><input id="o-web" dir="ltr" value={d.org.website} onChange={e => setIn('org', 'website', e.target.value)} className={`${inputCls} text-left`} /></Field>
                            <Field id="o-lang" label={t('card_lang')}><select id="o-lang" value={d.org.cardLang} onChange={e => setIn('org', 'cardLang', e.target.value)} className={inputCls}><option value="fa">فارسی</option><option value="en">English</option><option value="ar">العربية</option><option value="tr">Türkçe</option></select></Field>
                            <div className="sm:col-span-2"><Field id="o-addr" label={t('org_addr')}><input id="o-addr" value={d.org.address} onChange={e => setIn('org', 'address', e.target.value)} className={inputCls} /></Field></div>
                            <div className="sm:col-span-2"><Field label={t('logo')} error={err('org.logo')}><LogoUpload kit={kit} t={t} value={d.org.logo} onChange={v => setIn('org', 'logo', v)} /></Field></div>
                        </div></div>
                </div>)}

                {step === 3 && (<div className="space-y-6">
                    <div><h2 className="font-bold text-lg mb-3 text-slate-800">{t('layout')}</h2>
                        <div className="flex flex-wrap gap-2">{['double', 'single'].map(l => <button key={l} type="button" onClick={() => set({ layout: l })} aria-pressed={d.layout === l} className={`${btn} border ${d.layout === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/80 text-slate-700'}`}>{t(l)}</button>)}</div></div>
                    {(maxV === 0 || maxV > 1) && (<div><p className="font-bold text-slate-700 mb-2">{t('variants_q')}</p>
                        <div className="flex flex-wrap gap-2">{[[false, 'no_variants'], [true, 'yes_variants']].map(([v, k]) => <button key={k} type="button" onClick={() => set({ multi: v })} aria-pressed={d.multi === v} className={`${btn} border ${d.multi === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/80 text-slate-700'}`}>{t(k)}</button>)}</div></div>)}
                    {d.multi && <Field id="variantField" label={`${t('variant_field')} *`} error={err('variantField')} hint={t('variant_field_hint')}><input id="variantField" value={d.variantField} onChange={e => set({ variantField: e.target.value })} placeholder={t('variant_field_ph')} className={`${inputCls} max-w-md`} /></Field>}
                    <p className="text-sm text-slate-500 flex items-center gap-2"><Icon name="Info" className="w-4 h-4 shrink-0" />{t('design_hint')}</p>
                    {err('variants') && <p role="alert" className="text-red-600 text-sm font-bold">{err('variants')}</p>}
                    <div className="space-y-4">
                        {variantList.map((v, i) => {
                            const ref = v.fm ? v.fm.w / v.fm.h : null;
                            return (
                                <div key={i} className="bg-white/70 border rounded-2xl p-4">
                                    {d.multi && <div className="flex items-end gap-2 mb-3"><div className="flex-1"><Field id={`v-name-${i}`} label={`${t('variant_name')} ${fmtNum(i + 1, lang)}`} error={err(`variants.${i}.name`)}><input id={`v-name-${i}`} value={v.name} onChange={e => updVariant(i, { name: e.target.value })} placeholder={t('variant_name_ph')} className={inputCls} /></Field></div>
                                        {d.variants.length > 1 && <button type="button" onClick={() => setD(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }))} aria-label={t('remove')} className="p-2.5 rounded-xl text-red-600 hover:bg-red-50 mb-0.5"><Icon name="Trash2" className="w-5 h-5" /></button>}</div>}
                                    <div className="flex flex-wrap gap-4">
                                        <DesignSlot kit={kit} t={t} label={t('front')} value={v.front} meta={v.fm} error={err(`variants.${i}.front`)} onChange={(url, m) => updVariant(i, { front: url, fm: m })} />
                                        {d.layout === 'double' && <DesignSlot kit={kit} t={t} label={t('back')} value={v.back} meta={v.bm} refRatio={ref} error={err(`variants.${i}.back`)} onChange={(url, m) => updVariant(i, { back: url, bm: m })} />}
                                    </div>
                                    {(err(`variants.${i}.front`) || err(`variants.${i}.back`)) && <p role="alert" className="text-red-600 text-xs font-bold mt-2">{err(`variants.${i}.front`) || err(`variants.${i}.back`)}</p>}
                                </div>
                            );
                        })}
                    </div>
                    {d.multi && (maxV === 0 || d.variants.length < maxV) && <button type="button" onClick={() => setD(p => ({ ...p, variants: [...p.variants, { name: '', front: '', back: '', fm: null, bm: null }] }))} className="w-full border-2 border-dashed border-indigo-200 text-indigo-700 font-bold rounded-2xl py-3 hover:bg-indigo-50">+ {t('add_variant')}</button>}
                    {d.multi && maxV > 0 && <p className="text-xs text-slate-500">{t('max_variants', fmtNum(maxV, lang))}</p>}
                </div>)}

                {step === 4 && (<div className="space-y-4">
                    <div><h2 className="font-bold text-lg text-slate-800">{t('fields_title')}</h2><p className="text-sm text-slate-500 mt-1">{t('fields_hint')}</p></div>
                    {d.multi && d.variantField.trim() && <p className="text-sm bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-xl px-3 py-2">{t('variant_auto', d.variantField.trim())}</p>}
                    {err('fields') && <p role="alert" className="text-red-600 text-sm font-bold">{err('fields')}</p>}
                    {d.fields.map((f, i) => (
                        <div key={i} className="bg-white/70 border rounded-2xl p-4 space-y-3">
                            <div className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
                                <Field id={`f-l-${i}`} label={t('f_label')}><input id={`f-l-${i}`} value={f.label} onChange={e => updField(i, { label: e.target.value })} className={inputCls} /></Field>
                                <Field id={`f-t-${i}`} label={t('f_type')}><select id={`f-t-${i}`} value={f.type} onChange={e => updField(i, { type: e.target.value })} className={inputCls}>{['text', 'select', 'date', 'photo', 'number'].map(x => <option key={x} value={x}>{t('t_' + x)}</option>)}</select></Field>
                                <button type="button" onClick={() => setD(p => ({ ...p, fields: p.fields.filter((_, j) => j !== i) }))} aria-label={t('remove')} className="p-2.5 rounded-xl text-red-600 hover:bg-red-50 justify-self-end"><Icon name="Trash2" className="w-5 h-5" /></button>
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.required} onChange={e => updField(i, { required: e.target.checked })} className="accent-indigo-600 w-4 h-4" />{t('f_required')}</label><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.onCard} onChange={e => updField(i, { onCard: e.target.checked })} className="accent-indigo-600 w-4 h-4" />{t('f_oncard')}</label></div>
                            {f.type === 'select' && <Field id={`f-o-${i}`} label={t('f_options')}><textarea id={`f-o-${i}`} rows={3} value={f.options} onChange={e => updField(i, { options: e.target.value })} className={inputCls} /></Field>}
                        </div>
                    ))}
                    <button type="button" onClick={() => setD(p => ({ ...p, fields: [...p.fields, { label: '', type: 'text', required: false, onCard: true, options: '' }] }))} className="w-full border-2 border-dashed border-indigo-200 text-indigo-700 font-bold rounded-2xl py-3 hover:bg-indigo-50">+ {t('add_field')}</button>
                </div>)}

                {step === 5 && plan && (<div className="grid lg:grid-cols-[1fr_320px] gap-6">
                    <div className="space-y-5">
                        <Field id="notes" label={t('notes')}><textarea id="notes" rows={4} value={d.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('notes_ph')} className={inputCls} /></Field>
                        <div><label className="flex items-start gap-2 cursor-pointer font-bold text-slate-700"><input type="checkbox" checked={d.acceptTerms} onChange={e => { set({ acceptTerms: e.target.checked }); setErrs({}); }} className="accent-indigo-600 w-5 h-5 mt-0.5" />{t('accept')}</label>
                            <button type="button" onClick={() => setShowTerms(s => !s)} className="text-sm text-indigo-700 underline mt-1 ms-7">{t('read_terms')}</button>
                            {showTerms && <div className="mt-3 bg-white/80 border rounded-2xl p-4 text-sm leading-7 text-slate-600 whitespace-pre-line max-h-72 overflow-y-auto">{shop.terms[lang] || shop.terms.fa}</div>}
                            {err('acceptTerms') && <p role="alert" className="text-red-600 text-sm font-bold mt-2">{err('acceptTerms')}</p>}</div>
                    </div>
                    <aside className="bg-white/80 border rounded-2xl p-5 h-fit space-y-3 text-sm">
                        <h3 className="font-black text-slate-800 text-base">{t('summary')}</h3>
                        {[[t('plan'), plan.name[lang] || plan.name.fa], [t('org_name').split('(')[0], d.org.name], [t('mobile'), <span dir="ltr">{fmtNum(verified || '', lang)}</span>], [t('layout'), t(d.layout)], [t('variants_count'), fmtNum(variantList.length, lang)], [t('fields_count'), fmtNum(d.fields.filter(f => f.label.trim()).length + (d.multi ? 1 : 0), lang)]].map(([k, v], i) => <div key={i} className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="font-bold text-slate-800 text-end">{v}</span></div>)}
                        <div className="border-t pt-3 flex justify-between items-baseline"><span className="font-bold text-slate-700">{t('amount')}</span><span><b className="text-xl text-slate-900">{fmtMoney(plan.price, lang)}</b> <span className="text-xs text-slate-500">{t('toman')}</span></span></div>
                        <button type="button" onClick={pay} disabled={paying || !shop.payReady} className="w-full btn-grad py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Icon name="CreditCard" className="w-5 h-5" /> {paying ? t('paying') : t('pay')}</button>
                        {!shop.payReady && <p className="text-xs text-amber-700">{t('shop_off')}</p>}
                    </aside>
                </div>)}

                <div className="flex justify-between gap-3 mt-8 pt-5 border-t border-slate-200/70">
                    {step > 0 ? <button type="button" onClick={() => go(step - 1)} className={`${btn} text-slate-600 hover:bg-slate-100`}>{t('prev')}</button> : <span />}
                    {step < steps.length - 1 && <button type="button" onClick={() => go(step + 1)} disabled={step === 1 && !verified} className={`${btn} btn-grad`}>{t('next')}</button>}
                </div>
            </section>
        </ShopShell>
    );
}

function LogoUpload({ kit, t, value, onChange }) {
    const { Icon, notifyError } = kit; const [busy, setBusy] = useState(false);
    const pick = async (f) => { if (!f) return; setBusy(true); try { const r = await uploadOrderFile(f, 'logo'); onChange(r.url); } catch (e) { notifyError(e); } setBusy(false); };
    return (
        <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white border flex items-center justify-center overflow-hidden">{value ? <img src={value} alt="" className="max-w-full max-h-full object-contain" /> : <Icon name="Image" className="w-6 h-6 text-slate-300" />}</div>
            <label className={`px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-sm cursor-pointer ${busy ? 'opacity-50 animate-pulse pointer-events-none' : ''}`}>{busy ? t('uploading') : (value ? t('replace') : t('upload'))}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { const f = e.target.files[0]; e.target.value = ''; pick(f); }} /></label>
            {value && <button type="button" onClick={() => onChange('')} className="text-sm text-slate-500 underline">{t('remove')}</button>}
        </div>
    );
}

const STATUS_CLS = { pending_payment: 'bg-amber-50 text-amber-800 border-amber-200', paid: 'bg-sky-50 text-sky-800 border-sky-200', in_progress: 'bg-indigo-50 text-indigo-800 border-indigo-200', delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200' };
const fmtDate = (s, lang) => { if (!s) return '—'; try { const d = new Date(String(s).replace(' ', 'T')); return d.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return s; } };

function OrderCard({ kit, t, lang, order, onPay, onRenew, paying, expanded = true }) {
    const { Icon } = kit;
    const steps = ['pending_payment', 'paid', 'in_progress', 'delivered']; const idx = steps.indexOf(order.status);
    return (
        <div className="bg-white/80 border rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="me-auto"><div className="text-xs text-slate-500">{t('order_code')}</div><div className="font-black text-xl text-slate-800" dir="ltr">{fmtNum(order.code, lang)}</div></div>
                {order.type === 'renewal' && <span className="text-xs font-bold bg-violet-50 text-violet-700 rounded-full px-2.5 py-1">{t('renewal')}</span>}
                <span className={`text-sm font-bold border rounded-full px-3 py-1 ${STATUS_CLS[order.status] || ''}`}>{t('st_' + order.status)}</span>
            </div>
            {expanded && order.status !== 'cancelled' && (
                <ol className="grid grid-cols-4 gap-1" aria-label="progress">{steps.map((s, i) => <li key={s} className="text-center"><div className={`h-1.5 rounded-full ${i <= idx ? 'bg-indigo-500' : 'bg-slate-200'}`} /><span className={`text-[10px] sm:text-xs mt-1 block ${i <= idx ? 'text-indigo-700 font-bold' : 'text-slate-400'}`}>{t('st_' + s).split('—')[0]}</span></li>)}</ol>
            )}
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[[t('org_name').split('(')[0], order.orgName], [t('plan'), order.planName], [t('amount'), `${fmtMoney(order.amount, lang)} ${t('toman')}`], [t('created'), fmtDate(order.createdAt, lang)], order.refId && [t('ref_id'), <span dir="ltr">{fmtNum(order.refId, lang)}</span>], order.activeUntil && [t('active_until'), fmtDate(order.activeUntil, lang)], order.cardLimit > 0 && [t('card_limit'), fmtNum(order.cardLimit, lang)]].filter(Boolean).map(([k, v], i) => <div key={i} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-800 text-end">{v}</dd></div>)}
            </dl>
            <div className="flex flex-wrap gap-2">
                {order.status === 'pending_payment' && <button type="button" onClick={() => onPay(order)} disabled={paying} className="btn-grad px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"><Icon name="CreditCard" className="w-4 h-4" /> {paying ? t('paying') : `${t('pay_now')} — ${fmtMoney(order.amount, lang)} ${t('toman')}`}</button>}
                {order.tenantLink && <a href={order.tenantLink} className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 text-white flex items-center gap-2"><Icon name="ExternalLink" className="w-4 h-4" /> {t('open_system')}</a>}
                {onRenew && order.tenantLink && order.type === 'new' && <button type="button" onClick={() => onRenew(order)} className="px-5 py-2.5 rounded-xl font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-2"><Icon name="RefreshCw" className="w-4 h-4" /> {t('renew')}</button>}
            </div>
        </div>
    );
}

/** صفحه‌ی وضعیت یک سفارش (بعد از بازگشت از درگاه یا از لینک پیامک). */
export function OrderStatusPage({ kit, lang, setLang }) {
    const { apiGet, apiPost, notifyError } = kit; const t = useShopStrings(lang);
    const qp = new URLSearchParams(location.search); const [order, setOrder] = useState(null); const [error, setError] = useState(''); const [paying, setPaying] = useState(false);
    const payResult = qp.get('pay');
    useEffect(() => { apiGet('order_status', { o: qp.get('o') || '', k: qp.get('k') || '', lang }).then(r => setOrder(r.order)).catch(e => setError(e.message)); }, [lang]);
    const pay = async (o) => { setPaying(true); try { const r = await apiPost('order_pay', { id: o.id, token: o.token }); location.href = r.url; } catch (e) { notifyError(e); setPaying(false); } };
    return (
        <ShopShell kit={kit} lang={lang} setLang={setLang} title={t('order_code')}>
            {payResult === 'ok' && order && order.status !== 'pending_payment' && <div role="status" className="mb-5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 font-bold">{t('pay_ok')}</div>}
            {payResult === 'failed' && order && order.status === 'pending_payment' && <div role="alert" className="mb-5 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 font-bold">{t('pay_failed')} {order.payError}</div>}
            {error ? <div className="glass rounded-3xl p-8 text-center text-red-700">{error}</div> : !order ? <p className="text-center text-slate-500 py-20">{t('loading')}</p> : <OrderCard kit={kit} t={t} lang={lang} order={order} onPay={pay} paying={paying} />}
            <p className="mt-6 text-center"><a href={`./track${lang === 'en' ? '?lang=en' : ''}`} className="text-indigo-700 font-bold underline">{t('track_title')}</a></p>
        </ShopShell>
    );
}

/** پیگیری سفارش با موبایل و کد پیامکی؛ تمدید پلن برای سامانه‌های تحویل‌شده. */
export function TrackPage({ kit, lang, setLang }) {
    const { apiGet, apiPost, notifyError, Icon } = kit; const t = useShopStrings(lang);
    const [shop, setShop] = useState(null); const [mobile, setMobile] = useState(null); const [orders, setOrders] = useState(null);
    const [renewFor, setRenewFor] = useState(null); const [renewPlan, setRenewPlan] = useState(''); const [paying, setPaying] = useState(false);
    const load = useCallback(() => apiGet('my_orders', { lang }).then(r => { setMobile(r.mobile); setOrders(r.orders); }).catch(e => { if (e.status === 401) { setMobile(null); setOrders(null); } else notifyError(e); }), [lang]);
    useEffect(() => { apiGet('shop_info').then(s => { setShop(s); if (s.verifiedMobile) load(); }).catch(notifyError); }, [lang]);
    const pay = async (o) => { setPaying(true); try { const r = await apiPost('order_pay', { id: o.id, token: o.token }); location.href = r.url; } catch (e) { notifyError(e); setPaying(false); } };
    const renew = async () => {
        if (!renewPlan) return; setPaying(true);
        try { const r = await apiPost('order_renew', { orderId: renewFor.id, planId: renewPlan, lang }); await pay(r.order); } catch (e) { notifyError(e); setPaying(false); }
    };
    return (
        <ShopShell kit={kit} lang={lang} setLang={setLang} title={t('track_title')}>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 mb-6">{t('track_title')}</h1>
            {!shop ? <p className="text-center text-slate-500 py-20">{t('loading')}</p> : !mobile ? (
                <section className="glass rounded-3xl p-5 sm:p-8"><p className="text-slate-600 mb-5">{t('track_hint')}</p><MobileVerify kit={kit} t={t} lang={lang} verified={null} smsReady={shop.smsReady} onVerified={(m) => { if (m) load(); }} /></section>
            ) : (
                <section className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3"><h2 className="font-bold text-lg text-slate-800 me-auto">{t('my_orders')} <span className="text-sm text-slate-500 font-normal" dir="ltr">({fmtNum(mobile, lang)})</span></h2>
                        <a href={`./order${lang === 'en' ? '?lang=en' : ''}`} className="btn-grad px-4 py-2 rounded-xl font-bold text-sm">+ {t('new_order')}</a>
                        <button type="button" onClick={() => apiPost('otp_logout').then(() => { setMobile(null); setOrders(null); })} className="text-sm text-slate-600 font-bold px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center gap-1"><Icon name="LogOut" className="w-4 h-4" /> {t('logout')}</button></div>
                    {orders && orders.length === 0 && <div className="glass rounded-3xl p-8 text-center text-slate-500">{t('no_orders')}</div>}
                    {(orders || []).map(o => <OrderCard key={o.id} kit={kit} t={t} lang={lang} order={o} onPay={pay} paying={paying} onRenew={(x) => { setRenewFor(x); setRenewPlan(x.planId); }} />)}
                </section>
            )}
            {renewFor && shop && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setRenewFor(null)}>
                    <div role="dialog" aria-modal="true" aria-label={t('renew_title')} className="glass-strong rounded-3xl p-6 w-full max-w-3xl my-8">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-black text-lg text-slate-800">{t('renew_title')} — {renewFor.orgName}</h3><button type="button" onClick={() => setRenewFor(null)} aria-label="×" className="p-2 rounded-full bg-slate-100"><Icon name="X" className="w-4 h-4" /></button></div>
                        <PlanCards plans={shop.plans} lang={lang} t={t} selected={renewPlan} onSelect={setRenewPlan} />
                        <button type="button" onClick={renew} disabled={paying || !renewPlan || !shop.payReady} className="mt-5 w-full btn-grad py-3 rounded-xl font-bold">{paying ? t('paying') : t('pay')}</button>
                    </div>
                </div>
            )}
        </ShopShell>
    );
}
