import jalaali from 'jalaali-js';
import { UIHost, notify, notifySuccess, notifyError, askConfirm, askPrompt, useEscape } from './ui.jsx';
import { useUndoableState, isTypingTarget } from './history.js';
import { canvasesToPdf, downloadBlob } from './pdf.js';
import { CardShowcase3D } from './showcase.jsx';
import { ReportsPanel } from './reports.jsx';
import JSZip from 'jszip';
import { readSpreadsheet, writeXlsx } from './xlsx.js';

const { useState, useEffect, useRef, useMemo } = React;

// ==========================================
// 1. CORE UTILITIES & HELPERS
// ==========================================

// --- ارتباط با سرور ---
// همه‌ی درخواست‌ها با کوکی سشن و هدر X-Requested-With (محافظت CSRF) ارسال می‌شوند.
const api = async (action, { method = 'GET', body, params } = {}) => {
    const qs = new URLSearchParams({ action, ...(params || {}) });
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    const res = await fetch(`api.php?${qs}`, { method, credentials: 'same-origin', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (e) { throw Object.assign(new Error('پاسخ نامعتبر از سرور'), { status: res.status }); }
    if (!res.ok || (data && data.error)) {
        const err = Object.assign(new Error((data && data.error) || `HTTP ${res.status}`), { status: res.status, field: data && data.field, retryAfter: data && data.retryAfter });
        if (res.status === 401 && !action.startsWith('login_')) window.dispatchEvent(new CustomEvent('session-expired'));
        throw err;
    }
    return data;
};
const apiGet = (action, params) => api(action, { params });
const apiPost = (action, body) => api(action, { method: 'POST', body: body || {} });

// --- تقویم (jalaali-js داخل باندل است و به CDN وابسته نیست) ---
const j2g = (jy, jm, jd) => { const g = jalaali.toGregorian(jy, jm, jd); return [g.gy, g.gm, g.gd]; };
const g2j = (gy, gm, gd) => { const j = jalaali.toJalaali(gy, gm, gd); return [j.jy, j.jm, j.jd]; };
const getDaysInMonth = (yStr, mStr, inCal) => {
    if (!mStr) return 31;
    const m = parseInt(mStr, 10);
    if (inCal === 'gregorian') { const y = parseInt(yStr || '2000', 10); return new Date(y, m, 0).getDate(); }
    const y = parseInt(yStr || '1403', 10); // سال کبیسه، تا قبل از انتخاب سال، روز ۳۰ اسفند قابل انتخاب باشد
    return jalaali.jalaaliMonthLength(y, m);
};

const faMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const normalizeFa = (s) => s ? s.toString().replace(/ي/g, 'ی').replace(/ك/g, 'ک') : '';
const toPersianNum = (s) => s ? s.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/[٠-٩]/g, d => '۰۱۲۳۴۵۶۷۸۹'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]) : '';
const toEnglishNum = (s) => s ? s.toString().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : '';
const FA_LETTERS = 'آاأإبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیيكئءؤۀة';
const FA_TEXT_INVALID = new RegExp(`[^${FA_LETTERS}\\s\\u200C]`, 'g');
const FA_MIXED_INVALID = new RegExp(`[^${FA_LETTERS}۰-۹\\s\\-\\.\\,\\(\\)\\/\\u200C]`, 'g');

const SHAPES = { RECTANGLE: 'مستطیل', ROUNDED: 'مستطیل گوشه گرد', CIRCLE: 'دایره', OVAL: 'بیضی' };
const DEFAULT_FONTS = ['Vazirmatn', 'Tahoma', 'Arial', 'Times New Roman', 'Courier New'];
// ابعاد پیش‌فرض بوم (وقتی تصویر پس‌زمینه وجود ندارد). با تصویر پس‌زمینه، ابعاد خود تصویر ملاک است.
const CANVAS_PRESETS = [
    { key: 'card_h', label: 'کارت افقی (۸۰۰×۵۰۰)', w: 800, h: 500 },
    { key: 'card_v', label: 'کارت عمودی (۵۰۰×۸۰۰)', w: 500, h: 800 },
    { key: 'square', label: 'مربع (۱۰۸۰×۱۰۸۰)', w: 1080, h: 1080 },
    { key: 'story', label: 'پوستر/استوری عمودی (۱۰۸۰×۱۹۲۰)', w: 1080, h: 1920 },
    { key: 'post', label: 'پست عمودی (۱۰۸۰×۱۳۵۰)', w: 1080, h: 1350 },
    { key: 'a4_p', label: 'A4 عمودی (۱۲۴۰×۱۷۵۴)', w: 1240, h: 1754 },
    { key: 'a4_l', label: 'A4 افقی (۱۷۵۴×۱۲۴۰)', w: 1754, h: 1240 },
    { key: 'banner', label: 'بنر افقی (۱۹۲۰×۱۰۸۰)', w: 1920, h: 1080 },
];
const getCanvasDefault = (config) => ({ w: Number(config && config.canvasW) || 800, h: Number(config && config.canvasH) || 500 });
const isSingleSided = (config) => !!config && config.cardLayout === 'single';
// حالت ابعاد بوم: auto = ابعاد از عکس زمینه (پیش‌فرض و رفتار قبلی)، fixed = ابعاد ثابت و عکس زمینه داخل آن جا می‌گیرد
const isFixedCanvas = (config) => !!config && config.canvasMode === 'fixed';
const BG_FITS = [{ key: 'stretch', label: 'کشیدن به اندازه‌ی بوم' }, { key: 'cover', label: 'پوشش کامل (برش اضافه‌ها)' }, { key: 'contain', label: 'جای‌گیری کامل (با حاشیه)' }];
const bgFitOf = (config) => isFixedCanvas(config) ? (config.bgFit || 'stretch') : 'stretch';
const BG_FIT_CSS = { stretch: '100% 100%', cover: 'cover', contain: 'contain' };
/** رسم عکس زمینه در بوم با حالت جای‌گیری (کشیدن / پوشش / جای‌گیری کامل). */
const drawImageFit = (ctx, img, W, H, fit) => {
    if (fit === 'cover' || fit === 'contain') {
        const s = fit === 'cover' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height);
        const w = img.width * s; const h = img.height * s; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else ctx.drawImage(img, 0, 0, W, H);
};
const sameDim = (a, b) => !!a && !!b && a.w === b.w && a.h === b.h;
const sameRatio = (a, b) => !!a && !!b && Math.abs(a.w / a.h - b.w / b.h) < 0.01;
// حداکثر ضلع بلند تصاویر پس‌زمینه/لایه هنگام آپلود (برای کیفیت چاپ پوستر و A4)
const BG_MAX_SIZE = 2400;
/** مختصات فیلدها (و لایه‌های Overlay شرطی) یک روی کارت را با ضریب جدید مقیاس می‌دهد؛ برای تغییر ابعاد بوم/پس‌زمینه. */
const scaleSideFields = (data, side, sx, sy) => {
    const sf = Math.min(sx, sy);
    return {
        ...data,
        fields: (data.fields || []).map(f => f.side !== side ? f : { ...f, x: f.x * sx, y: f.y * sy, w: f.w * sx, h: f.h * sy, maxFontSize: f.maxFontSize ? Math.max(8, Math.round(f.maxFontSize * sf)) : f.maxFontSize, strokeWidth: f.strokeWidth ? f.strokeWidth * sf : f.strokeWidth, shadowBlur: f.shadowBlur ? f.shadowBlur * sf : f.shadowBlur }),
        conditions: (data.conditions || []).map(c => (c.overlaySide || 'front') !== side ? c : { ...c, overlayX: (c.overlayX || 0) * sx, overlayY: (c.overlayY || 0) * sy, overlayW: (c.overlayW || 100) * sx, overlayH: (c.overlayH || 100) * sy }),
    };
};
const isEnTextType = (f) => f.textType === 'en_text' || f.textType === 'en_num' || f.textType === 'en_mixed' || f.autoIncrement;
const cssUrl = (u) => u ? `url("${String(u).replace(/["\\\n\r]/g, '')}")` : 'none';

// --- فونت‌ها ---
// فهرست فونت‌های کتابخانه مرکزی؛ با fetchGlobalFonts پر می‌شود و رندر کارت از آن برای لود فونت استفاده می‌کند.
let globalFontRegistry = [];
const fontLoadCache = {};
const loadFontFace = (name, url) => {
    if (!name || !url) return Promise.resolve(false);
    if (!fontLoadCache[name]) {
        fontLoadCache[name] = new FontFace(name, cssUrl(url)).load()
            .then(face => { document.fonts.add(face); return true; })
            .catch(() => { delete fontLoadCache[name]; return false; });
    }
    return fontLoadCache[name];
};
// فونت‌های کتابخانه فقط معرفی می‌شوند و تا وقتی متنی با آن‌ها نمایش داده نشود دانلود نمی‌شوند
// (پیش‌تر همه‌ی فایل‌های فونت هنگام باز شدن صفحه دانلود می‌شد). رسم کارت با ensureFonts فونت لازم را کامل بارگذاری می‌کند.
const registeredFonts = new Set();
const registerFontFace = (name, url) => {
    if (!name || !url || registeredFonts.has(name) || fontLoadCache[name]) return;
    try { document.fonts.add(new FontFace(name, cssUrl(url))); registeredFonts.add(name); } catch (e) { }
};
const injectGlobalFonts = (fonts) => (fonts || []).forEach(f => registerFontFace(f.font_name, f.font_url));
const collectFontFamilies = (config) => [...new Set((config.fields || []).filter(f => f.printOnCard && ['text', 'select', 'date', 'photo'].includes(f.type)).map(f => f.fontFamily || 'Vazirmatn'))];
/** مطمئن می‌شود همه‌ی فونت‌های مورد نیاز کارت واقعاً لود شده‌اند (با چند بار تلاش). خروجی: موفق بودن همه. */
const ensureFonts = async (families, legacyCustomFonts = [], retries = 3) => {
    let allOk = true;
    for (const fam of families) {
        if (DEFAULT_FONTS.includes(fam) && fam !== 'Vazirmatn') continue;
        const src = globalFontRegistry.find(f => f.font_name === fam) || (legacyCustomFonts || []).map(f => ({ font_name: f.name, font_url: f.url })).find(f => f.font_name === fam);
        let ok = false;
        for (let i = 0; i < retries && !ok; i++) {
            try {
                if (src) await loadFontFace(src.font_name, src.font_url);
                const faces = await document.fonts.load(`bold 40px "${fam}"`);
                ok = faces.length > 0;
            } catch (e) { ok = false; }
            if (!ok) await new Promise(r => setTimeout(r, 400));
        }
        if (!ok) allOk = false;
    }
    return allOk;
};

// --- تصاویر ---
const readFileAsDataURL = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = reject; r.readAsDataURL(file); });
const loadImage = (src, crossOrigin = true) => new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && /^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('image load failed')); img.src = src;
});
/** تصویر را کوچک می‌کند. PNG با شفافیت حفظ می‌شود (برای لایه‌های Overlay). */
const compressImage = async (file, { maxSize = 800, keepTransparency = false } = {}) => {
    const img = await loadImage(await readFileAsDataURL(file), false);
    let width = img.width; let height = img.height;
    if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width); canvas.height = Math.round(height); const ctx = canvas.getContext('2d');
    if (keepTransparency && file.type === 'image/png') { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/png'); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
};
/** تصویر را فشرده و روی سرور آپلود می‌کند و آدرس فایل را برمی‌گرداند (به‌جای ذخیره base64 در دیتابیس). */
const uploadImageFile = async (file, opts) => {
    try { const dataUrl = await compressImage(file, opts); const r = await apiPost('upload_image', { image: dataUrl }); return r.url; }
    catch (e) { notifyError(e, 'خطا در آپلود تصویر'); return null; }
};

// --- اعتبارسنجی فیلدها ---
const getLengthError = (f, val, t) => {
    if (!f.hasLengthLimit || !val || f.linkedFieldId || f.autoIncrement) return null;
    const limits = Array.isArray(f.lengthLimits) ? f.lengthLimits.filter(n => n !== '' && !isNaN(n) && Number(n) > 0).map(Number) : (f.lengthLimit ? [Number(f.lengthLimit)] : []);
    if (limits.length === 0) return null;
    if (!limits.includes(val.length)) return `${t('exact_digits')} ${limits.join(' یا ')}`;
    return null;
};
const getRegexError = (f, val, globalValidations) => {
    if (!val || !f.validationId || f.textType === 'free' || f.linkedFieldId || f.autoIncrement || !globalValidations) return null;
    const rule = globalValidations.find(v => String(v.id) === String(f.validationId));
    if (!rule) return null;
    try { return new RegExp(rule.pattern).test(val) ? null : (rule.error_msg || 'مقدار نامعتبر است'); } catch (e) { return null; }
};
/** خطای ماندگار فیلد (بر خلاف هشدارهای لحظه‌ای تایپ، تا اصلاح مقدار باقی می‌ماند و جلوی ثبت را می‌گیرد). */
const getStarsError = (f, val, t) => {
    if (f.litSource === 'issued' || val === undefined || val === null || val === '') return null;
    const total = starsTotal(f); const s = toEnglishNum(val);
    return /^\d+$/.test(s) && parseInt(s, 10) <= total ? null : t('stars_range', total);
};
const getFieldError = (f, val, t, globalValidations) => f.type === 'text' ? (getLengthError(f, val, t) || getRegexError(f, val, globalValidations)) : (f.type === 'stars' ? getStarsError(f, val, t) : null);
/** المان‌های ستاره با ورودی کاربر که خالی مانده‌اند (برای پیام «الزامی» هنگام ثبت). */
const missingStarsField = (fields, formData) => fields.find(f => f.type === 'stars' && f.litSource !== 'issued' && (formData[f.id] === undefined || formData[f.id] === ''));
// فیلدهایی که خودکار پر می‌شوند (QR استعلام، تاریخ صدور/انقضا) در فرم نمایش داده نمی‌شوند
/** ترتیب فیلدها در فرم (مستقل از ترتیب لایه‌ها روی کارت): فیلدهایی که در formOrder نیستند به ترتیب طراحی در انتها می‌آیند. */
const applyFormOrder = (fields, order) => {
    if (!Array.isArray(order) || !order.length) return fields;
    const idx = new Map(order.map((id, i) => [id, i])); const rank = (f, i) => (idx.has(f.id) ? idx.get(f.id) : order.length + i);
    return fields.map((f, i) => [f, rank(f, i)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
};
const getVisibleFields = (fields, config) => applyFormOrder((fields || []).filter(f => !(isSingleSided(config) && f.side === 'back')).filter(f => !((f.type === 'barcode' || f.type === 'qrcode') && f.linkedFieldId) && !(f.type === 'text' && f.linkedFieldId && !f.linkedColumn) && !(f.type === 'qrcode' && f.qrSource === 'verify') && !(f.type === 'date' && f.dateSource && f.dateSource !== 'input')), config && config.formOrder);
// --- آدرس پایه‌ی برنامه و آدرس اختصاصی سازمان (/superadmin/acme یا ?org=acme) ---
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED_SLUGS = ['assets', 'uploads', 'tools', 'src', 'api', 'index', 'admin', 'superadmin', 'node_modules', 'verify', 'login', 'logout', 'public', 'static'];
const PATH_ORG = (() => { const last = window.location.pathname.split('/').pop(); return SLUG_RE.test(last) && !RESERVED_SLUGS.includes(last) ? last : ''; })();
const APP_BASE = PATH_ORG ? window.location.pathname.slice(0, -PATH_ORG.length) : window.location.pathname.replace(/[^/]*$/, '');
// تنظیمات پلتفرم (نام، لوگو، آیکون تب، فوتر، رنگ‌ها، امنیت): سوپرادمین از «تنظیمات پلتفرم» تعیین می‌کند.
// اگر لوگو تعیین نشده یا لینکش خراب باشد، لوگوی محلی نمایش داده می‌شود.
const DEFAULT_LOGO = `${APP_BASE}assets/logo.svg`;
let platformState; const platformListeners = new Set();
const setPlatform = (p) => { platformState = { ...DEFAULT_PLATFORM, ...(p || {}), footer: { ...DEFAULT_PLATFORM.footer, ...((p && p.footer) || {}) } }; platformListeners.forEach(f => f()); };
const subscribePlatform = (cb) => { platformListeners.add(cb); return () => platformListeners.delete(cb); };
const usePlatform = () => React.useSyncExternalStore(subscribePlatform, () => platformState);
const usePlatformLogo = () => usePlatform().logoUrl;
// حالت نمایش (روشن / تیره / خودکار طبق تنظیم سیستم‌عامل)، جداگانه برای هر مرورگر. index.html همین را پیش از بارگذاری اعمال می‌کند تا صفحه چشمک نزند.
const THEME_KEY = 'ui_theme'; const THEME_MODES = ['light', 'dark', 'system'];
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let themeMode = (() => { try { const v = localStorage.getItem(THEME_KEY); return THEME_MODES.includes(v) ? v : 'system'; } catch (e) { return 'system'; } })();
const themeListeners = new Set();
const applyTheme = () => document.documentElement.classList.toggle('dark', themeMode === 'dark' || (themeMode === 'system' && !!(darkQuery && darkQuery.matches)));
// تغییر حالت با محو شدن نرم: View Transitions (کل صفحه، حتی گرادیانت پس‌زمینه) و در مرورگرهای قدیمی‌تر، انتقال رنگ‌ها با CSS.
// اگر کاربر «کاهش حرکت» را روشن کرده باشد، بی‌درنگ عوض می‌شود.
let themeFadeTimer = 0;
const fadeTheme = (update) => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return update();
    if (document.startViewTransition) { document.startViewTransition(update); return; }
    const root = document.documentElement; root.classList.add('theme-fading'); update();
    clearTimeout(themeFadeTimer); themeFadeTimer = setTimeout(() => root.classList.remove('theme-fading'), 600);
};
const notifyTheme = () => { fadeTheme(applyTheme); themeListeners.forEach(f => f()); };
const setThemeMode = (m) => { themeMode = m; try { localStorage.setItem(THEME_KEY, m); } catch (e) { } notifyTheme(); };
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (themeMode === 'system') notifyTheme(); });
window.addEventListener('storage', (e) => { if (e.key === THEME_KEY && THEME_MODES.includes(e.newValue)) { themeMode = e.newValue; notifyTheme(); } }); // هماهنگی بین تب‌ها
applyTheme();
const useThemeMode = () => React.useSyncExternalStore((cb) => { themeListeners.add(cb); return () => themeListeners.delete(cb); }, () => themeMode);
const THEME_ICON = { light: 'Sun', dark: 'Moon', system: 'SunMoon' };
/** دکمه‌ی حالت نمایش: با هر کلیک روشن ← تیره ← خودکار. compact = فقط آیکون. */
function ThemeToggle({ t, compact = false, className = '' }) {
    const mode = useThemeMode();
    const tr = (k, fa) => { const v = t ? t(k) : ''; return v && v !== k ? v : fa; };
    const label = { light: tr('theme_light', 'روشن'), dark: tr('theme_dark', 'تیره'), system: tr('theme_system', 'خودکار') };
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    const title = `${tr('theme_toggle', 'حالت نمایش')}: ${label[mode]} → ${label[next]}`;
    return (
        <button type="button" onClick={() => setThemeMode(next)} aria-label={`${tr('theme_toggle', 'حالت نمایش')}: ${label[mode]}`} title={title} data-theme-mode={mode}
            className={compact ? `p-1.5 rounded-lg hover:bg-slate-100 ${className}` : `flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-slate-50 text-slate-600 hover:bg-slate-100 border ${className}`}>
            <Icon name={THEME_ICON[mode]} className={compact ? 'w-5 h-5' : 'w-4 h-4'} />{!compact && <span>{label[mode]}</span>}
        </button>
    );
}
/** تصویر لوگو: لوگوی سازمان ← لوگوی پلتفرم ← لوگوی پیش‌فرض (در صورت خطای بارگذاری، گزینه‌ی بعدی). */
function LogoImg({ src, alt = '', className = '', usePlatform = true }) {
    const plat = usePlatformLogo();
    const chain = useMemo(() => [...new Set([src, usePlatform && plat, DEFAULT_LOGO].filter(u => u && /^(https?:\/\/|uploads\/|\/|\.\/)/i.test(u)))], [src, plat, usePlatform]);
    const [idx, setIdx] = useState(0);
    useEffect(() => setIdx(0), [chain.join('|')]);
    return <img src={chain[Math.min(idx, chain.length - 1)]} alt={alt} className={className} onError={() => setIdx(i => (i < chain.length - 1 ? i + 1 : i))} />;
}
const urlOrgKey = () => new URLSearchParams(window.location.search).get('org') || PATH_ORG;
// آیا سرور لینک کوتاه (mod_rewrite) را پشتیبانی می‌کند؟ یک بار بررسی می‌شود.
let rewriteCheck = null;
const useRewriteOk = () => {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        rewriteCheck = rewriteCheck || fetch(`${APP_BASE}__rewrite_ping`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.ok ? r.json() : null).then(d => !!(d && d.ok)).catch(() => false);
        let alive = true; rewriteCheck.then(v => { if (alive) setOk(v); }); return () => { alive = false; };
    }, []);
    return ok;
};
/** لینک ورود سازمان: آدرس اختصاصی (کوتاه در صورت پشتیبانی سرور) یا شناسه‌ی تصادفی. */
const tenantLinkFor = (tn, rewriteOk) => tn.slug && rewriteOk ? `${window.location.origin}${APP_BASE}${tn.slug}` : `${window.location.origin}${APP_BASE}?org=${encodeURIComponent(tn.slug || tn.id || '')}`;

// --- رنگ‌های گرادیانت پس‌زمینه (قابل تغییر برای هر سازمان) ---
const DEFAULT_THEME = { c1: '#f472b6', c2: '#38bdf8', c3: '#a855f7' };
const THEME_PRESETS = [
    { name: 'صورتی، آسمانی، بنفش', c1: '#f472b6', c2: '#38bdf8', c3: '#a855f7' },
    { name: 'اقیانوس', c1: '#22d3ee', c2: '#3b82f6', c3: '#6366f1' },
    { name: 'غروب', c1: '#fb923c', c2: '#f43f5e', c3: '#a855f7' },
    { name: 'جنگل', c1: '#34d399', c2: '#a3e635', c3: '#14b8a6' },
    { name: 'طلایی', c1: '#fbbf24', c2: '#f97316', c3: '#ec4899' },
    { name: 'نیلی', c1: '#818cf8', c2: '#0ea5e9', c3: '#7c3aed' },
    { name: 'یاسی', c1: '#f0abfc', c2: '#c4b5fd', c3: '#93c5fd' },
];
const themeOf = (tn) => ({ ...DEFAULT_THEME, ...((tn && tn.theme) || {}) });
// مقادیر پیش‌فرض باید با platform_defaults() در api.php یکی باشند
const DEFAULT_PLATFORM = {
    name: 'پلتفرم یکپارچه صدور کارت', logoUrl: '', faviconUrl: '',
    footer: { show: true, line1: 'Powered by Asva Studio', line2: 'توسعه یافته توسط شرکت داده‌پردازان اسوا', phone: '09966697806', link: 'https://t.me/+989966697806' },
    defaultTheme: DEFAULT_THEME, superTheme: DEFAULT_THEME, idleMinutes: 60, loginMaxAttempts: 5, loginLockMinutes: 15,
};
platformState = DEFAULT_PLATFORM;
/** پس‌زمینه‌ی گرادیانت سیال. fixed=false برای پیش‌نمایش داخل یک کادر. */
const LiquidBackground = ({ colors, fixed = true }) => (
    <div aria-hidden="true" className={`liquid-bg ${fixed ? 'fixed' : 'absolute'} inset-0`} style={colors ? { '--g1': colors.c1, '--g2': colors.c2, '--g3': colors.c3 } : undefined}>
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><span className="blob b4" /><span className="blob b5" />
    </div>
);

/** لینک استعلام اعتبار کارت (برای QR). */
const verifyUrl = (cd) => `${window.location.origin}${APP_BASE}?verify=${cd && cd._cid ? `${cd._cid}.${cd._vt}` : 'sample'}`;
const isoToSlash = (d) => d ? String(d).slice(0, 10).replace(/-/g, '/') : '';
const addDaysIso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const formHasErrors = (fields, formData, t, globalValidations) => fields.some(f => getFieldError(f, formData[f.id], t, globalValidations) !== null);

/** فقط کاراکترهای غیرمجاز را حذف می‌کند و هشدار لحظه‌ای نمایش می‌دهد. */
const handleTextChange = (e, field, setFormData, setWarnings, t) => {
    let val = e.target.value; let warn = '';
    if (field.textType === 'fa_text') { if (new RegExp(FA_TEXT_INVALID.source).test(val)) warn = t('only_fa'); val = val.replace(FA_TEXT_INVALID, ''); }
    else if (field.textType === 'en_text') { if (/[^a-zA-Z\s]/.test(val)) warn = t('only_en'); val = val.replace(/[^a-zA-Z\s]/g, ''); val = val.split(' ').map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '').join(' '); }
    else if (field.textType === 'fa_num') { val = toPersianNum(toEnglishNum(val)); if (/[^۰-۹]/.test(val)) warn = t('only_num'); val = val.replace(/[^۰-۹]/g, ''); }
    else if (field.textType === 'en_num') { val = toEnglishNum(val); if (/[^0-9]/.test(val)) warn = t('only_num'); val = val.replace(/[^0-9]/g, ''); }
    else if (field.textType === 'fa_mixed') { val = toPersianNum(toEnglishNum(val)); val = val.replace(FA_MIXED_INVALID, ''); }
    else if (field.textType === 'en_mixed') { val = toEnglishNum(val); val = val.replace(/[^a-zA-Z0-9\s\-\.\,\(\)\/]/g, ''); }
    setFormData(p => ({ ...p, [field.id]: val }));
    if (setWarnings) { setWarnings(p => ({ ...p, [field.id]: warn })); if (warn) setTimeout(() => setWarnings(p => ({ ...p, [field.id]: '' })), 3000); }
};

// --- خروجی CSV (با محافظت در برابر CSV/Formula Injection) ---
const csvCell = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
const exportToCSV = (cards, tenant, t) => {
    if (cards.length === 0) return notify(t('no_export_data'));
    const fields = applyFormOrder(tenant.fields || [], tenant.formOrder);
    const rows = [[t('row_num'), t('issue_date'), t('requester'), t('status'), t('expires_at'), ...fields.map(f => f.label)]];
    cards.forEach((c, idx) => rows.push([idx + 1, c.issuedAt, c.requesterName, t(`status_${c.status || 'active'}`), c.expiresAt || '', ...fields.map(f => { const val = (c.cardData || {})[f.id] || ''; return f.type === 'photo' && val ? '[IMAGE]' : val; })]));
    const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); const url = URL.createObjectURL(blob);
    link.setAttribute("href", url); link.setAttribute("download", `Cards_${(tenant.orgName || 'export').replace(/[\\/:*?"<>|]/g, '_')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const formatDateString = (y, m, d, inCal, outCal, format) => {
    if (!y || !m || !d) return '';
    let jy = parseInt(y, 10); let jm = parseInt(m, 10); let jd = parseInt(d, 10);
    let gy, gm, gd;
    if (inCal === 'jalali') {
        if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return '';
        [gy, gm, gd] = j2g(jy, jm, jd);
    } else {
        gy = jy; gm = jm; gd = jd;
    }

    let outStr = ''; let isRTL = true; const dObj = new Date(Date.UTC(gy, gm - 1, gd));
    if (outCal === 'lunar') { isRTL = true; if (format === 'TEXT') outStr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dObj); else outStr = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(dObj); outStr = toPersianNum(outStr); }
    else if (outCal === 'gregorian') { if ((format || '').startsWith('FA_')) { isRTL = true; if (format === 'FA_TEXT_FULL') outStr = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dObj); else outStr = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dObj); outStr = toPersianNum(outStr); } else { isRTL = false; const yStr = gy.toString(); const mStr = gm.toString().padStart(2, '0'); const dStr = gd.toString().padStart(2, '0'); if (format === 'DD/MM/YYYY') outStr = `${dStr}/${mStr}/${yStr}`; else if (format === 'MM/DD/YYYY') outStr = `${mStr}/${dStr}/${yStr}`; else if (format === 'TEXT_SHORT') outStr = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dObj); else if (format === 'TEXT_LONG') outStr = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dObj); else if (format === 'TEXT_FULL') outStr = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(dObj); else outStr = `${yStr}/${mStr}/${dStr}`; } }
    else { isRTL = true; const [jyRes, jmRes, jdRes] = g2j(gy, gm, gd); const yStr = jyRes.toString(); const mStr = jmRes.toString().padStart(2, '0'); const dStr = jdRes.toString().padStart(2, '0'); if (format === 'YYYY-MM-DD') outStr = toPersianNum(`${yStr}-${mStr}-${dStr}`); else if (format === 'TEXT_MIXED') outStr = toPersianNum(`${dStr} ${faMonths[jmRes - 1]} ${yStr}`); else if (format === 'TEXT_FULL') { const wd = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' }).format(dObj); outStr = toPersianNum(`${wd}، ${dStr} ${faMonths[jmRes - 1]} ${yStr}`); } else if (format === 'MONTH_YEAR') outStr = toPersianNum(`${faMonths[jmRes - 1]} ${yStr}`); else outStr = toPersianNum(`${yStr}/${mStr}/${dStr}`); }
    return (isRTL ? '‫' : '‪') + outStr + '‬';
};

const FALLBACK_FA = {
    "portal_title": "گذرگاه یکپارچه صدور کارت", "enter_passcode": "لطفاً کد عبور خود را وارد کنید.", "passcode": "کد عبور...",
    "login": "ورود به سامانه", "invalid_passcode": "کد وارد شده معتبر نیست. لطفاً مجدداً تلاش کنید.",
    "card_issued": "کارت شما صادر شد!", "edit_this_card": "ویرایش همین کارت", "issue_new_card": "صدور کارت جدید",
    "form_title": "ورود اطلاعات کارت", "clear_form": "پاکسازی فرم", "clear_confirm": "آیا از پاکسازی کامل فرم مطمئن هستید؟",
    "requester_name": "نام شما (درخواست دهنده):", "requester_placeholder": "مثال: علی رضایی", "req_name_empty": "لطفا نام درخواست دهنده را وارد کنید",
    "validation_error": "برخی از فیلدها خطای اعتبارسنجی دارند.", "processing": "در حال پردازش...", "submit_issue": "صدور و تولید کارت پرسنلی",
    "upload_gallery": "آپلود از گالری", "take_selfie": "گرفتن سلفی", "change_image": "تغییر تصویر", "expired": "منقضی شده",
    "manual_type": "تایپ دستی...", "back_to_list": "بازگشت به لیست", "select_option": "انتخاب کنید...", "other_manual": "سایر (ورود دستی)...",
    "day": "روز", "month": "ماه", "year": "سال", "manual_barcode": "ورود دستی بارکد...", "manual_qrcode": "محتوای دستی QR Code...",
    "only_fa": "فقط حروف فارسی", "only_en": "فقط حروف انگلیسی", "only_num": "فقط اعداد", "exact_digits": "تعداد ارقام باید دقیقاً",
    "crop_title": "تنظیم و برش عکس", "crop_desc": "کادر را جابجا کنید. برای تغییر سایز از دستگیره استفاده کنید.", "cancel": "انصراف",
    "confirm_crop": "تایید برش", "selfie_title": "گرفتن عکس (سلفی)", "submit_photo": "ثبت عکس", "cam_denied": "دسترسی به دوربین داده نشد.",
    "dashboard_title": "داشبورد مدیریت", "history_subtitle": "تاریخچه صدور کارت", "export_excel": "خروجی اکسل", "settings": "تنظیمات", "logout": "خروج",
    "history_count": "تاریخچه صدور", "search": "جستجو (نام، کد و...)", "row_num": "ردیف", "card_owner": "نام صاحب کارت", "requester": "درخواست‌دهنده",
    "issue_date": "تاریخ صدور", "status": "وضعیت", "actions": "عملیات", "loading": "در حال دریافت اطلاعات...", "no_records": "هیچ رکوردی یافت نشد.",
    "issued": "صادر شده", "font_err": "فونت", "view_print": "مشاهده و چاپ", "edit_info": "ویرایش اطلاعات", "delete_record": "حذف رکورد",
    "page_of": "صفحه {0} از {1}", "settings_panel": "تنظیمات پنل", "new_admin_pass": "رمز عبور مدیر جدید", "new_public_pass": "رمز عبور عمومی کارمندان جدید",
    "save_changes": "ذخیره تغییرات", "delete_confirm": "آیا از حذف این رکورد مطمئن هستید؟", "preview_card": "نمایش و صدور کارت", "render_loading": "در حال بارگذاری...",
    "download_front": "دانلود روی کارت", "download_image": "دانلود تصویر", "download_pdf": "دانلود PDF", "download_pdf_real": "دانلود PDF ({0} میلی‌متر)", "share": "اشتراک‌گذاری", "theme_toggle": "حالت نمایش", "theme_light": "روشن", "theme_dark": "تیره", "theme_system": "خودکار", "card_list": "فهرست کارت‌ها", "reports": "گزارش‌ها", "report_period": "بازه زمانی", "report_all_time": "همه", "report_last_days": "{0} روز اخیر", "report_variables": "متغیرهای گزارش", "report_no_fields": "این فرم فیلد انتخابی یا متنی ندارد.", "report_pick_vars": "برای دیدن نمودار، یک یا چند متغیر را از بالا انتخاب کنید.", "report_active_filters": "فیلترهای فعال", "report_total": "کل کارت‌های صادرشده", "report_timeline": "روند صدور کارت", "report_auto": "خودکار", "report_daily": "روزانه", "report_weekly": "هفتگی", "report_monthly": "ماهانه", "report_cards": "کارت", "report_cards_n": "{0} کارت", "report_by": "تعداد کارت بر اساس «{0}»", "report_distinct_n": "{0} مقدار متفاوت", "report_chart": "نمودار", "report_table": "جدول", "report_csv": "دانلود CSV", "report_csv_all": "خروجی گزارش", "report_count": "تعداد", "report_percent": "درصد", "report_other_n": "سایر ({0} مقدار)", "report_empty_value": "(خالی)", "report_filter_hint": "کلیک برای فیلتر سایر نمودارها با این مقدار", "report_legend": "راهنما", "report_single_value": "همه کارت‌ها مقدار «{0}» دارند.", "report_variable": "متغیر", "report_value": "مقدار", "remove": "حذف", "view_3d": "نمایش سه‌بعدی", "view_flat": "نمای تخت", "show_front": "روی کارت", "show_back": "پشت کارت", "pause_rotation": "توقف چرخش", "play_rotation": "ادامه چرخش", "showcase_hint": "برای چرخاندن کارت، آن را با ماوس یا انگشت بکشید.", "share_unsupported": "اشتراک‌گذاری فایل در این مرورگر پشتیبانی نمی‌شود؛ از دکمه‌ی دانلود استفاده کنید.", "image_format": "فرمت تصویر", "download_back": "دانلود پشت کارت", "print_pdf": "چاپ / تولید PDF", "no_export_data": "رکوردی برای خروجی وجود ندارد.",
    "error_server": "خطا در ارتباط با سرور", "org_not_found": "سازمان یافت نشد.", "success_save": "تنظیمات با موفقیت به‌روزرسانی شد.", "superadmin_panel": "پنل مدیریت",
    "manage_platforms": "مدیریت پلتفرم‌های سازمانی", "base_lists": "لیست‌های پایه", "new_org": "ساخت سازمان جدید", "new_org_desc": "راه‌اندازی پلتفرم اختصاصی",
    "admin_pass": "رمز مدیر", "public_pass": "رمز عمومی", "org_link": "لینک سازمان", "edit": "ویرایش", "delete": "حذف", "copy_org": "کپی کردن پلتفرم",
    "are_you_sure": "آیا مطمئن هستید؟", "delete_linked_confirm": "این پلتفرم فیلدهای متصل دارد. حذف شود؟", "yes": "بله", "no": "خیر", "step": "مرحله",
    "from": "از", "next_step": "مرحله بعد", "prev_step": "بازگشت", "final_publish": "تایید نهایی و انتشار", "saving": "در حال ثبت...", "platform_ready": "آماده انتشار!",
    "required_fields": "تکمیل فیلدهای هویتی الزامی است.", "pass_mismatch": "رمزها نمی‌توانند یکسان باشند.", "fix_errors": "لطفا خطاهای فرم را برطرف کنید.",
    "pass_min_length": "رمز باید حداقل ۴ کاراکتر باشد.", "pass_keep_hint": "خالی بگذارید تا رمز فعلی حفظ شود", "pass_is_set": "تعیین شده",
    "auto_serial": "(پس از ثبت به‌صورت خودکار تعیین می‌شود)", "font_warning": "برخی فونت‌ها لود نشدند؛ ممکن است کارت با فونت جایگزین نمایش داده شود.",
    "session_expired": "نشست شما منقضی شده است. لطفاً دوباره وارد شوید.",
    "action": "عملیات", "activity_log": "گزارش فعالیت", "actor": "انجام‌دهنده", "actor_admin": "مدیر سازمان", "actor_user": "کاربر", "actor_super": "سوپرادمین", "actor_guest": "ناشناس", "admin_view_only": "(فقط مشاهده و خروجی؛ صدور کارت جدید ممکن نیست)", "all": "همه", "all_actions": "همه‌ی عملیات‌ها", "bulk_actions": "عملیات گروهی", "bulk_delete_confirm": "{0} کارت انتخاب‌شده برای همیشه حذف شوند؟", "bulk_deleted": "{0} کارت حذف شد.", "bulk_pdf": "PDF چندصفحه‌ای", "bulk_zip": "ZIP تصاویر", "clear_filters": "پاک کردن فیلترها", "clear_selection": "لغو انتخاب", "close": "بستن", "date_from": "از تاریخ", "date_to": "تا تاریخ", "deleted": "حذف شد.", "details": "جزئیات", "editing_issued_card": "در حال ویرایش یک کارت صادرشده هستید؛ با ذخیره، همان کارت به‌روز می‌شود.", "expires_at": "تاریخ انقضا", "export_done": "خروجی {0} کارت آماده شد.", "export_progress": "در حال آماده‌سازی {0} از {1}...", "field_required": "«{0}» الزامی است.", "filter": "فیلتر", "forget_card": "حذف از فهرست من", "forget_card_confirm": "این کارت از فهرست «کارت‌های من» در این دستگاه حذف شود؟ (خود کارت حذف نمی‌شود)", "locked_wait": "ورود به‌طور موقت قفل شده است. {0} دیگر دوباره تلاش کنید.", "my_cards": "کارت‌های من", "my_cards_hint": "کارت‌هایی که از این دستگاه صادر کرده‌اید. می‌توانید آن‌ها را دوباره ببینید، دانلود یا ویرایش کنید.", "next_page": "صفحه‌ی بعد", "per_page": "تعداد در صفحه:", "prev_page": "صفحه‌ی قبل", "required": "الزامی", "restore": "فعال‌سازی دوباره", "revoke": "ابطال کارت", "revoke_confirm": "این کارت باطل شود؟ در استعلام QR «باطل‌شده» نمایش داده می‌شود.", "select": "انتخاب", "select_all": "انتخاب همه‌ی نتایج", "selected_count": "{0} مورد انتخاب شده", "set_expiry_prompt": "تاریخ انقضای جدید (میلادی). خالی = بدون انقضا", "status_active": "معتبر", "status_expired": "منقضی", "status_revoked": "باطل‌شده", "time": "زمان", "verify_title": "استعلام اعتبار کارت", "verify_not_found": "کارتی با این کد پیدا نشد.", "verify_active": "کارت معتبر است", "verify_expired": "اعتبار کارت به پایان رسیده است", "verify_revoked": "این کارت باطل شده است", "audit_login": "ورود", "audit_login_failed": "ورود ناموفق", "audit_super_login": "ورود سوپرادمین", "audit_super_login_failed": "ورود ناموفق سوپرادمین", "audit_super_password_changed": "تغییر رمز سوپرادمین", "audit_super_password_failed": "تغییر رمز ناموفق سوپرادمین", "audit_platform_settings": "تغییر تنظیمات پلتفرم", "idle_warning": "به دلیل بی‌کاری، تا یک دقیقه دیگر از حساب خارج می‌شوید. برای ماندن، صفحه را حرکت دهید یا کلیدی بزنید.", "idle_logout": "به دلیل بی‌کاری از حساب خارج شدید. لطفاً دوباره وارد شوید.", "audit_tenant_create": "ساخت سازمان", "audit_tenant_update": "ویرایش سازمان", "audit_tenant_delete": "حذف سازمان", "audit_tenant_active": "تغییر وضعیت سامانه", "audit_passwords_change": "تغییر رمزها", "audit_card_create": "صدور کارت", "audit_card_update": "ویرایش کارت", "audit_card_delete": "حذف کارت", "audit_cards_bulk_delete": "حذف گروهی کارت‌ها", "audit_card_status": "تغییر وضعیت کارت",
    "stars_of": "از {0} ستاره", "stars_auto": "(بر اساس تعداد کارت‌های صادرشده، خودکار تعیین می‌شود)", "stars_required": "تعداد ستاره‌های روشن را وارد کنید:", "stars_range": "عدد باید بین ۰ تا {0} باشد", "bg_cors_error": "تصویر پس‌زمینه از دامنه دیگری است و اجازه دانلود ندارد. تصویر را روی همین سرور آپلود کنید."
};

const getT = (dicts, langCode) => (key, ...args) => {
    let str = ''; const d = dicts.find(x => x.lang_code === langCode);
    if (d && d.translations && d.translations[key]) str = d.translations[key];
    else { const dFa = dicts.find(x => x.lang_code === 'fa'); if (dFa && dFa.translations && dFa.translations[key]) str = dFa.translations[key]; else str = FALLBACK_FA[key] || key; }
    args.forEach((arg, i) => { str = str.split(`{${i}}`).join(arg); }); return str;
};

// --- رسم روی canvas ---
const shapePath = (ctx, shape, x, y, w, h) => {
    if (shape === 'CIRCLE' || shape === 'OVAL') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
    else if (shape === 'ROUNDED') {
        // polyfill برای مرورگرهای بدون ctx.roundRect (مثل Safari قدیمی)
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 15);
        else { const r = Math.min(15, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }
    else ctx.rect(x, y, w, h);
};
// --- المان «ستاره‌ها» (شمارنده‌ی کمپین) ---
// چیدمان: circle (چند حلقه‌ی هم‌مرکز حول مرکز کادر)، line (یک ردیف)، grid (جدول ستون×ردیف).
// ترتیب روشن شدن: دایره از بالا ساعتگرد، خطی/شبکه‌ای از راست به چپ؛ starReverse برعکسش می‌کند.
const STAR_MAX = 1000;
const clampInt = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
const starLayoutOf = (f) => f.starLayout || 'circle';
const starsTotal = (f) => starLayoutOf(f) === 'circle' ? Math.min(STAR_MAX, (f.starRows || []).reduce((sum, r) => sum + clampInt(r.count, 0, STAR_MAX), 0)) : clampInt(f.starCount, 0, STAR_MAX);
const starPositions = (f) => {
    const out = []; const cx = f.x + f.w / 2; const cy = f.y + f.h / 2; const rev = !!f.starReverse; const layout = starLayoutOf(f);
    if (layout === 'circle') {
        (f.starRows || []).forEach(r => {
            const n = clampInt(r.count, 0, STAR_MAX); const R = Number(r.radius) || 0; const size = Number(r.size) || 20;
            for (let i = 0; i < n; i++) { const a = (rev ? -1 : 1) * (i * 2 * Math.PI / n) - Math.PI / 2; out.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), size, angle: f.starRotate === false ? 0 : a + Math.PI / 2 }); }
        });
    } else {
        const n = clampInt(f.starCount, 0, STAR_MAX); const size = Number(f.starSize) || 20;
        const cols = layout === 'line' ? Math.max(1, n) : clampInt(f.starCols, 1, STAR_MAX) || 1; const rowsN = Math.max(1, Math.ceil(n / cols));
        const cellW = f.w / cols; const cellH = f.h / rowsN;
        for (let i = 0; i < n; i++) { const row = Math.floor(i / cols); const col = i % cols; const p = rev ? col : cols - 1 - col; out.push({ x: f.x + cellW * (p + 0.5), y: f.y + cellH * (row + 0.5), size, angle: 0 }); }
    }
    return out;
};
/** کادر المان دایره‌ای را به اندازه‌ی بیرونی‌ترین حلقه تنظیم می‌کند (مرکز ثابت می‌ماند). */
const fitStarCircleBox = (f) => {
    if (starLayoutOf(f) !== 'circle') return f;
    const ext = Math.max(10, ...(f.starRows || []).map(r => (Number(r.radius) || 0) + (Number(r.size) || 20) * 0.75));
    const cx = f.x + f.w / 2; const cy = f.y + f.h / 2;
    return { ...f, x: cx - ext, y: cy - ext, w: ext * 2, h: ext * 2 };
};
const drawStarShape = (ctx, size, color) => {
    const R = size / 2; const r = R * 0.45; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rad = i % 2 === 0 ? R : r; const a = -Math.PI / 2 + i * Math.PI / 5; ctx[i === 0 ? 'moveTo' : 'lineTo'](rad * Math.cos(a), rad * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
};
const starImageCache = {};
const loadStarImages = async (f) => {
    const get = (url) => { if (!url) return Promise.resolve(null); if (!starImageCache[url]) starImageCache[url] = loadImageAny(url).then(r => r && r.img); return starImageCache[url]; };
    const [on, off] = await Promise.all([get(f.starOnImage), get(f.starOffImage)]);
    return { on, off };
};
/** تعداد ستاره‌های روشن از مقدار ذخیره‌شده؛ برای پیش‌نمایش (بدون مقدار) از previewLit استفاده می‌شود. */
const starsLit = (f, rawVal, showActions) => {
    const v = parseInt(toEnglishNum(rawVal), 10);
    if (!isNaN(v)) return Math.max(0, v);
    if (f.litSource === 'issued' || !showActions) return clampInt(f.previewLit, 0, STAR_MAX);
    return 0;
};
const drawStars = (ctx, f, lit, imgs) => {
    starPositions(f).forEach((p, i) => {
        const on = i < lit; const img = on ? imgs.on : imgs.off;
        ctx.save(); ctx.translate(p.x, p.y); if (p.angle) ctx.rotate(p.angle);
        if (img) { const w = p.size; const h = p.size * img.height / img.width; ctx.drawImage(img, -w / 2, -h / 2, w, h); }
        else drawStarShape(ctx, p.size, on ? (f.starColorOn || '#f59e0b') : (f.starColorOff || '#cbd5e1'));
        ctx.restore();
    });
};

const findActiveCondition = (conditions, data) => { let triggered = null; for (const cond of conditions || []) if (data[cond.triggerFieldId] === cond.value) triggered = cond; return triggered; };

/** یک روی کارت را روی canvas جداگانه (offscreen) رسم می‌کند و canvas را برمی‌گرداند. */
const loadImageAny = async (src) => {
    if (!src) return null;
    try { return { img: await loadImage(src), tainted: false }; }
    catch (e) { try { return { img: await loadImage(src, false), tainted: true }; } catch (e2) { return null; } }
};
/**
 * یک روی کارت را روی canvas جداگانه (offscreen) رسم می‌کند و canvas را برمی‌گرداند.
 * ابعاد بوم: ابعاد پس‌زمینه‌ی اصلی (baseBgUrl) → ابعاد پس‌زمینه‌ی فعال → ابعاد تعریف‌شده‌ی بوم.
 * پس‌زمینه‌ی شرطی با ابعاد متفاوت به ابعاد بوم کشیده می‌شود تا مختصات فیلدها جابه‌جا نشوند (مثل ویرایشگر).
 */
const renderCardSide = async ({ config, userData, side, bgUrl, baseBgUrl, showActions, activeCondition }) => {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    const bg = await loadImageAny(bgUrl);
    const base = !isFixedCanvas(config) && baseBgUrl && baseBgUrl !== bgUrl ? await loadImageAny(baseBgUrl) : null;
    const sizeSrc = isFixedCanvas(config) ? null : ((base && base.img) || (bg && bg.img));
    const def = getCanvasDefault(config);
    canvas.width = (sizeSrc && sizeSrc.width) || def.w; canvas.height = (sizeSrc && sizeSrc.height) || def.h;
    const W = canvas.width; const H = canvas.height; const tainted = !!(bg && bg.tainted);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    if (bg) drawImageFit(ctx, bg.img, W, H, bgFitOf(config));
    else if (bgUrl) { ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.round(Math.max(W, H) / 40)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('Error Loading Background', W / 2, H / 2); }

    if (activeCondition && activeCondition.hasOverlay && activeCondition.overlayImage && (activeCondition.overlaySide || 'front') === side) {
        try { const ovImg = await loadImage(activeCondition.overlayImage); ctx.drawImage(ovImg, activeCondition.overlayX || 0, activeCondition.overlayY || 0, activeCondition.overlayW || 100, activeCondition.overlayH || 100); } catch (e) { }
    }

    const sideFields = (config.fields || []).filter(f => f.side === side && f.printOnCard);
    for (const field of sideFields) {
        let val = userData[field.id] || '';
        if (field.linkedFieldId) { const masterField = config.fields.find(f => f.id === field.linkedFieldId); const masterValue = userData[field.linkedFieldId] || ''; if (field.linkedColumn && masterField && masterField.type === 'select') { const matchedOpt = (masterField.options || []).find(o => o.display === masterValue); if (matchedOpt && matchedOpt.colValues && matchedOpt.colValues[field.linkedColumn] !== undefined) val = matchedOpt.colValues[field.linkedColumn]; else val = userData[field.id] || ''; } else val = masterValue; if (field.type === 'qrcode' && field.qrTemplate && val) val = field.qrTemplate + val; } else if (field.type === 'qrcode' && !val && !showActions) val = 'https://asvashop.com';
        if (!val && !showActions) { if (field.linkedFieldId) { if (field.linkedColumn) val = field.linkedColumn; else { const sourceField = config.fields.find(f => f.id === field.linkedFieldId); val = sourceField ? sourceField.label : '123456'; } if (field.type === 'qrcode' && field.qrTemplate) val = field.qrTemplate + val; } else val = field.label || '123456'; }

        if (field.type === 'stars') {
            ctx.save(); ctx.imageSmoothingQuality = 'high'; drawStars(ctx, field, starsLit(field, userData[field.id], showActions), await loadStarImages(field)); ctx.restore();
            continue;
        }
        if (field.type === 'photo') {
            if (val === '[DELETED_48H]') { ctx.save(); ctx.beginPath(); shapePath(ctx, field.shape, field.x, field.y, field.w, field.h); ctx.fillStyle = '#f1f5f9'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#cbd5e1'; ctx.stroke(); ctx.clip(); ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const fSize = Math.max(10, Math.min(field.w, field.h) / 5); ctx.font = `bold ${fSize}px '${field.fontFamily || 'Vazirmatn'}', sans-serif`; ctx.fillText('EXPIRED', field.x + field.w / 2, field.y + field.h / 2); ctx.restore(); }
            else if (val && val.startsWith('data:image')) {
                try {
                    const userImg = await loadImage(val);
                    ctx.save(); ctx.beginPath(); shapePath(ctx, field.shape, field.x, field.y, field.w, field.h); ctx.clip();
                    const uImgRatio = userImg.width / userImg.height; const fieldRatio = field.w / field.h; let uSrcX = 0, uSrcY = 0, uSrcW = userImg.width, uSrcH = userImg.height;
                    if (uImgRatio > fieldRatio) { uSrcW = userImg.height * fieldRatio; uSrcX = (userImg.width - uSrcW) / 2; } else { uSrcH = userImg.width / fieldRatio; uSrcY = (userImg.height - uSrcH) / 2; }
                    ctx.drawImage(userImg, uSrcX, uSrcY, uSrcW, uSrcH, field.x, field.y, field.w, field.h); ctx.restore();
                } catch (e) { }
            }
        }
        else if (field.type === 'barcode') { if (val) { const safeVal = toEnglishNum(val).replace(/[^0-9A-Za-z]/g, ''); if (safeVal && window.JsBarcode) { try { const bcCanvas = document.createElement('canvas'); window.JsBarcode(bcCanvas, safeVal, { format: "CODE128", displayValue: false, margin: 0, width: 3, height: 50, lineColor: field.color || "#000000" }); ctx.imageSmoothingEnabled = false; ctx.drawImage(bcCanvas, field.x, field.y, field.w, field.h); ctx.imageSmoothingEnabled = true; } catch (e) { } } } }
        else if (field.type === 'qrcode') { if (field.qrSource === 'verify') val = verifyUrl(userData); if (val && window.QRious) { try { const qr = new window.QRious({ value: val, size: Math.max(field.w, field.h) * 2, level: 'M', foreground: field.color || "#000000", background: "transparent" }); ctx.drawImage(qr.canvas || await loadImage(qr.toDataURL()), field.x, field.y, field.w, field.h); } catch (e) { } } }
        else if (field.type === 'date' || field.type === 'text' || field.type === 'select') {
            let inCal = field.inputCalendar || 'jalali';
            if (field.type === 'date' && field.dateSource === 'issued') { val = isoToSlash(userData._issued || (showActions ? '' : new Date().toISOString())); inCal = 'gregorian'; }
            else if (field.type === 'date' && field.dateSource === 'expiry') { val = isoToSlash(userData._exp || (showActions || !(config.validityDays > 0) ? '' : addDaysIso(config.validityDays))); inCal = 'gregorian'; }
            if (field.type === 'date') { if (val && val.includes('/')) { const parts = val.split('/'); val = formatDateString(parts[0], parts[1], parts[2], inCal, field.printCalendar || 'jalali', field.dateFormat || 'YYYY/MM/DD'); } else if (!showActions && !(field.dateSource && field.dateSource !== 'input')) val = formatDateString('1402', '05', '12', 'jalali', field.printCalendar || 'jalali', field.dateFormat || 'YYYY/MM/DD'); }
            else { if (field.type === 'select' && Array.isArray(field.options)) { const matchedOpt = field.options.find(o => o.display === val); if (matchedOpt) val = matchedOpt.print || matchedOpt.display; } if (field.textType === 'en_num' || field.textType === 'en_mixed') val = toEnglishNum(val); else if (field.textType === 'fa_num' || field.textType === 'fa_mixed') val = toPersianNum(toEnglishNum(val)); }
            if (!val) continue;

            ctx.save(); let isRTLField = true; if (field.type === 'date') { if (field.printCalendar === 'gregorian' && !(field.dateFormat || '').startsWith('FA_')) isRTLField = false; } else { if (isEnTextType(field)) isRTLField = false; }
            ctx.direction = isRTLField ? 'rtl' : 'ltr';
            const mark = (str) => (isRTLField ? '\u202B' : '\u202A') + str + '\u202C';
            const fam = field.fontFamily || 'Vazirmatn'; const weight = field.fontWeight === 'normal' ? 'normal' : 'bold';
            const setFont = (fs) => { ctx.font = `${weight} ${fs}px '${fam}', sans-serif`; };
            if ('letterSpacing' in ctx) ctx.letterSpacing = `${Number(field.letterSpacing) || 0}px`;
            ctx.textAlign = field.align || 'right'; ctx.textBaseline = 'middle';
            const widthOf = (str) => ctx.measureText(mark(str)).width;
            // چندخطی: شکستن خودکار کلمات داخل عرض کادر و کوچک کردن فونت تا همه‌ی خطوط در ارتفاع کادر جا شوند
            const wrap = (text) => {
                const out = [];
                String(text).split(/\r?\n/).forEach(para => {
                    let cur = '';
                    para.split(/\s+/).filter(Boolean).forEach(word => { const test = cur ? `${cur} ${word}` : word; if (!cur || widthOf(test) <= field.w) cur = test; else { out.push(cur); cur = word; } });
                    out.push(cur);
                });
                return out;
            };
            let fontSize = field.maxFontSize || 40; let lines; const lineHeightK = Number(field.lineHeight) || 1.3;
            if (field.multiline) {
                for (; ; fontSize--) { setFont(fontSize); lines = wrap(val); const fits = lines.length * fontSize * lineHeightK <= field.h && lines.every(l => widthOf(l) <= field.w); if (fits || fontSize <= 8) break; }
            } else {
                setFont(fontSize); lines = [String(val).replace(/\s*\r?\n\s*/g, ' ')];
                while (widthOf(lines[0]) > field.w && fontSize > 8) { fontSize--; setFont(fontSize); }
            }
            const lineH = field.multiline ? fontSize * lineHeightK : fontSize; const blockH = lineH * lines.length;
            const vAlign = field.vAlign || 'middle';
            const firstY = vAlign === 'top' ? field.y + lineH / 2 : (vAlign === 'bottom' ? field.y + field.h - blockH + lineH / 2 : field.y + (field.h - blockH) / 2 + lineH / 2);
            let drawX = field.x; if (ctx.textAlign === 'center') drawX = field.x + field.w / 2; if (ctx.textAlign === 'right') drawX = field.x + field.w;
            if (field.fillType === 'linear') { const grad = ctx.createLinearGradient(field.x, field.y, field.x + field.w, field.y); grad.addColorStop(0, field.color || '#000000'); grad.addColorStop(1, field.color2 || '#ffffff'); ctx.fillStyle = grad; } else ctx.fillStyle = field.color || '#000000';
            if (field.hasShadow) { ctx.shadowColor = field.shadowColor || '#000000'; ctx.shadowBlur = field.shadowBlur || 4; }
            lines.forEach((line, i) => {
                const y = firstY + i * lineH; const txt = mark(line);
                ctx.fillText(txt, drawX, y);
                if (field.hasStroke) { ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = field.strokeColor || '#ffffff'; ctx.lineWidth = field.strokeWidth || 2; ctx.strokeText(txt, drawX, y); ctx.restore(); }
            });
            ctx.restore();
        }
    }
    canvas.tainted = tainted;
    return canvas;
};

// ==========================================
// 2. PURE UI COMPONENTS
// ==========================================
const Icon = ({ name, className = "w-5 h-5" }) => {
    let svgString = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    try {
        if (typeof window !== 'undefined' && window.lucide && window.lucide.icons) {
            let iconNode = window.lucide.icons[name];
            if (!iconNode) { const camelName = name.charAt(0).toLowerCase() + name.slice(1); iconNode = window.lucide.icons[camelName]; }
            if (!iconNode && name === 'UploadCloud') iconNode = window.lucide.icons['cloudUpload'] || window.lucide.icons['CloudUpload'];
            if (iconNode) {
                let children = []; if (Array.isArray(iconNode)) children = iconNode[0] === 'svg' ? (iconNode[2] || []) : iconNode; else if (typeof iconNode === 'object' && iconNode !== null) children = iconNode.children || iconNode;
                if (Array.isArray(children)) {
                    const childrenHtml = children.map(child => { if (!Array.isArray(child)) return ''; const [tag, attrs] = child; if (typeof tag !== 'string' || typeof attrs !== 'object') return ''; const attrString = Object.entries(attrs || {}).map(([k, v]) => `${k.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()}="${v}"`).join(' '); return `<${tag} ${attrString}></${tag}>`; }).join('');
                    svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">${childrenHtml}</svg>`;
                }
            }
        }
    } catch (e) { } return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgString }} className="inline-flex items-center justify-center shrink-0" />;
};

/** فوتر برند: متن‌ها، تلفن و لینک از «تنظیمات پلتفرم» می‌آیند و می‌توان آن را خاموش کرد. */
function BrandingFooter({ preview }) {
    const live = usePlatform().footer; const f = preview || live;
    if (!f.show || !(f.line1 || f.line2 || f.phone)) return null;
    const phone = f.phone && (<><Icon name="Phone" className="w-3.5 h-3.5" /><span dir="ltr" className="text-sm">{f.phone}</span></>);
    return (
        <div className="mt-8 text-center text-slate-400 text-xs pb-4 print:hidden flex flex-col items-center justify-center w-full">
            {f.line1 && <span className="font-medium tracking-wider opacity-80 mb-1" dir="auto">{f.line1}</span>}
            {f.line2 && <span className="font-bold opacity-80 text-slate-500" dir="auto">{f.line2}</span>}
            {phone && (f.link
                ? <a href={f.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-indigo-500 transition-colors opacity-80 hover:opacity-100 mt-2">{phone}</a>
                : <span className="flex items-center gap-1.5 opacity-80 mt-2">{phone}</span>)}
        </div>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) { console.error(error, info); }
    render() {
        if (this.state.error) return (<div className="flex flex-col h-screen items-center justify-center text-center bg-slate-50 p-6"><Icon name="AlertTriangle" className="w-16 h-16 mb-4 text-red-500" /><p className="font-bold text-slate-800 mb-2">خطای غیرمنتظره‌ای رخ داد.</p><p className="text-sm text-slate-500 mb-6" dir="ltr">{String(this.state.error.message || this.state.error)}</p><button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold">بارگذاری مجدد</button></div>);
        return this.props.children;
    }
}

// ==========================================
// 3. SHARED VIEWS & MODALS
// ==========================================
// کادر برش با نسبت ابعاد همان فیلد عکس (aspect = عرض/ارتفاع) کار می‌کند، نه همیشه مربع.
function ImageCropperModal({ src, shape, aspect = 1, t, onConfirm, onCancel }) {
    useEscape(onCancel);
    const CANVAS_SIZE = 300; const HANDLE_SIZE = 20; const MIN_SIZE = 40;
    const ratio = aspect > 0 && isFinite(aspect) ? aspect : 1;
    const [imgObj, setImgObj] = useState(null); const [cropBox, setCropBox] = useState({ x: 50, y: 50, w: 150, h: 150 }); const [dragState, setDragState] = useState({ active: false, mode: null, startX: 0, startY: 0, startBox: null }); const canvasRef = useRef(null);
    useEffect(() => {
        let alive = true;
        loadImage(src, false).then(img => {
            if (!alive) return;
            const scale = Math.min(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height); const drawW = img.width * scale; const drawH = img.height * scale; const drawX = (CANVAS_SIZE - drawW) / 2; const drawY = (CANVAS_SIZE - drawH) / 2;
            setImgObj({ img, scale, drawX, drawY, drawW, drawH });
            let w = drawW * 0.8; let h = w / ratio; if (h > drawH * 0.8) { h = drawH * 0.8; w = h * ratio; }
            setCropBox({ w, h, x: drawX + (drawW - w) / 2, y: drawY + (drawH - h) / 2 });
        }).catch(() => { notify('خطا در خواندن تصویر'); onCancel(); });
        return () => { alive = false; };
    }, [src, ratio]);
    useEffect(() => { const canvas = canvasRef.current; if (!canvas || !imgObj) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); ctx.drawImage(imgObj.img, imgObj.drawX, imgObj.drawY, imgObj.drawW, imgObj.drawH); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); ctx.save(); ctx.beginPath(); shapePath(ctx, shape, cropBox.x, cropBox.y, cropBox.w, cropBox.h); ctx.clip(); ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); ctx.drawImage(imgObj.img, imgObj.drawX, imgObj.drawY, imgObj.drawW, imgObj.drawH); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h); ctx.fillStyle = '#6366f1'; ctx.fillRect(cropBox.x + cropBox.w - HANDLE_SIZE / 2, cropBox.y + cropBox.h - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE); }, [imgObj, cropBox, shape]);
    const getPointerPos = (e) => { const rect = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - rect.left) * CANVAS_SIZE / rect.width, y: (e.clientY - rect.top) * CANVAS_SIZE / rect.height }; };
    const onPointerDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); const { x, y } = getPointerPos(e); const handleX = cropBox.x + cropBox.w; const handleY = cropBox.y + cropBox.h; const mode = (Math.abs(x - handleX) <= HANDLE_SIZE && Math.abs(y - handleY) <= HANDLE_SIZE) ? 'resize' : 'move'; setDragState({ active: true, mode, startX: x, startY: y, startBox: { ...cropBox } }); };
    const onPointerMove = (e) => {
        if (!dragState.active || !imgObj) return; const { x, y } = getPointerPos(e); const sb = dragState.startBox;
        if (dragState.mode === 'move') {
            const newX = Math.min(Math.max(sb.x + (x - dragState.startX), imgObj.drawX), imgObj.drawX + imgObj.drawW - sb.w);
            const newY = Math.min(Math.max(sb.y + (y - dragState.startY), imgObj.drawY), imgObj.drawY + imgObj.drawH - sb.h);
            setCropBox(prev => ({ ...prev, x: newX, y: newY }));
        } else {
            // تغییر اندازه با حفظ نسبت ابعاد
            let w = Math.max(MIN_SIZE, sb.w + Math.max(x - dragState.startX, (y - dragState.startY) * ratio));
            w = Math.min(w, imgObj.drawX + imgObj.drawW - sb.x, (imgObj.drawY + imgObj.drawH - sb.y) * ratio);
            setCropBox(prev => ({ ...prev, w, h: w / ratio }));
        }
    };
    const onPointerUp = () => setDragState(p => ({ ...p, active: false }));
    const confirm = () => {
        if (!imgObj) return;
        const srcW = cropBox.w / imgObj.scale; const srcH = cropBox.h / imgObj.scale;
        const outW = Math.max(1, Math.round(Math.min(1200, srcW))); const outH = Math.max(1, Math.round(outW / ratio));
        const finalC = document.createElement('canvas'); finalC.width = outW; finalC.height = outH; const ctx = finalC.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(imgObj.img, (cropBox.x - imgObj.drawX) / imgObj.scale, (cropBox.y - imgObj.drawY) / imgObj.scale, srcW, srcH, 0, 0, outW, outH);
        onConfirm(finalC.toDataURL('image/jpeg', 0.85));
    };
    return (<div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label={t('crop_title')} className="bg-white rounded-3xl p-6 w-full max-w-sm flex flex-col items-center shadow-2xl"><h3 className="font-bold text-lg mb-4">{t('crop_title')}</h3><div className="relative"><canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="bg-slate-100 rounded-xl cursor-crosshair touch-none shadow-inner max-w-full" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} /></div><p className="text-xs text-slate-500 mt-4 text-center leading-relaxed">{t('crop_desc')}</p><div className="w-full mt-6 flex gap-3"><button onClick={onCancel} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">{t('cancel')}</button><button onClick={confirm} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl">{t('confirm_crop')}</button></div></div></div>);
}

function CameraCaptureModal({ t, onCapture, onCancel }) {
    const videoRef = useRef(null); const streamRef = useRef(null);
    const stopStream = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null; } };
    useEscape(() => { stopStream(); onCancel(); });
    useEffect(() => {
        let alive = true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { notify(t('cam_denied')); onCancel(); return; }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(s => {
            if (!alive) { s.getTracks().forEach(tr => tr.stop()); return; } // اگر مودال قبل از پاسخ بسته شد
            streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s;
        }).catch(() => { if (alive) { notify(t('cam_denied')); onCancel(); } });
        return () => { alive = false; stopStream(); };
    }, []);
    const capture = () => { const v = videoRef.current; if (!v || !v.videoWidth) return; const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight; canvas.getContext('2d').drawImage(v, 0, 0); stopStream(); onCapture(canvas.toDataURL('image/jpeg', 0.8)); };
    return (<div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label={t('selfie_title')} className="bg-white rounded-3xl p-6 w-full max-w-sm flex flex-col items-center shadow-2xl"><h3 className="font-bold text-lg mb-4">{t('selfie_title')}</h3><video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-slate-800 mb-4 transform scale-x-[-1]" /><div className="w-full flex gap-3"><button onClick={() => { stopStream(); onCancel(); }} className="flex-1 py-3 bg-slate-100 font-bold rounded-xl">{t('cancel')}</button><button onClick={capture} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">{t('submit_photo')}</button></div></div></div>);
}

function CardLivePreview({ config, userData = {}, showActions = false, showcase = false, t }) {
    const frontCanvasRef = useRef(null); const backCanvasRef = useRef(null); const drawToken = useRef(0);
    const [fontWarning, setFontWarning] = useState(false); const [tainted, setTainted] = useState(false);
    const single = isSingleSided(config);
    // نمایش حرفه‌ای سه‌بعدی (فقط کارت دورو و وقتی سوپرادمین فعالش کرده باشد)؛ نمای تخت همچنان برای چاپ در DOM می‌ماند
    const can3d = showcase && !single && !!config.showcase3d;
    const [view3d, setView3d] = useState(true); const [drawn, setDrawn] = useState(0);
    const activeCondition = useMemo(() => findActiveCondition(config.conditions, userData), [config, userData]);
    const frontBg = (activeCondition && activeCondition.newFrontBg) || config.frontBg;
    const backBg = (activeCondition && activeCondition.newBackBg) || config.backBg;

    useEffect(() => {
        // هر رندر یک توکن دارد؛ نتیجه‌ی رندرهای قدیمی‌تر (که دیرتر تمام شده‌اند) دور ریخته می‌شود.
        const token = ++drawToken.current;
        (async () => {
            const fontsOk = await ensureFonts(collectFontFamilies(config), config.customFonts);
            if (token !== drawToken.current) return;
            const common = { config, userData, showActions, activeCondition };
            const jobs = [renderCardSide({ ...common, side: 'front', bgUrl: frontBg, baseBgUrl: config.frontBg })];
            if (!single) jobs.push(renderCardSide({ ...common, side: 'back', bgUrl: backBg, baseBgUrl: config.backBg }));
            const [front, back] = await Promise.all(jobs);
            if (token !== drawToken.current) return;
            [[frontCanvasRef.current, front], [backCanvasRef.current, back]].forEach(([target, src]) => { if (!target || !src) return; target.width = src.width; target.height = src.height; target.getContext('2d').drawImage(src, 0, 0); });
            setFontWarning(!fontsOk); setTainted(!!(front.tainted || (back && back.tainted))); setDrawn(n => n + 1);
        })();
    }, [config, userData, frontBg, backBg, activeCondition, showActions, single]);

    const [format, setFormat] = useState('jpg'); const [busy, setBusy] = useState('');
    const canvasesNow = () => [frontCanvasRef.current, single ? null : backCanvasRef.current].filter(Boolean);
    const sideNames = single ? ['Card'] : ['Card-Front', 'Card-Back'];
    const toBlob = (canvas) => new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob')), format === 'png' ? 'image/png' : 'image/jpeg', 0.95); } catch (e) { reject(e); } });
    const download = async (idx) => { try { downloadBlob(await toBlob(canvasesNow()[idx]), `${sideNames[idx]}.${format}`); } catch (e) { notify(t('bg_cors_error')); } };
    const hasPrintSize = Number(config.printW) > 0 && Number(config.printH) > 0;
    const makePdf = () => canvasesToPdf(canvasesNow(), { printW: Number(config.printW) || 0, printH: Number(config.printH) || 0 });
    const downloadPdf = async () => { setBusy('pdf'); try { downloadBlob(makePdf(), 'Card.pdf'); } catch (e) { notify(t('bg_cors_error')); } setBusy(''); };
    // اشتراک‌گذاری مستقیم فایل (موبایل: پیام‌رسان‌ها، گالری و ...)
    const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare && !!window.File;
    const share = async () => {
        setBusy('share');
        try {
            const files = await Promise.all(canvasesNow().map(async (c, i) => new File([await toBlob(c)], `${sideNames[i]}.${format}`, { type: format === 'png' ? 'image/png' : 'image/jpeg' })));
            if (navigator.canShare({ files })) await navigator.share({ files, title: config.orgName || '' });
            else notify(t('share_unsupported'), 'warning');
        } catch (e) { if (e && e.name !== 'AbortError') notify(t('share_unsupported'), 'warning'); }
        setBusy('');
    };
    // چاپ: اگر اندازه‌ی چاپ تعیین شده باشد، PDF با ابعاد دقیق باز می‌شود تا از همان چاپ شود
    const print = () => {
        if (!hasPrintSize) { window.print(); return; }
        try { const url = URL.createObjectURL(makePdf()); const w = window.open(url, '_blank'); if (!w) downloadBlob(makePdf(), 'Card.pdf'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e) { notify(t('bg_cors_error')); }
    };
    // بوم با حفظ نسبت ابعاد اصلی نمایش داده می‌شود (افقی، عمودی یا مربع) و ارتفاعش از صفحه بیرون نمی‌زند.
    const sheet = (ref, label) => (<div className="card-sheet flex flex-col items-center justify-center group min-w-0"><div className="relative rounded-2xl overflow-hidden shadow-2xl transition-transform group-hover:scale-[1.02] border border-slate-200 max-w-full"><canvas ref={ref} role="img" aria-label={label} className="block bg-white max-w-full h-auto" style={{ maxHeight: '72vh', width: 'auto' }}></canvas></div></div>);
    const btn = "flex-1 min-w-[150px] flex items-center justify-center gap-2 bg-white text-indigo-700 border-2 border-indigo-100 hover:border-indigo-300 px-4 py-3 rounded-xl font-bold shadow-sm disabled:opacity-50";

    return (
        <div className="flex flex-col items-center w-full max-w-5xl">
            {showActions && fontWarning && <div className="mb-4 w-full bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-3 text-sm text-center print:hidden">{t('font_warning')}</div>}
            {showActions && tainted && <div className="mb-4 w-full bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-3 text-sm text-center print:hidden">{t('bg_cors_error')}</div>}
            {can3d && <div role="radiogroup" aria-label={t('view_3d')} className="view-toggle inline-flex bg-slate-100/80 rounded-xl p-1 mb-4 print:hidden">{[[true, 'Box', t('view_3d')], [false, 'Columns2', t('view_flat')]].map(([v, ic, lb]) => <button key={lb} type="button" role="radio" aria-checked={view3d === v} onClick={() => setView3d(v)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-slate-600"><Icon name={ic} className="w-4 h-4" /> {lb}</button>)}</div>}
            {can3d && view3d && drawn > 0 && <CardShowcase3D front={frontCanvasRef.current} back={backCanvasRef.current} version={drawn} t={t} Icon={Icon} label={config.orgName ? `${t('view_3d')} — ${config.orgName}` : t('view_3d')} />}
            <div className={`card-print-area grid gap-8 w-full items-center print:block ${single ? 'card-single grid-cols-1' : 'card-double md:grid-cols-2'} ${can3d && view3d ? 'hidden print:block' : ''}`}>
                {sheet(frontCanvasRef, single ? t('download_image') : t('download_front'))}
                {!single && sheet(backCanvasRef, t('download_back'))}
            </div>
            {showActions && (
                <div className="mt-8 flex flex-col gap-3 print:hidden w-full">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-600"><span>{t('image_format')}:</span><div role="radiogroup" aria-label={t('image_format')} className="inline-flex bg-slate-100 rounded-lg p-1">{['jpg', 'png'].map(f => <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)} className={`px-3 py-1 rounded-md text-xs font-bold uppercase ${format === f ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>{f}</button>)}</div></div>
                    <div className="flex flex-wrap justify-center gap-3">
                        {single ? <button type="button" onClick={() => download(0)} className={btn}><Icon name="Download" className="w-4 h-4" /> {t('download_image')}</button>
                            : <><button type="button" onClick={() => download(0)} className={btn}><Icon name="Download" className="w-4 h-4" /> {t('download_front')}</button><button type="button" onClick={() => download(1)} className={btn}><Icon name="Download" className="w-4 h-4" /> {t('download_back')}</button></>}
                        <button type="button" onClick={downloadPdf} disabled={busy === 'pdf'} className={btn}><Icon name="FileText" className="w-4 h-4" /> {hasPrintSize ? t('download_pdf_real', `${config.printW}×${config.printH}`) : t('download_pdf')}</button>
                        {canShareFiles && <button type="button" onClick={share} disabled={busy === 'share'} className={btn}><Icon name="Share2" className="w-4 h-4" /> {t('share')}</button>}
                    </div>
                    <button type="button" onClick={print} className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white px-8 py-3 rounded-xl font-bold shadow-lg"><Icon name="Printer" className="w-4 h-4" /> {t('print_pdf')}</button>
                </div>
            )}
        </div>
    );
}

function SharedFieldsRenderer({ formData, setFormData, inputWarnings, setInputWarnings, handlePhotoUpload, visibleFields, customSelects, setCustomSelects, t, globalValidations, showMissing = false }) {
    const [showCamera, setShowCamera] = useState(null);
    const handleSelectChange = (val, f) => { if (val === '__OTHER__') { setCustomSelects(p => ({ ...p, [f.id]: true })); const newFD = { ...formData, [f.id]: '' }; visibleFields.forEach(lf => { if (lf.linkedFieldId === f.id) newFD[lf.id] = ''; }); setFormData(newFD); } else { const newFD = { ...formData, [f.id]: val }; const matchedOpt = (f.options || []).find(o => o.display === val); visibleFields.forEach(lf => { if (lf.linkedFieldId === f.id && lf.linkedColumn) newFD[lf.id] = (matchedOpt && matchedOpt.colValues && matchedOpt.colValues[lf.linkedColumn]) || ''; }); setFormData(newFD); } };
    const handleDateChange = (val, type, f) => {
        setFormData(p => {
            const parts = (p[f.id] || '//').split('/'); let y = parts[0] || ''; let m = parts[1] || ''; let d = parts[2] || '';
            if (type === 'y') y = val; if (type === 'm') m = val; if (type === 'd') d = val;
            // روز در هر دو تقویم (شمسی و میلادی) با تغییر ماه/سال محدود می‌شود
            const maxDays = getDaysInMonth(y, m, f.inputCalendar || 'jalali');
            if (d && parseInt(d, 10) > maxDays) d = String(maxDays);
            return { ...p, [f.id]: `${y}/${m}/${d}` };
        });
    };

    return (
        <div className="grid md:grid-cols-2 gap-6 relative">
            {showCamera && <CameraCaptureModal t={t} onCancel={() => setShowCamera(null)} onCapture={(dataUrl) => { const field = visibleFields.find(f => f.id === showCamera); setShowCamera(null); handlePhotoUpload(field, null, dataUrl); }} />}
            {visibleFields.map(f => {
                const errorMsg = getFieldError(f, formData[f.id], t, globalValidations); const isMasterCustom = f.linkedFieldId ? customSelects[f.linkedFieldId] : false; const isLinkedAndLocked = f.linkedFieldId && !isMasterCustom;
                return (
                    <div key={f.id} id={`fieldwrap-${f.id}`} className={`rounded-xl ${f.type === 'photo' ? 'col-span-full' : ''}`}>
                        <label className="block text-sm font-medium text-slate-700 mb-2">{f.label}{(f.required || (f.type === 'stars' && f.litSource !== 'issued')) && needsInput(f) && <span className="text-red-500 mr-1" aria-label={t('required')}>*</span>}</label>
                        {showMissing && needsInput(f) && (f.required || f.type === 'stars') && isEmptyValue(f, formData[f.id]) && <p role="alert" className="text-red-500 text-xs mb-1 font-bold">{t('field_required', f.label)}</p>}
                        {f.type === 'text' && f.multiline && !isLinkedAndLocked && !f.autoIncrement && (<div><textarea id={`field-${f.id}`} rows={3} value={formData[f.id] || ''} onChange={e => handleTextChange(e, f, setFormData, setInputWarnings, t)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white ${errorMsg ? 'border-red-500' : 'border-slate-300'}`} dir={isEnTextType(f) ? 'ltr' : 'rtl'} />{errorMsg && <p className="text-red-500 text-xs mt-1 px-1">{errorMsg}</p>}{inputWarnings[f.id] && <p className="text-red-500 text-xs mt-1 font-bold animate-pulse px-1">{inputWarnings[f.id]}</p>}</div>)}
                        {f.type === 'text' && !(f.multiline && !isLinkedAndLocked && !f.autoIncrement) && (<div><input type="text" value={formData[f.id] || ''} readOnly={isLinkedAndLocked || f.autoIncrement} placeholder={f.autoIncrement ? `${f.autoIncPrefix || ''}… ${t('auto_serial')}` : ''} onChange={e => handleTextChange(e, f, setFormData, setInputWarnings, t)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${errorMsg ? 'border-red-500 ring-red-200' : 'border-slate-300'} ${isLinkedAndLocked || f.autoIncrement ? 'bg-slate-100 text-slate-500 cursor-not-allowed font-bold' : 'bg-white'}`} dir={isEnTextType(f) ? 'ltr' : 'rtl'} />{errorMsg && <p className="text-red-500 text-xs mt-1 px-1">{errorMsg}</p>}{inputWarnings[f.id] && <p className="text-red-500 text-xs mt-1 font-bold animate-pulse px-1">{inputWarnings[f.id]}</p>}</div>)}
                        {f.type === 'select' && customSelects[f.id] && (<div className="flex gap-2"><input type="text" value={formData[f.id] || ''} onChange={e => setFormData(p => ({ ...p, [f.id]: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white" placeholder={`${t('manual_type')} ${f.label}...`} autoFocus /><button aria-label={t('back_to_list')} title={t('back_to_list')} onClick={() => { setCustomSelects(p => ({ ...p, [f.id]: false })); handleSelectChange('', f); }} className="bg-slate-100 px-4 rounded-xl"><Icon name="Undo" className="w-5 h-5" /></button></div>)}
                        {f.type === 'select' && !customSelects[f.id] && (<select value={formData[f.id] || ''} onChange={e => handleSelectChange(e.target.value, f)} className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"><option value="">{t('select_option')}</option>{(Array.isArray(f.options) ? f.options : []).filter(o => o.display).map((o, i) => <option key={i} value={o.display}>{o.display}</option>)}{f.hasOtherOption && <option value="__OTHER__" className="font-bold text-indigo-600 bg-indigo-50">{t('other_manual')}</option>}</select>)}
                        {f.type === 'date' && (() => {
                            const parts = (formData[f.id] || '//').split('/');
                            const y = parts[0] || ''; const m = parts[1] || ''; const d = parts[2] || '';
                            const maxDays = getDaysInMonth(y, m, f.inputCalendar || 'jalali');
                            const minY = f.minYear || (f.inputCalendar === 'gregorian' ? 1900 : 1300);
                            const maxY = f.maxYear || (f.inputCalendar === 'gregorian' ? 2050 : 1450);
                            return (
                                <div className="flex gap-2" dir="ltr">
                                    <select value={d} onChange={e => handleDateChange(e.target.value, 'd', f)} className="flex-1 border rounded-xl px-2 py-3 bg-white text-center" dir={document.documentElement.dir}><option value="">{t('day')}</option>{Array.from({ length: maxDays }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>
                                    <select value={m} onChange={e => handleDateChange(e.target.value, 'm', f)} className="flex-1 border rounded-xl px-2 py-3 bg-white text-center" dir={document.documentElement.dir}><option value="">{t('month')}</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{f.inputCalendar === 'gregorian' ? enMonths[n - 1] : faMonths[n - 1]}</option>)}</select>
                                    <select value={y} onChange={e => handleDateChange(e.target.value, 'y', f)} className="flex-1 border rounded-xl px-2 py-3 bg-white text-center" dir={document.documentElement.dir}><option value="">{t('year')}</option>{Array.from({ length: Math.max(0, maxY - minY + 1) }, (_, i) => minY + i).map(n => <option key={n} value={n}>{n}</option>)}</select>
                                </div>
                            )
                        })()}
                        {f.type === 'stars' && (f.litSource === 'issued'
                            ? <input type="text" readOnly value={formData[f.id] || ''} placeholder={t('stars_auto')} className="w-full border rounded-xl px-4 py-3 bg-slate-100 text-slate-500 cursor-not-allowed font-bold" />
                            : (<div><div className="flex items-center gap-3"><input type="text" inputMode="numeric" value={formData[f.id] || ''} onChange={e => setFormData(p => ({ ...p, [f.id]: toEnglishNum(e.target.value).replace(/[^0-9]/g, '').slice(0, 4) }))} className={`w-32 border rounded-xl px-4 py-3 text-center font-bold bg-white ${errorMsg ? 'border-red-500' : 'border-slate-300'}`} dir="ltr" placeholder="0" /><span className="text-sm text-slate-500">{t('stars_of', starsTotal(f))}</span><span className="text-amber-500 text-lg" aria-hidden="true">★</span></div>{errorMsg && <p className="text-red-500 text-xs mt-1 px-1">{errorMsg}</p>}</div>))}
                        {f.type === 'barcode' && (<input type="text" value={formData[f.id] || ''} onChange={e => setFormData(p => ({ ...p, [f.id]: toEnglishNum(e.target.value).replace(/[^0-9A-Za-z]/g, '') }))} placeholder={t('manual_barcode')} className="w-full border rounded-xl px-4 py-3 font-mono bg-white" dir="ltr" />)}
                        {f.type === 'qrcode' && (<input type="text" value={formData[f.id] || ''} onChange={e => setFormData(p => ({ ...p, [f.id]: toEnglishNum(e.target.value) }))} placeholder={t('manual_qrcode')} className="w-full border rounded-xl px-4 py-3 bg-white" dir="ltr" />)}
                        {f.type === 'photo' && (<div className="relative border-2 border-dashed border-indigo-200 rounded-2xl p-6 bg-indigo-50/30 text-center group"><div className="flex justify-center gap-4">{formData[f.id] ? (<div className="flex flex-col items-center cursor-pointer relative"><input type="file" accept="image/*" onChange={e => { handlePhotoUpload(f, e.target.files[0]); e.target.value = ''; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />{formData[f.id] === '[DELETED_48H]' ? <div className="w-16 h-16 bg-slate-200 rounded-lg shadow-sm mb-2 flex items-center justify-center text-[10px] text-slate-500">{t('expired')}</div> : <img src={formData[f.id]} className="w-24 h-24 object-cover rounded-xl shadow-md mb-3" />}<span className="text-xs text-indigo-600 font-medium bg-indigo-100 px-3 py-1 rounded-full">{t('change_image')}</span></div>) : (<><div className="flex flex-col items-center cursor-pointer relative"><input type="file" accept="image/*" onChange={e => { handlePhotoUpload(f, e.target.files[0]); e.target.value = ''; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><Icon name="UploadCloud" className="w-8 h-8 text-indigo-400 mb-2" /><span className="text-xs text-indigo-900 font-bold">{t('upload_gallery')}</span></div><div className="w-px bg-indigo-100"></div><div className="flex flex-col items-center cursor-pointer relative z-20" onClick={() => setShowCamera(f.id)}><Icon name="Camera" className="w-8 h-8 text-blue-400 mb-2" /><span className="text-xs text-blue-900 font-bold">{t('take_selfie')}</span></div></>)}</div></div>)}
                    </div>
                );
            })}
        </div>
    )
}

/** state و توابع مشترک فرم‌های ورود اطلاعات کارت (فرم کاربر، ویرایش ادمین، پیش‌نمایش ویزارد). */
const usePhotoCrop = (setFormData) => {
    const [cropFile, setCropFile] = useState(null);
    const handlePhotoUpload = async (field, file, pureDataUrl = null) => {
        const meta = { fieldId: field.id, shape: field.shape, aspect: field.w && field.h ? field.w / field.h : 1 };
        if (pureDataUrl) { setCropFile({ ...meta, src: pureDataUrl }); return; }
        if (!file) return;
        try { setCropFile({ ...meta, src: await readFileAsDataURL(file) }); } catch (e) { notify('خطا در خواندن فایل'); }
    };
    const cropModal = (t) => cropFile && <ImageCropperModal src={cropFile.src} shape={cropFile.shape} aspect={cropFile.aspect} t={t} onConfirm={(dataUrl) => { setFormData(p => ({ ...p, [cropFile.fieldId]: dataUrl })); setCropFile(null); }} onCancel={() => setCropFile(null)} />;
    return { handlePhotoUpload, cropModal };
};

function TenantLoginPreview({ data, t, realMode }) {
    return (
        <div className={`glass-strong rounded-3xl p-8 max-w-sm w-full mx-auto text-center flex flex-col h-[500px] ${realMode ? 'ring-2 ring-white/80' : ''}`}>
            <LogoImg src={data.logoUrl} className="w-24 h-24 mx-auto object-contain mb-4 rounded-xl" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">عضو محترم «{data.orgName || 'سازمان من'}»</h2>
            <p className="text-sm text-slate-500 mb-6">{data.welcomeText || t('enter_passcode')}</p>
            <div className="space-y-4 opacity-50 pointer-events-none mb-4">
                <input className="w-full border border-slate-200 px-4 py-3 rounded-xl bg-slate-50 text-center" placeholder={t('passcode')} />
                <button className="w-full btn-grad py-3 rounded-xl font-bold" style={{ '--g1': themeOf(data).c1, '--g2': themeOf(data).c2, '--g3': themeOf(data).c3 }}>{t('login')}</button>
            </div>
            <div className="mt-auto pt-4 border-t"><BrandingFooter /></div>
        </div>
    );
}

function TenantFormPreview({ data, formData, setFormData, t, globalValidations }) {
    const [inputWarnings, setInputWarnings] = useState({}); const [customSelects, setCustomSelects] = useState({});
    const { handlePhotoUpload, cropModal } = usePhotoCrop(setFormData);
    const visibleFields = getVisibleFields(data.fields, data);
    return (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 overflow-y-auto">
            {cropModal(t)}
            <div className="flex justify-between items-center border-b pb-4 mb-6"><h2 className="text-2xl font-bold text-slate-800">{t('form_title')}</h2></div>
            <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-xl border mb-6"><label className="block text-sm font-bold text-slate-700 mb-1">{t('requester_name')}</label><input type="text" className="w-full border rounded-lg px-3 py-2 bg-white" placeholder={t('requester_placeholder')} disabled /></div>
                <SharedFieldsRenderer formData={formData} setFormData={setFormData} inputWarnings={inputWarnings} setInputWarnings={setInputWarnings} handlePhotoUpload={handlePhotoUpload} visibleFields={visibleFields} customSelects={customSelects} setCustomSelects={setCustomSelects} t={t} globalValidations={globalValidations} />
            </div>
        </div>
    );
}

function TenantDashboardPreview({ data, previewFormData, t }) {
    const ownerName = (data.dashboardNameFormat && data.dashboardNameFormat.length > 0) ? data.dashboardNameFormat.map(id => previewFormData[id] || `(...)`).join(' ') : '---';
    return (
        <div className="max-w-6xl mx-auto w-full bg-slate-50 p-6 rounded-2xl border"><header className="bg-white px-6 py-4 rounded-2xl shadow-sm mb-6 flex flex-col sm:flex-row justify-between items-center gap-4"><div><h1 className="text-xl font-bold">{t('dashboard_title')}</h1></div></header><div className="bg-white rounded-2xl shadow-sm border overflow-hidden"><table className="w-full text-right"><thead className="bg-slate-50 border-b"><tr><th className="p-4">{t('row_num')}</th><th className="p-4 text-indigo-700">{t('card_owner')}</th><th className="p-4">{t('requester')}</th><th className="p-4 text-center">{t('status')}</th></tr></thead><tbody className="divide-y text-slate-800"><tr className="hover:bg-slate-50"><td className="p-4">#1</td><td className="p-4 font-bold text-indigo-900">{ownerName}</td><td className="p-4 text-slate-500">Preview</td><td className="p-4 text-center"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">{t('issued')}</span></td></tr></tbody></table></div></div>
    );
}

// ==========================================
// 4. BUILDER & EDITOR COMPONENTS
// ==========================================
// --- عملیات مشترک روی المان‌ها (ویرایشگر، پنل ویژگی‌ها، میانبرهای صفحه‌کلید) ---
const newFieldId = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
/** کپی المان با شناسه‌ی جدید، کمی جابه‌جاتر؛ خروجی: [داده‌ی جدید، شناسه‌ی جدید]. */
const duplicateFieldInData = (data, id) => {
    const src = (data.fields || []).find(f => f.id === id); if (!src) return [data, null];
    const off = Math.max(10, Math.round(Math.min(src.w, src.h) * 0.15));
    const copy = { ...JSON.parse(JSON.stringify(src)), id: newFieldId(), x: src.x + off, y: src.y + off, label: `${src.label || ''} (کپی)`, locked: false, isConditionTrigger: false };
    const fields = [...data.fields]; fields.splice(fields.indexOf(src) + 1, 0, copy);
    return [{ ...data, fields }, copy.id];
};
/** حذف المان و پاک کردن ارجاع‌های آن (اتصال فیلدها، قوانین شرطی، ستون نام داشبورد). */
const removeFieldFromData = (p, id) => ({ ...p, fields: (p.fields || []).filter(f => f.id !== id).map(f => f.linkedFieldId === id ? { ...f, linkedFieldId: '', linkedColumn: '' } : f), conditions: (p.conditions || []).filter(c => c.triggerFieldId !== id), dashboardNameFormat: (p.dashboardNameFormat || []).filter(x => x !== id) });
const confirmRemoveField = async (data, id) => !(data.fields || []).some(f => f.linkedFieldId === id) || await askConfirm('فیلدهای دیگری از این المان داده می‌گیرند و اتصالشان قطع می‌شود. حذف شود؟', { danger: true, okText: 'حذف' });

/** پیش‌نمایش زنده‌ی ستاره‌ها داخل کادر المان در ویرایشگر (با تعداد روشنِ پیش‌نمایش). */
function StarsBoxPreview({ field }) {
    const ref = useRef(null); const key = JSON.stringify(field);
    useEffect(() => {
        let alive = true;
        (async () => {
            const imgs = await loadStarImages(field); const c = ref.current; if (!alive || !c) return;
            const scale = Math.min(1, 1200 / Math.max(field.w, field.h, 1));
            c.width = Math.max(1, Math.round(field.w * scale)); c.height = Math.max(1, Math.round(field.h * scale));
            const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.scale(scale, scale); ctx.translate(-field.x, -field.y);
            drawStars(ctx, field, clampInt(field.previewLit, 0, STAR_MAX), imgs);
        })();
        return () => { alive = false; };
    }, [key]);
    return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/** کادر المان خطی/شبکه‌ای متناسب با تعداد و اندازه‌ی ستاره‌ها (مرکز ثابت می‌ماند). */
const fitStarGridBox = (f) => {
    const size = Number(f.starSize) || 30; const n = Math.max(1, clampInt(f.starCount, 1, STAR_MAX));
    const cols = starLayoutOf(f) === 'line' ? n : Math.max(1, Math.min(n, clampInt(f.starCols, 1, STAR_MAX))); const rowsN = Math.ceil(n / cols);
    const w = cols * size * 1.3; const h = rowsN * size * 1.3; const cx = f.x + f.w / 2; const cy = f.y + f.h / 2;
    return { ...f, x: cx - w / 2, y: cy - h / 2, w, h };
};

function StarsProperties({ field, update, data }) {
    const f = field; const total = starsTotal(f); const layout = starLayoutOf(f); const rows = f.starRows || [];
    const [busy, setBusy] = useState(''); const [zipFormat, setZipFormat] = useState('jpg'); const [zipProgress, setZipProgress] = useState(null);
    // خروجی ZIP همه‌ی حالت‌ها (۰ تا مجموع ستاره‌ها) از همین روی کارت، مثل ابزار قبلی «سازنده پوستر کمپین»
    const exportAllStates = async () => {
        if (!total) return notify('ابتدا تعداد ستاره‌ها را تعیین کنید.');
        setZipProgress(0);
        try {
            await ensureFonts(collectFontFamilies(data), data.customFonts);
            const zip = new JSZip(); const bgKey = f.side === 'back' ? 'backBg' : 'frontBg'; const type = zipFormat === 'png' ? 'image/png' : 'image/jpeg';
            for (let i = 0; i <= total; i++) {
                const c = await renderCardSide({ config: data, userData: { [f.id]: String(i) }, side: f.side, bgUrl: data[bgKey], baseBgUrl: data[bgKey], showActions: true, activeCondition: null });
                zip.file(`${String(i).padStart(String(total).length, '0')}_stars.${zipFormat}`, await canvasBlob(c, type));
                setZipProgress(i + 1);
            }
            downloadBlob(await zip.generateAsync({ type: 'blob' }), `stars_${safeFileName(f.label)}.zip`);
            notifySuccess(`${total + 1} تصویر ساخته شد.`);
        } catch (e) { notifyError(e, 'خطا در ساخت فایل ZIP (اگر پس‌زمینه از دامنه‌ی دیگری است، آن را روی همین سرور آپلود کنید).'); }
        setZipProgress(null);
    };
    const set = (patch, refit = false) => {
        let next = { ...f, ...patch };
        if (starLayoutOf(next) === 'circle' && ('starRows' in patch || 'starLayout' in patch)) next = fitStarCircleBox(next);
        else if (refit) next = fitStarGridBox(next);
        if (next.previewLit > starsTotal(next)) next.previewLit = starsTotal(next);
        const { id, ...rest } = next; update(rest);
    };
    const setRow = (i, key, v) => set({ starRows: rows.map((r, idx) => idx === i ? { ...r, [key]: Math.max(0, Number(v) || 0) } : r) });
    const setLayout = (lay) => set({ starLayout: lay, starCount: clampInt(f.starCount, 1, STAR_MAX) || 10, starCols: clampInt(f.starCols, 1, STAR_MAX) || 10, starSize: Number(f.starSize) || Number((rows[0] || {}).size) || 30 }, lay !== 'circle');
    // تصویر ستاره کوچک نمی‌شود (تا ۲۰۴۸px) تا «مقیاس» قالب‌های ابزار قبلی با عرض واقعی تصویر سازگار بماند
    const uploadStar = async (key, file) => { if (!file) return; setBusy(key); const url = await uploadImageFile(file, { keepTransparency: true, maxSize: 2048 }); setBusy(''); if (url) set({ [key]: url }); };
    // ورود قالب از ابزار قبلی «سازنده پوستر کمپین» (فایل JSON پشتیبان: { نام: { centerX, centerY, rows: [{ radius, count, scale }] } })
    const importOld = async (file) => {
        if (!file) return;
        try {
            const json = JSON.parse(await file.text()); const names = Object.keys(json || {}); if (!names.length) throw new Error('empty');
            let name = names[0];
            if (names.length > 1) { name = await askPrompt('چند قالب در فایل هست. نام قالب مورد نظر را وارد کنید:\n' + names.join('\n'), names[0]); if (!name) return; if (!json[name]) return notify('قالبی با این نام پیدا نشد.'); }
            const tpl = json[name]; if (!tpl || !Array.isArray(tpl.rows)) throw new Error('bad');
            const imgs = await loadStarImages(f); let natW = (imgs.off || imgs.on || {}).width || 0;
            if (!natW) natW = Number(await askPrompt('برای تبدیل «مقیاس» به اندازه، عرض اصلی تصویر ستاره (پیکسل) را وارد کنید.\n(اگر ابتدا تصاویر ستاره را آپلود کنید، خودکار محاسبه می‌شود.)', '500')) || 500;
            const starRows = tpl.rows.map(r => ({ count: clampInt(r.count, 0, STAR_MAX), radius: Math.max(0, Number(r.radius) || 0), size: Math.max(1, Math.round((Number(r.scale) || 0.1) * natW)) }));
            const cx = Number(tpl.centerX) || 0; const cy = Number(tpl.centerY) || 0;
            set({ starLayout: 'circle', starRows, x: cx - 1, y: cy - 1, w: 2, h: 2 });
        } catch (e) { notify('فایل JSON نامعتبر است.'); }
    };
    const num = (label, value, onChange, extra = {}) => (<div><label className="text-[10px] text-slate-500 block mb-0.5">{label}</label><input type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full border rounded px-1 py-1 text-xs text-center bg-white" dir="ltr" {...extra} /></div>);
    const starImageInput = (key, label) => (<div className="flex-1 bg-white border rounded-lg p-2 text-center"><span className="text-[10px] text-slate-600 block mb-1">{label}</span>{f[key] ? <img src={f[key]} className="w-10 h-10 object-contain mx-auto mb-1" /> : <span className="block text-2xl leading-10" style={{ color: key === 'starOnImage' ? (f.starColorOn || '#f59e0b') : (f.starColorOff || '#cbd5e1') }}>★</span>}<div className="flex gap-1 justify-center"><label className={`text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded cursor-pointer ${busy === key ? 'animate-pulse opacity-60' : ''}`}>آپلود PNG<input type="file" accept="image/png,image/webp" className="hidden" onChange={e => { uploadStar(key, e.target.files[0]); e.target.value = ''; }} /></label>{f[key] && <button onClick={() => set({ [key]: '' })} className="text-[10px] text-red-500 px-1">حذف</button>}</div></div>);

    return (
        <div className="space-y-4 bg-amber-50/50 p-4 rounded-xl border border-amber-200">
            <label className="text-xs text-slate-800 font-bold flex justify-between"><span>تنظیمات ستاره‌ها</span><span className="font-normal text-slate-500">مجموع: {total}</span></label>
            <div><label className="text-[11px] text-slate-600 block mb-1">تعداد ستاره‌های روشن از کجا بیاید؟</label><select value={f.litSource || 'input'} onChange={e => set({ litSource: e.target.value })} className="w-full border rounded-lg px-2 py-2 text-sm bg-white"><option value="input">ورودی کاربر در فرم</option><option value="issued">تعداد کارت‌های صادرشده (خودکار)</option></select><p className="text-[10px] text-slate-500 mt-1">{f.litSource === 'issued' ? 'با صدور هر کارت یک ستاره بیشتر روشن می‌شود (کارت n‌ام ← n ستاره). ویرایش کارت عدد را تغییر نمی‌دهد.' : 'کاربر در فرم عددی بین ۰ تا مجموع ستاره‌ها وارد می‌کند.'}</p></div>
            <div><label className="text-[11px] text-slate-600 block mb-1">چیدمان</label><select value={layout} onChange={e => setLayout(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white"><option value="circle">دایره‌ای (حلقه‌های هم‌مرکز)</option><option value="line">خطی (یک ردیف)</option><option value="grid">شبکه‌ای (جدول)</option></select></div>
            {layout === 'circle' ? (
                <div className="space-y-2">
                    {rows.map((r, i) => (<div key={i} className="bg-white border rounded-lg p-2"><div className="flex justify-between items-center mb-1"><span className="text-[11px] font-bold text-slate-700">حلقه {i + 1}</span>{rows.length > 1 && <button onClick={() => set({ starRows: rows.filter((_, idx) => idx !== i) })} className="text-red-500 text-[10px] font-bold">حذف</button>}</div><div className="grid grid-cols-3 gap-1">{num('تعداد', r.count, v => setRow(i, 'count', v))}{num('شعاع (px)', r.radius, v => setRow(i, 'radius', v))}{num('اندازه ستاره', r.size, v => setRow(i, 'size', v))}</div></div>))}
                    <button onClick={() => { const last = rows[rows.length - 1] || { radius: 100, size: 30 }; set({ starRows: [...rows, { count: 20, radius: Math.round((Number(last.radius) || 0) + (Number(last.size) || 30) * 1.6), size: Number(last.size) || 30 }] }); }} className="w-full text-[11px] bg-white border border-amber-300 text-amber-800 py-1.5 rounded-lg font-bold hover:bg-amber-50">+ افزودن حلقه</button>
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer"><input type="checkbox" checked={f.starRotate !== false} onChange={e => set({ starRotate: e.target.checked })} className="accent-indigo-600" /> چرخش ستاره‌ها رو به بیرون</label>
                    <p className="text-[10px] text-slate-500">مرکز حلقه‌ها، مرکز کادر المان است؛ کادر را روی بوم جابه‌جا کنید.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className={`grid gap-1 ${layout === 'grid' ? 'grid-cols-3' : 'grid-cols-2'}`}>{num('تعداد کل', f.starCount, v => set({ starCount: clampInt(v, 0, STAR_MAX) }))}{layout === 'grid' && num('ستون‌ها', f.starCols, v => set({ starCols: clampInt(v, 1, STAR_MAX) }))}{num('اندازه ستاره', f.starSize, v => set({ starSize: Math.max(1, Number(v) || 0) }))}</div>
                    <button onClick={() => set({}, true)} className="w-full text-[11px] bg-white border border-amber-300 text-amber-800 py-1.5 rounded-lg font-bold hover:bg-amber-50">تنظیم خودکار اندازه‌ی کادر</button>
                    <p className="text-[10px] text-slate-500">ستاره‌ها به‌طور مساوی داخل کادر پخش می‌شوند؛ با تغییر عرض/ارتفاع کادر فاصله‌ها تنظیم می‌شود.</p>
                </div>
            )}
            <div><label className="text-[11px] text-slate-600 block mb-1">ترتیب روشن شدن</label><select value={f.starReverse ? '1' : '0'} onChange={e => set({ starReverse: e.target.value === '1' })} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">{layout === 'circle' ? <><option value="0">از بالا، ساعتگرد</option><option value="1">از بالا، پادساعتگرد</option></> : <><option value="0">از راست به چپ</option><option value="1">از چپ به راست</option></>}</select></div>
            <div><label className="text-[11px] text-slate-600 block mb-1">تصویر ستاره‌ها (اختیاری؛ بدون تصویر، ستاره‌ی برداری رسم می‌شود)</label><div className="flex gap-2">{starImageInput('starOffImage', 'خاموش')}{starImageInput('starOnImage', 'روشن')}</div>
                {(!f.starOnImage || !f.starOffImage) && <div className="flex gap-3 mt-2 text-[10px] text-slate-600 items-center"><label className="flex items-center gap-1">رنگ روشن <input type="color" value={f.starColorOn || '#f59e0b'} onChange={e => set({ starColorOn: e.target.value })} className="h-5 w-7 p-0" /></label><label className="flex items-center gap-1">رنگ خاموش <input type="color" value={f.starColorOff || '#cbd5e1'} onChange={e => set({ starColorOff: e.target.value })} className="h-5 w-7 p-0" /></label></div>}
            </div>
            <div><label className="text-[11px] text-slate-600 flex justify-between mb-1"><span>پیش‌نمایش ستاره‌های روشن</span><span className="bg-indigo-600 text-white rounded-full px-2 font-bold">{clampInt(f.previewLit, 0, total)}</span></label><input type="range" min="0" max={total} value={clampInt(f.previewLit, 0, total)} onChange={e => set({ previewLit: Number(e.target.value) })} className="w-full accent-indigo-600" /></div>
            <div className="bg-white border rounded-lg p-2 space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-slate-600">خروجی همه‌ی حالت‌ها (۰ تا {total})</span><select value={zipFormat} onChange={e => setZipFormat(e.target.value)} aria-label="فرمت تصاویر ZIP" className="border rounded text-[11px] px-1 py-0.5"><option value="jpg">JPG</option><option value="png">PNG</option></select></div><button type="button" onClick={exportAllStates} disabled={zipProgress !== null} className="w-full text-[11px] bg-indigo-600 text-white py-1.5 rounded-lg font-bold disabled:opacity-60">{zipProgress !== null ? `در حال رندر ${zipProgress} از ${total + 1}...` : 'دانلود ZIP همه‌ی حالت‌ها'}</button></div>
            <label className="block text-center text-[11px] bg-white border border-dashed border-slate-300 rounded-lg py-2 cursor-pointer hover:bg-slate-50 text-slate-600">ورود قالب از ابزار قبلی (فایل JSON پشتیبان)<input type="file" accept=".json,application/json" className="hidden" onChange={e => { importOld(e.target.files[0]); e.target.value = ''; }} /></label>
        </div>
    );
}

// --- ویرایشگر بوم: جابه‌جایی با چسبیدن به خطوط راهنما، تغییر اندازه با دستگیره، میانبرها، لایه‌ها و بزرگ‌نمایی ---
const SNAP_SCREEN_PX = 6;
const RESIZE_HANDLES = [['nw', 0, 0, 'nwse-resize'], ['n', 50, 0, 'ns-resize'], ['ne', 100, 0, 'nesw-resize'], ['e', 100, 50, 'ew-resize'], ['se', 100, 100, 'nwse-resize'], ['s', 50, 100, 'ns-resize'], ['sw', 0, 100, 'nesw-resize'], ['w', 0, 50, 'ew-resize']];
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
const FIELD_TYPE_LABELS = { text: 'متن', select: 'انتخابی', date: 'تاریخ', barcode: 'بارکد', qrcode: 'QR', photo: 'عکس', stars: 'ستاره‌ها' };

/** نزدیک‌ترین خط راهنما به لبه‌های داده‌شده (در مختصات بوم). */
const findSnap = (edges, targets, threshold) => {
    let best = null;
    for (const e of edges) for (const t of targets) { const d = t - e; if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; }
    return best;
};

function LayersPanel({ fields, selectedId, onSelect, onToggleLock, onMove, onClose }) {
    const ordered = [...fields].map((f, i) => ({ f, i })).reverse(); // بالاترین لایه اول
    return (
        <div className="absolute top-3 left-3 z-[60] w-64 max-h-[70%] overflow-y-auto bg-white rounded-xl shadow-2xl border text-sm" role="region" aria-label="لایه‌ها">
            <div className="flex justify-between items-center px-3 py-2 border-b sticky top-0 bg-white"><span className="font-bold text-slate-700">لایه‌ها ({fields.length})</span><button type="button" onClick={onClose} aria-label="بستن لایه‌ها" className="p-1 rounded hover:bg-slate-100"><Icon name="X" className="w-4 h-4" /></button></div>
            {ordered.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">المانی وجود ندارد.</p>}
            <ul>{ordered.map(({ f, i }) => (
                <li key={f.id} className={`flex items-center gap-1 px-2 py-1.5 border-b last:border-0 ${selectedId === f.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <button type="button" onClick={() => onSelect(f.id)} className="flex-1 text-right truncate" aria-current={selectedId === f.id ? 'true' : undefined}><span className="text-[10px] text-slate-400 ml-1">{FIELD_TYPE_LABELS[f.type] || f.type}</span>{f.label || '—'}{!f.printOnCard && <span className="text-[10px] text-red-500 mr-1">(مخفی)</span>}</button>
                    <button type="button" onClick={() => onMove(f.id, 1)} disabled={i === fields.length - 1} aria-label={`بالا بردن لایه‌ی ${f.label}`} title="یک لایه بالاتر" className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"><Icon name="ArrowUp" className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => onMove(f.id, -1)} disabled={i === 0} aria-label={`پایین بردن لایه‌ی ${f.label}`} title="یک لایه پایین‌تر" className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"><Icon name="ArrowDown" className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => onToggleLock(f.id)} aria-pressed={!!f.locked} aria-label={f.locked ? `باز کردن قفل ${f.label}` : `قفل کردن ${f.label}`} title={f.locked ? 'باز کردن قفل' : 'قفل'} className={`p-1 rounded ${f.locked ? 'text-amber-700 bg-amber-100' : 'text-slate-400 hover:bg-slate-200'}`}><Icon name={f.locked ? 'Lock' : 'Unlock'} className="w-3.5 h-3.5" /></button>
                </li>
            ))}</ul>
        </div>
    );
}

function TemplatesManagerModal({ templates, data, onClose, onChanged }) {
    const rename = async (tpl) => { const title = await askPrompt('نام جدید بوم:', tpl.title, { title: 'تغییر نام بوم' }); if (!title || title === tpl.title) return; try { await apiPost('update_template', { id: tpl.id, title }); notifySuccess('نام بوم تغییر کرد.'); onChanged(); } catch (e) { notifyError(e); } };
    const overwrite = async (tpl) => {
        if (!(await askConfirm(`محتوای بوم «${tpl.title}» با طراحی فعلی جایگزین شود؟`, { okText: 'جایگزینی' }))) return;
        const dim = getCanvasDefault(data);
        try { await apiPost('update_template', { id: tpl.id, front_bg: data.frontBg, back_bg: data.backBg, fields_data: data.fields, settings: { cardLayout: isSingleSided(data) ? 'single' : 'double', canvasW: dim.w, canvasH: dim.h, canvasMode: isFixedCanvas(data) ? 'fixed' : 'auto', bgFit: data.bgFit || 'stretch' } }); notifySuccess('بوم به‌روزرسانی شد.'); onChanged(); } catch (e) { notifyError(e); }
    };
    const remove = async (tpl) => { if (!(await askConfirm(`بوم «${tpl.title}» حذف شود؟`, { danger: true, okText: 'حذف' }))) return; try { await apiPost('delete_template', { id: tpl.id }); notifySuccess('بوم حذف شد.'); onChanged(); } catch (e) { notifyError(e); } };
    return (
        <ModalShell title="مدیریت بوم‌های آماده" icon="LayoutTemplate" onClose={onClose}>
            {templates.length === 0 ? <p className="text-center text-slate-400 p-8">هنوز بومی ذخیره نشده است.</p> : (
                <ul className="divide-y border rounded-2xl">{templates.map(tpl => (
                    <li key={tpl.id} className="flex flex-wrap items-center gap-2 p-3">
                        <div className="flex-1 min-w-[160px]"><p className="font-bold text-slate-800">{tpl.title}</p><p className="text-[11px] text-slate-500">{(() => { try { return `${JSON.parse(tpl.fields_data || '[]').length} المان`; } catch (e) { return ''; } })()}{tpl.settings ? ` — ${tpl.settings.cardLayout === 'single' ? 'تک‌رو' : 'دورو'} ${tpl.settings.canvasW}×${tpl.settings.canvasH}` : ''}</p></div>
                        <button type="button" onClick={() => rename(tpl)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-bold">تغییر نام</button>
                        <button type="button" onClick={() => overwrite(tpl)} className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold">جایگزینی با طرح فعلی</button>
                        <button type="button" onClick={() => remove(tpl)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-bold">حذف</button>
                    </li>
                ))}</ul>
            )}
        </ModalShell>
    );
}

function VisualEditor({ side, bgUrl, defaultDim, fixed = false, bgFit = 'stretch', fields, onUpdateFields, onUpdateBg, data, setData, selectedId, setSelectedId }) {
    const def = defaultDim || { w: 800, h: 500 };
    const containerRef = useRef(null); const sideFields = fields || []; const [bgDim, setBgDim] = useState(def); const [templates, setTemplates] = useState([]); const [uploading, setUploading] = useState(false);
    const [zoom, setZoom] = useState('fit'); const [guides, setGuides] = useState(null); const [showLayers, setShowLayers] = useState(false); const [showTplManager, setShowTplManager] = useState(false); const [snapOn, setSnapOn] = useState(true);
    // وقتی پس‌زمینه با ابعاد متفاوت آپلود می‌شود، ابعاد قبلی نگه داشته می‌شود تا فیلدها متناسب مقیاس داده شوند
    const rescaleFrom = useRef(null);
    useEffect(() => {
        let alive = true;
        const apply = async (dim) => {
            if (!alive) return;
            const from = rescaleFrom.current; rescaleFrom.current = null;
            if (from && !fixed) {
                // حالت خودکار: ابعاد بوم برابر ابعاد عکس زمینه‌ی آپلودشده می‌شود (برای سمتی که پس‌زمینه ندارد هم اعمال می‌شود)
                const otherSide = side === 'front' ? 'back' : 'front';
                const otherNeeds = !isSingleSided(data) && !data[`${otherSide}Bg`] && !sameDim(def, dim) && (data.fields || []).some(f => f.side === otherSide);
                const thisNeeds = !sameDim(from, dim) && sideFields.length > 0;
                const rescale = (thisNeeds || otherNeeds) && await askConfirm(`ابعاد بوم از ${from.w}×${from.h} به ${dim.w}×${dim.h} (ابعاد عکس زمینه) تغییر کرد. موقعیت و اندازه‌ی المان‌ها متناسب با ابعاد جدید تنظیم شود؟`, { okText: 'بله، تنظیم شود', cancelText: 'خیر' });
                if (!alive) return;
                setData(p => {
                    let next = { ...p, canvasW: dim.w, canvasH: dim.h };
                    if (rescale && thisNeeds) next = scaleSideFields(next, side, dim.w / from.w, dim.h / from.h);
                    if (rescale && otherNeeds) next = scaleSideFields(next, otherSide, dim.w / def.w, dim.h / def.h);
                    return next;
                });
            }
            setBgDim(dim);
        };
        if (bgUrl && !fixed) { const img = new Image(); img.onload = () => apply({ w: img.width || def.w, h: img.height || def.h }); img.onerror = () => apply(def); img.src = bgUrl; } else apply(def);
        return () => { alive = false; };
    }, [bgUrl, def.w, def.h, fixed]);
    const fetchTemplates = () => apiGet('get_templates').then(d => { if (Array.isArray(d)) setTemplates(d); }).catch(() => { });
    useEffect(() => { fetchTemplates(); }, []);

    const addField = (type) => {
        const isBC = type === 'barcode'; const isQR = type === 'qrcode'; const isPh = type === 'photo'; const isDt = type === 'date'; const k = Math.max(1, Math.min(bgDim.w, bgDim.h) / 500); // اندازه‌ی پیش‌فرض متناسب با ابعاد بوم
        const newField = { id: newFieldId(), side, type, x: Math.round(50 * k), y: Math.round(50 * k), w: Math.round((isPh ? 120 : (isQR ? 100 : 200)) * k), h: Math.round((isPh ? 150 : (isQR ? 100 : (isBC ? 50 : 40))) * k), label: isPh ? 'عکس' : (isQR ? 'QR' : (isBC ? 'بارکد' : (isDt ? 'تاریخ' : (type === 'select' ? 'انتخابی' : 'متن')))), shape: isPh ? 'ROUNDED' : null, qrTemplate: '', options: type === 'select' ? [{ display: 'گزینه ۱', print: 'گزینه ۱', colValues: {} }] : null, cols: [], hasOtherOption: false, textType: type === 'text' ? 'free' : null, fontFamily: 'Vazirmatn', maxFontSize: Math.round(40 * k), inputCalendar: isDt ? 'jalali' : null, printCalendar: isDt ? 'jalali' : null, dateFormat: isDt ? 'YYYY/MM/DD' : null, linkedFieldId: '', linkedColumn: '', hasLengthLimit: false, lengthLimits: [], isConditionTrigger: false, color: '#000000', color2: '#ffffff', fillType: 'solid', align: 'right', printOnCard: true, autoIncrement: false, hasStroke: false, strokeColor: '#ffffff', strokeWidth: 2, hasShadow: false, shadowColor: '#000000', shadowBlur: 4, minYear: null, maxYear: null, required: false };
        if (type === 'stars') {
            Object.assign(newField, { label: 'تعداد ستاره‌های روشن', litSource: 'input', starLayout: 'circle', starRows: [{ count: 20, radius: Math.round(150 * k), size: Math.round(30 * k) }], starCount: 10, starCols: 10, starSize: Math.round(30 * k), starRotate: true, starReverse: false, starOnImage: '', starOffImage: '', starColorOn: '#f59e0b', starColorOff: '#cbd5e1', previewLit: 7 });
            Object.assign(newField, fitStarCircleBox({ ...newField, x: bgDim.w / 2 - 1, y: bgDim.h / 2 - 1, w: 2, h: 2 }));
        }
        onUpdateFields([...sideFields, newField], { checkpoint: true }); setSelectedId(newField.id);
    };
    const patchField = (id, patch, opts) => onUpdateFields(sideFields.map(f => f.id === id ? { ...f, ...patch } : f), opts);

    // موقعیت‌ها در مختصات پیکسلی بوم ذخیره و در ویرایشگر به‌صورت درصدی نمایش داده می‌شوند تا با کارت نهایی یکسان باشند.
    const startInteraction = (e, id, mode) => {
        e.stopPropagation(); setSelectedId(id); if (!containerRef.current) return;
        const field = sideFields.find(f => f.id === id); if (!field || field.locked) return;
        e.preventDefault();
        const startX = e.clientX; const startY = e.clientY; const others = sideFields.filter(f => f.id !== id);
        const W = bgDim.w; const H = bgDim.h;
        const xTargets = [0, W / 2, W, ...others.flatMap(o => [o.x, o.x + o.w / 2, o.x + o.w])];
        const yTargets = [0, H / 2, H, ...others.flatMap(o => [o.y, o.y + o.h / 2, o.y + o.h])];
        const onMove = (ev) => {
            const rect = containerRef.current.getBoundingClientRect(); const scale = rect.width / W;
            const dx = (ev.clientX - startX) / scale; const dy = (ev.clientY - startY) / scale;
            const threshold = SNAP_SCREEN_PX / scale; const snap = snapOn && !ev.altKey;
            let { x, y, w, h } = field; let gx = null; let gy = null;
            if (mode === 'move') {
                x += dx; y += dy;
                if (snap) {
                    const sx = findSnap([x, x + w / 2, x + w], xTargets, threshold); if (sx) { x += sx.d; gx = sx.at; }
                    const sy = findSnap([y, y + h / 2, y + h], yTargets, threshold); if (sy) { y += sy.d; gy = sy.at; }
                }
            } else {
                const MIN = 8; let r = x + w; let b = y + h;
                if (mode.includes('e')) r = Math.max(x + MIN, r + dx);
                if (mode.includes('w')) x = Math.min(r - MIN, x + dx);
                if (mode.includes('s')) b = Math.max(y + MIN, b + dy);
                if (mode.includes('n')) y = Math.min(b - MIN, y + dy);
                if (snap) {
                    if (mode.includes('e')) { const s = findSnap([r], xTargets, threshold); if (s) { r += s.d; gx = s.at; } }
                    if (mode.includes('w')) { const s = findSnap([x], xTargets, threshold); if (s) { x += s.d; gx = s.at; } }
                    if (mode.includes('s')) { const s = findSnap([b], yTargets, threshold); if (s) { b += s.d; gy = s.at; } }
                    if (mode.includes('n')) { const s = findSnap([y], yTargets, threshold); if (s) { y += s.d; gy = s.at; } }
                }
                w = r - x; h = b - y;
                // Shift: حفظ نسبت ابعاد در گوشه‌ها
                if (ev.shiftKey && mode.length === 2) { const ratio = field.w / field.h; if (w / h > ratio) w = h * ratio; else h = w / ratio; if (mode.includes('w')) x = r - w; if (mode.includes('n')) y = b - h; }
            }
            setGuides(gx !== null || gy !== null ? { x: gx, y: gy } : null);
            patchField(id, { x, y, w, h });
        };
        const onUp = () => { setGuides(null); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
        document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    };

    // میانبرهای صفحه‌کلید: جهت‌ها = جابه‌جایی ۱px (با Shift ده پیکسل)، Delete = حذف، Ctrl+D = کپی، Esc = لغو انتخاب
    useEffect(() => {
        const h = async (e) => {
            if (!selectedId || isTypingTarget(e.target) || document.querySelector('[role="alertdialog"]')) return;
            const field = sideFields.find(f => f.id === selectedId); if (!field) return;
            const step = e.shiftKey ? 10 : 1; const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[e.key]) { e.preventDefault(); if (!field.locked) patchField(field.id, { x: field.x + moves[e.key][0], y: field.y + moves[e.key][1] }); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (await confirmRemoveField(data, field.id)) { setSelectedId(null); setData(p => removeFieldFromData(p, field.id), { checkpoint: true }); } }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); let newId = null; setData(p => { const [next, id] = duplicateFieldInData(p, field.id); newId = id; return next; }, { checkpoint: true }); setTimeout(() => newId && setSelectedId(newId), 0); }
            else if (e.key === 'Escape') setSelectedId(null);
        };
        document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
    });

    const saveTemplate = async () => { const title = await askPrompt('نام بوم را وارد کنید:', '', { title: 'ذخیره‌ی بوم' }); if (!title) return; try { const dim = getCanvasDefault(data); await apiPost('save_template', { title, front_bg: data.frontBg, back_bg: data.backBg, fields_data: data.fields, settings: { cardLayout: isSingleSided(data) ? 'single' : 'double', canvasW: dim.w, canvasH: dim.h, canvasMode: isFixedCanvas(data) ? 'fixed' : 'auto', bgFit: data.bgFit || 'stretch' } }); notifySuccess('بوم ذخیره شد.'); fetchTemplates(); } catch (e) { notifyError(e); } };
    const loadTemplate = async (id) => {
        const tpl = templates.find(x => String(x.id) === String(id)); if (!tpl) return;
        if (!(await askConfirm('المان‌ها و پس‌زمینه‌ی فعلی بوم با این بوم آماده جایگزین می‌شوند. ادامه می‌دهید؟', { okText: 'لود بوم' }))) return;
        try {
            const parsedFields = JSON.parse(tpl.fields_data);
            // قالب خروجی (دورو/تک‌رو) و ابعاد بوم هم بازیابی می‌شوند؛ بوم‌های قدیمی که این تنظیمات را ندارند، تنظیمات فعلی را تغییر نمی‌دهند
            const st = tpl.settings || {};
            setData(p => ({ ...p, fields: Array.isArray(parsedFields) ? parsedFields : [], frontBg: tpl.front_bg, backBg: tpl.back_bg, ...(st.cardLayout ? { cardLayout: st.cardLayout, canvasW: st.canvasW, canvasH: st.canvasH, canvasMode: st.canvasMode || 'auto', bgFit: st.bgFit || 'stretch' } : {}) }), { checkpoint: true });
            setSelectedId(null);
        } catch (e) { notify('خطا در لود بوم'); }
    };
    const moveLayer = (id, dir) => { const i = sideFields.findIndex(x => x.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= sideFields.length) return; const nF = [...sideFields]; [nF[i], nF[j]] = [nF[j], nF[i]]; onUpdateFields(nF, { checkpoint: true }); };
    const pct = (v, total) => `${(v / total) * 100}%`;
    const fitWidth = `min(100%, ${bgDim.w}px, calc((100vh - 280px) * ${bgDim.w / bgDim.h}))`;
    const zoomIdx = zoom === 'fit' ? -1 : ZOOM_LEVELS.indexOf(zoom);
    const stepZoom = (dir) => { if (zoom === 'fit') { const rect = containerRef.current && containerRef.current.getBoundingClientRect(); const cur = rect ? rect.width / bgDim.w : 1; const next = dir > 0 ? ZOOM_LEVELS.find(z => z > cur + 0.01) : [...ZOOM_LEVELS].reverse().find(z => z < cur - 0.01); setZoom(next || (dir > 0 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1] : ZOOM_LEVELS[0])); } else { const n = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIdx + dir))]; setZoom(n); } };
    const selected = sideFields.find(f => f.id === selectedId);

    return (
        <div className="h-full flex flex-col">
            {showTplManager && <TemplatesManagerModal templates={templates} data={data} onClose={() => setShowTplManager(false)} onChanged={fetchTemplates} />}
            <div className="bg-indigo-950/70 backdrop-blur-md border-b border-white/10 px-4 py-2 flex flex-wrap items-center justify-between z-10 gap-2 text-white">
                <div className="flex gap-2 flex-wrap">
                    <select value="" aria-label="لود بوم آماده" onChange={e => loadTemplate(e.target.value)} className="bg-indigo-800 text-white text-xs px-2 py-1.5 rounded outline-none border border-indigo-700"><option value="">+ لود بوم آماده...</option>{templates.map(tp => <option key={tp.id} value={tp.id}>{tp.title}{tp.settings ? ` — ${tp.settings.cardLayout === 'single' ? 'تک‌رو' : 'دورو'} ${tp.settings.canvasW}×${tp.settings.canvasH}` : ''}</option>)}</select>
                    <button onClick={saveTemplate} className="bg-indigo-700 hover:bg-indigo-600 text-xs px-3 py-1.5 rounded font-bold transition-colors">ذخیره این بوم</button>
                    <button onClick={() => setShowTplManager(true)} className="bg-indigo-800 hover:bg-indigo-700 text-xs px-3 py-1.5 rounded font-bold border border-indigo-700">مدیریت بوم‌ها</button>
                </div>
                <div className="flex items-center gap-1 text-xs">
                    <button type="button" onClick={() => setShowLayers(v => !v)} aria-pressed={showLayers} className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-bold ${showLayers ? 'bg-white text-indigo-900' : 'bg-indigo-800 hover:bg-indigo-700'}`}><Icon name="Layers" className="w-3.5 h-3.5" /> لایه‌ها</button>
                    <button type="button" onClick={() => setSnapOn(v => !v)} aria-pressed={snapOn} title="چسبیدن به خطوط راهنما (Alt هنگام کشیدن = موقتاً خاموش)" className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-bold ${snapOn ? 'bg-white text-indigo-900' : 'bg-indigo-800 hover:bg-indigo-700'}`}><Icon name="Magnet" className="w-3.5 h-3.5" /> چسبیدن</button>
                    <span className="w-px h-5 bg-indigo-700 mx-1" />
                    <button type="button" onClick={() => stepZoom(-1)} aria-label="کوچک‌نمایی" title="کوچک‌نمایی" className="p-1.5 rounded bg-indigo-800 hover:bg-indigo-700"><Icon name="ZoomOut" className="w-3.5 h-3.5" /></button>
                    <select value={String(zoom)} aria-label="بزرگ‌نمایی" onChange={e => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))} className="bg-indigo-800 text-white px-1 py-1 rounded border border-indigo-700"><option value="fit">اندازه‌ی صفحه</option>{ZOOM_LEVELS.map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}</select>
                    <button type="button" onClick={() => stepZoom(1)} aria-label="بزرگ‌نمایی" title="بزرگ‌نمایی" className="p-1.5 rounded bg-indigo-800 hover:bg-indigo-700"><Icon name="ZoomIn" className="w-3.5 h-3.5" /></button>
                </div>
            </div>
            <div className="glass-soft border-b border-white/50 px-4 py-3 flex flex-wrap items-center justify-between z-10 gap-4 overflow-x-auto">
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => addField('text')} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0"><Icon name="Type" className="w-4 h-4" /> متن</button>
                    <button onClick={() => addField('select')} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0"><Icon name="LayoutTemplate" className="w-4 h-4" /> انتخابی</button>
                    <button onClick={() => addField('date')} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0"><Icon name="Calendar" className="w-4 h-4" /> تاریخ</button>
                    <button onClick={() => addField('barcode')} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium font-mono shrink-0">|||| بارکد</button>
                    <button onClick={() => addField('qrcode')} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium font-mono shrink-0"><Icon name="QrCode" className="w-4 h-4" /> QR</button>
                    <button onClick={() => addField('photo')} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-bold border shrink-0"><Icon name="Image" className="w-4 h-4" /> عکس</button>
                    <button onClick={() => addField('stars')} className="flex items-center gap-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-sm font-bold border border-amber-200 shrink-0"><Icon name="Star" className="w-4 h-4" /> ستاره‌ها</button>
                </div>
                <div className="flex items-center gap-2 w-full max-w-sm shrink-0">
                    <label className={`bg-slate-200 p-2 rounded-lg cursor-pointer ${uploading ? 'opacity-50 animate-pulse' : ''}`} title="آپلود عکس زمینه"><Icon name="UploadCloud" className="w-4 h-4 text-slate-700" /><span className="sr-only">آپلود عکس زمینه</span><input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; setUploading(true); const url = await uploadImageFile(f, { maxSize: BG_MAX_SIZE }); setUploading(false); if (url) { rescaleFrom.current = { ...bgDim }; onUpdateBg(url); } }} /></label>
                    <Icon name="Link" className="w-4 h-4 text-slate-400 shrink-0" /><input type="text" aria-label="لینک عکس زمینه" value={bgUrl || ''} onChange={e => onUpdateBg(e.target.value)} placeholder="یا لینک عکس..." className="flex-1 text-sm border-none bg-slate-100 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" dir="ltr" />
                    <span className="text-[10px] text-slate-500 font-mono shrink-0" dir="ltr" title="ابعاد بوم (پیکسل)">{bgDim.w}×{bgDim.h}</span>
                </div>
            </div>
            <div className="flex-1 overflow-auto bg-white/20 p-8 pt-12 relative">
                {showLayers && <LayersPanel fields={sideFields} selectedId={selectedId} onSelect={setSelectedId} onToggleLock={(id) => { const f = sideFields.find(x => x.id === id); patchField(id, { locked: !f.locked }, { checkpoint: true }); }} onMove={moveLayer} onClose={() => setShowLayers(false)} />}
                <div className="flex justify-center items-start min-w-fit">
                    <div ref={containerRef} className="keep-light relative shadow-2xl bg-white overflow-hidden select-none shrink-0 touch-none" style={{ width: zoom === 'fit' ? fitWidth : `${bgDim.w * zoom}px`, aspectRatio: `${bgDim.w} / ${bgDim.h}`, backgroundImage: cssUrl(bgUrl), backgroundSize: BG_FIT_CSS[fixed ? bgFit : 'stretch'] || '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} onPointerDown={(e) => { if (e.target === containerRef.current) setSelectedId(null); }}>
                        {sideFields.map((f, index) => (
                            <div key={f.id} onPointerDown={(e) => startInteraction(e, f.id, 'move')} className={`absolute border-2 flex items-center justify-center overflow-visible transition-colors duration-75 ${f.locked ? 'cursor-pointer' : 'cursor-move'} ${f.printOnCard ? (f.type === 'stars' ? 'bg-amber-200/10' : 'bg-white/70') : 'bg-red-100/80 border-red-400 border-dashed'} ${selectedId === f.id ? 'border-indigo-500 bg-indigo-500/20 shadow-[0_0_0_4px_rgba(99,102,241,0.2)]' : 'border-dashed border-slate-500/50 hover:border-slate-800'} ${f.type === 'photo' && f.shape === 'CIRCLE' ? 'rounded-full' : ''} ${f.type === 'photo' && f.shape === 'ROUNDED' ? 'rounded-2xl' : ''} ${f.type === 'photo' && f.shape === 'OVAL' ? 'rounded-[50%]' : ''}`} style={{ left: pct(f.x, bgDim.w), top: pct(f.y, bgDim.h), width: pct(f.w, bgDim.w), height: pct(f.h, bgDim.h), zIndex: selectedId === f.id ? 1000 : index + 1 }} title={f.label}>
                                {!f.printOnCard && <Icon name="EyeOff" className="w-5 h-5 absolute top-1 right-1 text-red-500 opacity-50" />}
                                {f.locked && <Icon name="Lock" className="w-3.5 h-3.5 absolute top-1 left-1 text-amber-700 opacity-80" />}
                                {f.type === 'stars' ? <StarsBoxPreview field={f} /> : f.type === 'barcode' ? <div className="flex flex-col items-center opacity-70 w-full h-full justify-center pointer-events-none overflow-hidden"><span className="font-bold tracking-widest text-xs font-mono">||| |||| || |</span><span className="text-[10px] mt-1">{f.linkedFieldId ? 'متصل' : 'دستی'}</span></div> : f.type === 'qrcode' ? <div className="flex flex-col items-center opacity-70 w-full h-full justify-center pointer-events-none text-center overflow-hidden"><Icon name="QrCode" className="w-8 h-8 mb-1" /><span className="text-[10px] leading-tight">{f.qrSource === 'verify' ? 'استعلام اعتبار' : (f.linkedFieldId ? 'متصل ' + (f.qrTemplate ? '(لینک دار)' : '') : 'دستی')}</span></div> : <span className="text-sm font-bold opacity-70 px-1 rounded pointer-events-none text-center overflow-hidden">{f.label}{f.required ? ' *' : ''} {f.printOnCard ? '' : '(مخفی)'}</span>}
                                {selectedId === f.id && !f.locked && RESIZE_HANDLES.map(([dir, lx, ty, cursor]) => (
                                    <span key={dir} onPointerDown={(e) => startInteraction(e, f.id, dir)} className="absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm z-50" style={{ left: `calc(${lx}% - 6px)`, top: `calc(${ty}% - 6px)`, cursor }} aria-hidden="true" />
                                ))}
                            </div>
                        ))}
                        {guides && guides.x !== null && <div className="absolute top-0 bottom-0 w-px bg-pink-500 pointer-events-none z-[1100]" style={{ left: pct(guides.x, bgDim.w) }} />}
                        {guides && guides.y !== null && <div className="absolute left-0 right-0 h-px bg-pink-500 pointer-events-none z-[1100]" style={{ top: pct(guides.y, bgDim.h) }} />}
                    </div>
                </div>
                <p className="text-center text-[11px] text-slate-500 mt-4">{selected ? <>جابه‌جایی: کلیدهای جهت (Shift = ۱۰px) — تغییر اندازه: دستگیره‌ها (Shift = حفظ نسبت) — کپی: Ctrl+D — حذف: Delete — Alt هنگام کشیدن: بدون چسبیدن</> : 'روی المان کلیک کنید تا انتخاب شود.'}</p>
            </div>
        </div>
    );
}

function PropertiesSidebarPanel({ data, setData, selectedFieldId, onDelete, onSelect, dbPresets, globalValidations }) {
    const selectedField = (data.fields || []).find(f => f.id === selectedFieldId); if (!selectedField) return null;
    const updateSelected = (key, value) => setData(p => ({ ...p, fields: p.fields.map(f => f.id === selectedFieldId ? { ...f, [key]: value } : f) }));
    const updateSelectedMany = (patch) => setData(p => ({ ...p, fields: p.fields.map(f => f.id === selectedFieldId ? { ...f, ...patch } : f) }));
    const options = Array.isArray(selectedField.options) ? selectedField.options : [];
    // به‌روزرسانی immutable گزینه‌ها (بدون تغییر مستقیم state)
    const updateOption = (i, patch) => updateSelected('options', options.map((o, idx) => idx === i ? { ...o, ...patch } : o));
    const updateOptionCol = (i, col, value) => updateSelected('options', options.map((o, idx) => idx === i ? { ...o, colValues: { ...(o.colValues || {}), [col]: value } } : o));
    const loadPresetOptions = (presetKey) => { if (!presetKey) return; const targetPreset = dbPresets.find(p => p.preset_key === presetKey); if (targetPreset && targetPreset.options) updateSelectedMany({ options: targetPreset.options.map(p => ({ ...p, colValues: { ...(p.colValues || {}) } })), cols: [...(targetPreset.cols || [])] }); };
    const sourceFields = (data.fields || []).filter(f => (f.type === 'text' || f.type === 'select') && f.id !== selectedField.id);
    const lengths = Array.isArray(selectedField.lengthLimits) ? selectedField.lengthLimits : (selectedField.lengthLimit ? [selectedField.lengthLimit] : []);
    const moveOption = (index, dir) => { const newOpts = [...options]; [newOpts[index], newOpts[index + dir]] = [newOpts[index + dir], newOpts[index]]; updateSelected('options', newOpts); };
    const conditions = data.conditions || [];
    const updateCond = (ci, patch) => setData(p => ({ ...p, conditions: (p.conditions || []).map((c, i) => i === ci ? { ...c, ...patch } : c) }));
    const removeCond = (ci) => setData(p => ({ ...p, conditions: (p.conditions || []).filter((_, i) => i !== ci) }));
    const uploadCondImage = async (ci, key, file, keepTransparency = false) => { if (!file) return; const url = await uploadImageFile(file, { keepTransparency, maxSize: BG_MAX_SIZE }); if (url) updateCond(ci, { [key]: url }); };
    const single = isSingleSided(data);

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
            <div className="flex justify-between items-center border-b pb-4"><h4 className="font-bold text-indigo-900 flex items-center gap-2"><Icon name="Settings" className="w-5 h-5" /> ویژگی‌های المان</h4><div className="flex gap-1"><button type="button" onClick={() => updateSelected('locked', !selectedField.locked)} aria-pressed={!!selectedField.locked} title={selectedField.locked ? 'باز کردن قفل' : 'قفل (جلوگیری از جابه‌جایی)'} aria-label={selectedField.locked ? 'باز کردن قفل' : 'قفل کردن المان'} className={`px-2 py-1.5 rounded-lg text-sm ${selectedField.locked ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'}`}><Icon name={selectedField.locked ? 'Lock' : 'Unlock'} className="w-4 h-4" /></button><button type="button" onClick={() => { let newId = null; setData(p => { const [next, id] = duplicateFieldInData(p, selectedFieldId); newId = id; return next; }, { checkpoint: true }); setTimeout(() => newId && onSelect && onSelect(newId), 0); }} title="کپی المان (Ctrl+D)" aria-label="کپی المان" className="text-slate-600 hover:bg-slate-100 px-2 py-1.5 rounded-lg text-sm"><Icon name="Copy" className="w-4 h-4" /></button><button onClick={async () => { if (!(await confirmRemoveField(data, selectedFieldId))) return; onDelete(); setData(p => removeFieldFromData(p, selectedFieldId), { checkpoint: true }); }} title="حذف (Delete)" className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-bold">حذف</button></div></div>
            <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex justify-between items-center"><span className="text-sm font-bold text-indigo-900">چاپ روی کارت</span><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" className="sr-only peer" checked={!!selectedField.printOnCard} onChange={e => updateSelected('printOnCard', e.target.checked)} /><div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div></label></div>
            {!selectedField.printOnCard && <p className="text-xs text-slate-500 -mt-4 text-center">فقط در فرم نمایش داده می‌شود.</p>}
            <div><label className="text-xs text-slate-500 block mb-1">عنوان فیلد (نمایش در فرم)</label><input type="text" className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white" value={selectedField.label} onChange={e => updateSelected('label', e.target.value)} /></div>
            {['text', 'select', 'date', 'photo', 'barcode', 'qrcode'].includes(selectedField.type) && !selectedField.autoIncrement && !(selectedField.linkedFieldId && ['text', 'barcode', 'qrcode'].includes(selectedField.type)) && selectedField.qrSource !== 'verify' && (
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer bg-slate-50 border rounded-xl px-3 py-2"><input type="checkbox" checked={!!selectedField.required} onChange={e => updateSelected('required', e.target.checked)} className="accent-indigo-600 w-4 h-4" /> الزامی در فرم <span className="text-[10px] font-normal text-slate-500">(بدون پر کردن، کارت صادر نمی‌شود)</span></label>
            )}

            {selectedField.type === 'date' && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
                    <div><label className="text-xs font-bold text-slate-700 block mb-1">منبع تاریخ</label><select value={selectedField.dateSource || 'input'} onChange={e => updateSelected('dateSource', e.target.value)} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none"><option value="input">ورودی کاربر در فرم</option><option value="issued">تاریخ صدور کارت (خودکار)</option><option value="expiry">تاریخ انقضای کارت (خودکار)</option></select>{selectedField.dateSource === 'expiry' && <p className="text-[10px] text-slate-500 mt-1">بر اساس «مدت اعتبار کارت» در مرحله‌ی اول ویزارد؛ اگر اعتبار نامحدود باشد، چیزی چاپ نمی‌شود.</p>}</div>
                    {(selectedField.dateSource || 'input') === 'input' && <><div><label className="text-xs font-bold text-slate-700 block mb-1">تقویم ورودی (فرم کاربر)</label><select value={selectedField.inputCalendar || 'jalali'} onChange={e => updateSelected('inputCalendar', e.target.value)} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none"><option value="jalali">هجری شمسی</option><option value="gregorian">میلادی</option></select></div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-700 block mb-1">از سال (حداقل)</label>
                            <input type="number" value={selectedField.minYear || ''} onChange={e => updateSelected('minYear', e.target.value ? Number(e.target.value) : null)} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none" placeholder={selectedField.inputCalendar === 'gregorian' ? '1900' : '1300'} />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-700 block mb-1">تا سال (حداکثر)</label>
                            <input type="number" value={selectedField.maxYear || ''} onChange={e => updateSelected('maxYear', e.target.value ? Number(e.target.value) : null)} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none" placeholder={selectedField.inputCalendar === 'gregorian' ? '2050' : '1450'} />
                        </div>
                    </div></>}
                    <div><label className="text-xs font-bold text-slate-700 block mb-1">تقویم چاپ (روی کارت)</label><select value={selectedField.printCalendar || 'jalali'} onChange={e => updateSelectedMany({ printCalendar: e.target.value, dateFormat: 'YYYY/MM/DD' })} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none"><option value="jalali">هجری شمسی</option><option value="gregorian">میلادی</option><option value="lunar">هجری قمری</option></select></div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">فرمت خروجی (روی کارت)</label>
                        <select value={selectedField.dateFormat || 'YYYY/MM/DD'} onChange={e => updateSelected('dateFormat', e.target.value)} className="w-full border rounded px-2 py-2 text-sm bg-white outline-none">
                            {(!selectedField.printCalendar || selectedField.printCalendar === 'jalali') && (<optgroup label="هجری شمسی"><option value="YYYY/MM/DD">1402/05/12 (استاندارد)</option><option value="YYYY-MM-DD">1402-05-12 (بین‌المللی)</option><option value="TEXT_MIXED">12 مرداد 1402 (ترکیبی)</option><option value="TEXT_FULL">پنجشنبه، 12 مرداد 1402 (کامل)</option><option value="MONTH_YEAR">مرداد 1402 (فقط ماه و سال)</option></optgroup>)}
                            {selectedField.printCalendar === 'gregorian' && (<optgroup label="میلادی"><option value="YYYY/MM/DD">2026/08/12 (استاندارد)</option><option value="DD/MM/YYYY">12/08/2026 (اروپا)</option><option value="MM/DD/YYYY">08/12/2026 (آمریکا)</option><option value="TEXT_SHORT">Aug 12, 2026 (کوتاه)</option><option value="TEXT_LONG">12 August 2026 (بلند)</option><option value="TEXT_FULL">Wednesday, August 12, 2026 (کامل)</option><option value="FA_TEXT">۱۲ آگوست ۲۰۲۶ (فارسی)</option><option value="FA_TEXT_FULL">چهارشنبه، ۱۲ آگوست ۲۰۲۶ (فارسی کامل)</option></optgroup>)}
                            {selectedField.printCalendar === 'lunar' && (<optgroup label="هجری قمری"><option value="YYYY/MM/DD">1445/01/12 (عددی)</option><option value="TEXT">12 محرم 1445 (نوشتاری)</option></optgroup>)}
                        </select>
                    </div>
                </div>
            )}

            {selectedField.type === 'text' && (
                <div className="space-y-4">
                    <div><label className="text-xs text-slate-500 block mb-1">نوع ورودی (اعتبارسنجی)</label><select className="w-full border rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={selectedField.textType || 'free'} onChange={e => updateSelected('textType', e.target.value)}><option value="free">کاملاً آزاد (حروف، عدد، نماد)</option><option value="fa_mixed">ترکیبی فارسی (فارسی، عدد)</option><option value="en_mixed">ترکیبی انگلیسی (انگلیسی، عدد)</option><option value="fa_text">فقط حروف فارسی</option><option value="en_text">فقط حروف انگلیسی</option><option value="fa_num">فقط عدد (نمایش فارسی)</option><option value="en_num">فقط عدد (نمایش انگلیسی)</option></select></div>
                    {(selectedField.textType || 'free') !== 'free' && globalValidations && globalValidations.length > 0 && (<div className="bg-indigo-50/50 border p-3 rounded-xl"><label className="text-xs font-bold text-indigo-900 block mb-1">قانون اعتبارسنجی (داینامیک)</label><select value={selectedField.validationId ? String(selectedField.validationId) : ''} onChange={e => updateSelected('validationId', e.target.value)} className="w-full border rounded text-sm p-1.5"><option value="">-- بدون الگو (آزاد) --</option>{globalValidations.map(v => <option key={v.id} value={String(v.id)}>{v.title}</option>)}</select></div>)}
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={selectedField.autoIncrement || false} onChange={e => updateSelected('autoIncrement', e.target.checked)} className="accent-indigo-600 w-4 h-4 rounded" /> سریال خودکار (Auto-Increment)</label>
                    {selectedField.autoIncrement && (<div className="bg-slate-50 border p-2 rounded text-xs space-y-2"><input type="text" placeholder="پیشوند (مثال KYN-)" value={selectedField.autoIncPrefix || ''} onChange={e => updateSelected('autoIncPrefix', e.target.value)} className="w-full border rounded p-1" dir="ltr" /><input type="number" min="1" placeholder="شروع از (مثال 1001)" value={selectedField.autoIncStart || 1} onChange={e => updateSelected('autoIncStart', Math.max(1, Number(e.target.value) || 1))} className="w-full border rounded p-1" dir="ltr" /><p className="text-[10px] text-slate-500">شماره توسط سرور و به ترتیب به هر کارت اختصاص داده می‌شود.</p></div>)}
                    {(selectedField.textType === 'fa_num' || selectedField.textType === 'en_num') && !selectedField.linkedFieldId && !selectedField.autoIncrement && (
                        <div className="mt-3 p-3 bg-slate-50 border rounded-xl space-y-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={selectedField.hasLengthLimit || false} onChange={e => updateSelected('hasLengthLimit', e.target.checked)} className="accent-indigo-600 w-4 h-4 rounded" /> محدودیت دقیق ارقام</label>
                            {selectedField.hasLengthLimit && (<div className="space-y-2 mt-2"><p className="text-[10px] text-slate-500">طول‌های مجاز:</p>{lengths.map((len, idx) => (<div key={idx} className="flex gap-1 items-center"><input type="number" value={len} onChange={e => updateSelected('lengthLimits', lengths.map((l, i) => i === idx ? (e.target.value === '' ? '' : Number(e.target.value)) : l))} className="w-full border rounded px-2 py-1 text-sm text-center" dir="ltr" placeholder="تعداد ارقام" /><button onClick={() => updateSelected('lengthLimits', lengths.filter((_, i) => i !== idx))} className="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold hover:bg-red-200">-</button></div>))}<button onClick={() => updateSelected('lengthLimits', [...lengths, ''])} className="w-full bg-indigo-100 text-indigo-700 py-1.5 rounded text-xs font-bold hover:bg-indigo-200 transition-colors">+ افزودن تعداد ارقام مجاز</button></div>)}
                        </div>
                    )}
                </div>
            )}

            {selectedField.type === 'select' && (
                <div className="bg-slate-50 p-4 rounded-xl border">
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-xs text-slate-700 font-bold">گزینه‌های لیست</label>
                        <div className="flex gap-2 items-center">
                            <select value="" onChange={e => loadPresetOptions(e.target.value)} className="text-[10px] border border-slate-300 rounded p-1 bg-white outline-none cursor-pointer">
                                <option value="">+ لیست آماده (دیتابیس)...</option>{dbPresets.map(p => <option key={p.preset_key} value={p.preset_key}>{p.title}</option>)}
                            </select>
                            <label className="flex items-center gap-1.5 text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-lg cursor-pointer hover:bg-slate-100"><input type="checkbox" checked={selectedField.hasOtherOption || false} onChange={e => updateSelected('hasOtherOption', e.target.checked)} className="accent-indigo-600" /> «سایر...»</label>
                        </div>
                    </div>
                    <div className="mb-4 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                        <h5 className="text-[10px] font-bold text-indigo-800 mb-2">ستون‌های متصل (Data Columns)</h5>
                        {(selectedField.cols || []).map((col, cIdx) => (<div key={cIdx} className="flex gap-1 mb-1 items-center"><input value={col} onChange={e => updateSelected('cols', (selectedField.cols || []).map((c, i) => i === cIdx ? e.target.value : c))} className="flex-1 text-xs border rounded px-2 py-1" placeholder="نام ستون..." /><button onClick={() => updateSelected('cols', (selectedField.cols || []).filter((_, i) => i !== cIdx))} className="text-red-500 px-1 text-xs font-bold">×</button></div>))}
                        <button onClick={() => updateSelected('cols', [...(selectedField.cols || []), `ستون ${(selectedField.cols || []).length + 1}`])} className="w-full text-[10px] bg-white border border-indigo-200 text-indigo-700 py-1 rounded hover:bg-indigo-50 font-bold">+ افزودن ستون</button>
                    </div>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {options.map((opt, i) => (
                            <div key={i} className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm relative">
                                <div className="flex gap-1 items-center mb-1"><input value={opt.display || ''} onChange={e => updateOption(i, { display: e.target.value })} className="w-1/2 text-xs border rounded p-1.5" placeholder="نمایش فرم" /><input value={opt.print || ''} onChange={e => updateOption(i, { print: e.target.value })} className="w-1/2 text-xs border rounded p-1.5" placeholder="چاپ (خالی=نمایش)" dir="auto" /></div>
                                {(selectedField.cols || []).length > 0 && (<div className="mt-2 pl-2 border-r-2 border-indigo-200 space-y-1 mb-2">{(selectedField.cols || []).map((col, ci) => (<div key={ci} className="flex items-center gap-1"><span className="text-[9px] text-slate-500 w-12 truncate">{col}:</span><input value={(opt.colValues && opt.colValues[col]) || ''} onChange={e => updateOptionCol(i, col, e.target.value)} className="flex-1 text-xs border bg-slate-50 rounded px-1.5 py-1" /></div>))}</div>)}
                                <div className="flex gap-1 justify-end mt-2 pt-2 border-t border-slate-100"><button onClick={() => moveOption(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-indigo-600 disabled:opacity-30 flex items-center gap-1 bg-slate-50 hover:bg-indigo-50 px-2 py-1 rounded text-[10px] transition-colors"><Icon name="ArrowUp" className="w-3 h-3" /> بالاتر</button><button onClick={() => moveOption(i, 1)} disabled={i === options.length - 1} className="text-slate-500 hover:text-indigo-600 disabled:opacity-30 flex items-center gap-1 bg-slate-50 hover:bg-indigo-50 px-2 py-1 rounded text-[10px] transition-colors"><Icon name="ArrowDown" className="w-3 h-3" /> پایین‌تر</button><button onClick={() => updateSelected('options', options.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 flex items-center gap-1 bg-red-50 hover:bg-red-100 px-2 py-1 rounded text-[10px] transition-colors ml-auto"><Icon name="X" className="w-3 h-3" /> حذف</button></div>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => updateSelected('options', [...options, { display: '', print: '', colValues: {} }])} className="w-full mt-3 text-xs bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm">+ افزودن گزینه</button>
                </div>
            )}

            {selectedField.type === 'stars' && <StarsProperties field={selectedField} update={updateSelectedMany} data={data} />}

            {selectedField.type === 'photo' && (<div><label className="text-xs text-slate-500 block mb-1">قالب برش</label><select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={selectedField.shape || 'ROUNDED'} onChange={e => updateSelected('shape', e.target.value)}>{Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>)}

            {selectedField.type === 'qrcode' && (
                <div className="bg-slate-50 p-3 rounded-xl border"><label className="text-xs text-slate-700 font-bold block mb-1">محتوای QR</label><select value={selectedField.qrSource === 'verify' ? 'verify' : 'data'} onChange={e => updateSelectedMany({ qrSource: e.target.value === 'verify' ? 'verify' : '', linkedFieldId: '', linkedColumn: '' })} className="w-full border rounded px-2 py-2 text-sm bg-white"><option value="data">ورودی دستی یا داده‌ی فیلد دیگر</option><option value="verify">لینک استعلام اعتبار کارت</option></select>{selectedField.qrSource === 'verify' && <p className="text-[10px] text-slate-500 mt-1">با اسکن QR صفحه‌ی استعلام باز می‌شود و وضعیت کارت (معتبر، منقضی، باطل) نمایش داده می‌شود. مدت اعتبار در مرحله‌ی اول ویزارد تنظیم می‌شود.</p>}</div>
            )}
            {(selectedField.type === 'barcode' || (selectedField.type === 'qrcode' && selectedField.qrSource !== 'verify') || selectedField.type === 'text') && (
                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border">
                    <div className="text-xs text-slate-500 rounded font-medium mb-2">{selectedField.type === 'qrcode' ? 'QR Code استاندارد.' : selectedField.type === 'barcode' ? 'بارکد با آنتی‌الیایز وضوح بالا.' : 'تغذیه از فیلد دیگر.'}</div>
                    <div>
                        <label className="text-xs text-slate-700 font-bold block mb-1">تغذیه خودکار از فیلد (Master)</label>
                        <select value={selectedField.linkedFieldId || ''} onChange={e => updateSelectedMany({ linkedFieldId: e.target.value, linkedColumn: '' })} className="w-full border rounded px-2 py-2 text-sm bg-white"><option value="">-- مستقل (دستی) --</option>{sourceFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                    </div>
                    {selectedField.linkedFieldId && (() => {
                        const master = sourceFields.find(f => f.id === selectedField.linkedFieldId);
                        if (master && master.type === 'select' && (master.cols || []).length > 0) {
                            return (<div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded-lg"><label className="text-[10px] text-indigo-800 font-bold block mb-1">خواندن داده از ستون:</label><select value={selectedField.linkedColumn || ''} onChange={e => updateSelected('linkedColumn', e.target.value)} className="w-full border rounded px-1 py-1 text-xs bg-white"><option value="">(مقدار اصلی گزینه)</option>{master.cols.map((c, i) => <option key={i} value={c}>{c}</option>)}</select></div>);
                        } return null;
                    })()}
                    {selectedField.type === 'qrcode' && selectedField.linkedFieldId && (<div><label className="text-xs text-slate-700 font-bold block mb-1 mt-3">الگوی لینک (Template - اختیاری)</label><input type="text" value={selectedField.qrTemplate || ''} onChange={e => updateSelected('qrTemplate', e.target.value)} placeholder="https://site.com/?id=" className="w-full border rounded px-2 py-2 text-sm bg-white text-left" dir="ltr" /></div>)}
                </div>
            )}

            {(selectedField.type === 'text' || selectedField.type === 'select' || selectedField.type === 'date') && (
                <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
                    <label className="text-xs text-slate-700 font-bold">ظاهر متن روی کارت</label>
                    <div className="flex gap-4"><div className="flex-1"><label className="text-[10px] text-slate-500 block mb-1">نوع رنگ‌بندی</label><select className="w-full border rounded px-2 py-1 text-sm bg-white" value={selectedField.fillType || 'solid'} onChange={e => updateSelected('fillType', e.target.value)}><option value="solid">تک‌رنگ</option><option value="linear">گرادیانت خطی</option></select></div><div className="flex-1"><label className="text-[10px] text-slate-500 block mb-1">چیدمان</label><select className="w-full border rounded px-2 py-1 text-sm bg-white" value={selectedField.align || 'right'} onChange={e => updateSelected('align', e.target.value)}><option value="right">راست‌چین</option><option value="center">وسط‌چین</option><option value="left">چپ‌چین</option></select></div></div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] text-slate-500 block mb-1">تراز عمودی</label><select className="w-full border rounded px-2 py-1 text-sm bg-white" value={selectedField.vAlign || 'middle'} onChange={e => updateSelected('vAlign', e.target.value)}><option value="top">بالا</option><option value="middle">وسط</option><option value="bottom">پایین</option></select></div>
                        <div><label className="text-[10px] text-slate-500 block mb-1">ضخامت فونت</label><select className="w-full border rounded px-2 py-1 text-sm bg-white" value={selectedField.fontWeight === 'normal' ? 'normal' : 'bold'} onChange={e => updateSelected('fontWeight', e.target.value)}><option value="bold">ضخیم</option><option value="normal">معمولی</option></select></div>
                        <div><label className="text-[10px] text-slate-500 block mb-1">فاصله‌ی حروف (px)</label><input type="number" step="0.5" className="w-full border rounded px-2 py-1 text-sm bg-white text-center" value={selectedField.letterSpacing || 0} onChange={e => updateSelected('letterSpacing', Number(e.target.value))} dir="ltr" /></div>
                        {selectedField.type !== 'date' && <div className="flex items-end"><label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pb-1"><input type="checkbox" checked={!!selectedField.multiline} onChange={e => updateSelected('multiline', e.target.checked)} className="accent-indigo-600" /> چندخطی (شکستن خودکار)</label></div>}
                        {selectedField.multiline && selectedField.type !== 'date' && <div><label className="text-[10px] text-slate-500 block mb-1">فاصله‌ی خطوط</label><input type="number" step="0.1" min="0.8" max="3" className="w-full border rounded px-2 py-1 text-sm bg-white text-center" value={selectedField.lineHeight || 1.3} onChange={e => updateSelected('lineHeight', Number(e.target.value))} dir="ltr" /></div>}
                    </div>
                    {selectedField.multiline && <p className="text-[10px] text-slate-500">متن داخل عرض کادر شکسته می‌شود و فونت تا جایی کوچک می‌شود که همه‌ی خطوط در ارتفاع کادر جا شوند. ارتفاع کادر را متناسب بزرگ کنید.</p>}
                    <div className="flex gap-2"><div className="flex-1"><label className="text-[10px] text-slate-500 block mb-1">رنگ اصلی</label><div className="flex gap-1 items-center"><input type="color" value={selectedField.color || '#000000'} onChange={e => updateSelected('color', e.target.value)} className="h-6 w-8 p-0" /></div></div>{selectedField.fillType === 'linear' && <div className="flex-1"><label className="text-[10px] text-slate-500 block mb-1">رنگ دوم</label><div className="flex gap-1 items-center"><input type="color" value={selectedField.color2 || '#ffffff'} onChange={e => updateSelected('color2', e.target.value)} className="h-6 w-8 p-0" /></div></div>}</div>
                    <div className="border-t pt-2 mt-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer mb-2"><input type="checkbox" checked={selectedField.hasStroke || false} onChange={e => updateSelected('hasStroke', e.target.checked)} className="accent-indigo-600 rounded" /> افزودن حاشیه (Stroke)</label>
                        {selectedField.hasStroke && <div className="flex gap-2 mb-2"><input type="color" value={selectedField.strokeColor || '#ffffff'} onChange={e => updateSelected('strokeColor', e.target.value)} className="h-6 w-8 p-0" /><input type="number" value={selectedField.strokeWidth || 2} onChange={e => updateSelected('strokeWidth', Number(e.target.value))} className="w-16 border rounded text-xs text-center" placeholder="ضخامت" /></div>}
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer mb-2"><input type="checkbox" checked={selectedField.hasShadow || false} onChange={e => updateSelected('hasShadow', e.target.checked)} className="accent-indigo-600 rounded" /> افزودن سایه (Shadow)</label>
                        {selectedField.hasShadow && <div className="flex gap-2"><input type="color" value={selectedField.shadowColor || '#000000'} onChange={e => updateSelected('shadowColor', e.target.value)} className="h-6 w-8 p-0" /><input type="number" value={selectedField.shadowBlur || 4} onChange={e => updateSelected('shadowBlur', Number(e.target.value))} className="w-16 border rounded text-xs text-center" placeholder="محوی" /></div>}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border">
                <div><label className="text-xs text-slate-500 block mb-1">X (چپ/راست)</label><input type="number" className="w-full border rounded px-2 py-1 text-sm bg-white" value={Math.round(selectedField.x)} onChange={e => updateSelected('x', Number(e.target.value))} /></div>
                <div><label className="text-xs text-slate-500 block mb-1">Y (بالا/پایین)</label><input type="number" className="w-full border rounded px-2 py-1 text-sm bg-white" value={Math.round(selectedField.y)} onChange={e => updateSelected('y', Number(e.target.value))} /></div>
                <div><label className="text-xs text-slate-500 block mb-1">عرض (W)</label><input type="number" min="1" className="w-full border rounded px-2 py-1 text-sm bg-white" value={Math.round(selectedField.w)} onChange={e => updateSelected('w', Math.max(1, Number(e.target.value)))} /></div>
                <div><label className="text-xs text-slate-500 block mb-1">ارتفاع (H)</label><input type="number" min="1" className="w-full border rounded px-2 py-1 text-sm bg-white" value={Math.round(selectedField.h)} onChange={e => updateSelected('h', Math.max(1, Number(e.target.value)))} /></div>
            </div>

            {selectedField.type === 'select' && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mt-4">
                    <label className="flex items-center gap-2 text-sm text-indigo-900 font-bold mb-2 cursor-pointer"><input type="checkbox" checked={selectedField.isConditionTrigger || false} onChange={e => updateSelected('isConditionTrigger', e.target.checked)} className="rounded text-indigo-600 w-4 h-4" /> تغییرات گرافیکی بر اساس این فیلد</label>
                    {selectedField.isConditionTrigger && (<button onClick={() => { if (options.length === 0) return notify('اول گزینه‌ها را وارد کنید'); const newCond = { triggerFieldId: selectedField.id, value: options[0].display, newFrontBg: '', newBackBg: '', hasOverlay: false }; setData(p => ({ ...p, conditions: [...(p.conditions || []), newCond] })); }} className="text-xs bg-white text-indigo-700 py-2 border border-indigo-200 rounded-lg w-full hover:bg-indigo-50 font-bold transition-colors mt-2 shadow-sm">+ افزودن قانون گرافیکی جدید</button>)}
                </div>
            )}

            {selectedField.isConditionTrigger && (
                <div className="bg-slate-50 border rounded-xl p-3 mt-3">
                    <h5 className="text-xs font-bold text-slate-600 mb-2">قوانین ثبت شده برای این فیلد:</h5>
                    {conditions.map((cond, ci) => cond.triggerFieldId !== selectedField.id ? null : (
                        <div key={ci} className="bg-white border rounded p-2 mb-2 relative">
                            <span className="text-[10px] text-slate-400 block mb-1">اگر انتخاب کاربر برابر باشد با:</span>
                            <select value={cond.value} onChange={e => updateCond(ci, { value: e.target.value })} className="border rounded text-sm p-1 bg-slate-50 w-full mb-2">{options.filter(o => o.display).map((opt, oi) => <option key={oi} value={opt.display}>{opt.display}</option>)}</select>

                            <div className="flex gap-1 mb-1"><label className="bg-slate-100 hover:bg-slate-200 p-1 rounded cursor-pointer border flex-shrink-0" title={single ? 'تغییر تصویر پس‌زمینه' : 'تغییر عکس کل روی کارت'}><Icon name="UploadCloud" className="w-3 h-3 text-slate-600" /><input type="file" accept="image/*" className="hidden" onChange={e => { uploadCondImage(ci, 'newFrontBg', e.target.files[0]); e.target.value = ''; }} /></label><input type="text" placeholder={single ? 'لینک تغییر پس‌زمینه...' : 'لینک تغییر بک‌گراند روی کارت...'} value={cond.newFrontBg || ''} onChange={e => updateCond(ci, { newFrontBg: e.target.value })} className="w-full border rounded text-xs p-1" dir="ltr" /></div>

                            {!single && (<div className="flex gap-1 mb-2"><label className="bg-slate-100 hover:bg-slate-200 p-1 rounded cursor-pointer border flex-shrink-0" title="تغییر عکس کل پشت کارت"><Icon name="UploadCloud" className="w-3 h-3 text-slate-600" /><input type="file" accept="image/*" className="hidden" onChange={e => { uploadCondImage(ci, 'newBackBg', e.target.files[0]); e.target.value = ''; }} /></label><input type="text" placeholder="لینک تغییر بک‌گراند پشت کارت..." value={cond.newBackBg || ''} onChange={e => updateCond(ci, { newBackBg: e.target.value })} className="w-full border rounded text-xs p-1" dir="ltr" /></div>)}

                            <div className="border-t border-slate-100 pt-2 mt-2">
                                <label className="flex items-center gap-2 text-[10px] font-bold text-indigo-700 mb-2 cursor-pointer"><input type="checkbox" checked={cond.hasOverlay || false} onChange={e => updateCond(ci, { hasOverlay: e.target.checked })} className="accent-indigo-600" /> افزودن لایه عکس (PNG Overlay) روی کارت</label>
                                {cond.hasOverlay && (
                                    <div className="space-y-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                                        <div className="flex gap-1"><label className="bg-white hover:bg-slate-100 p-1 rounded cursor-pointer border flex-shrink-0" title="آپلود فایل لایه"><Icon name="UploadCloud" className="w-3 h-3 text-indigo-600" /><input type="file" accept="image/png" className="hidden" onChange={e => { uploadCondImage(ci, 'overlayImage', e.target.files[0], true); e.target.value = ''; }} /></label><input type="text" placeholder="لینک عکس لایه..." value={cond.overlayImage || ''} onChange={e => updateCond(ci, { overlayImage: e.target.value })} className="w-full border rounded text-xs p-1 bg-white" dir="ltr" /></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-[9px] text-slate-500 mb-1 block">X</label><input type="number" value={cond.overlayX || 0} onChange={e => updateCond(ci, { overlayX: Number(e.target.value) })} className="w-full border rounded px-1.5 py-1 text-[10px] bg-white" /></div>
                                            <div><label className="text-[9px] text-slate-500 mb-1 block">Y</label><input type="number" value={cond.overlayY || 0} onChange={e => updateCond(ci, { overlayY: Number(e.target.value) })} className="w-full border rounded px-1.5 py-1 text-[10px] bg-white" /></div>
                                            <div><label className="text-[9px] text-slate-500 mb-1 block">عرض</label><input type="number" value={cond.overlayW || 100} onChange={e => updateCond(ci, { overlayW: Number(e.target.value) })} className="w-full border rounded px-1.5 py-1 text-[10px] bg-white" /></div>
                                            <div><label className="text-[9px] text-slate-500 mb-1 block">ارتفاع</label><input type="number" value={cond.overlayH || 100} onChange={e => updateCond(ci, { overlayH: Number(e.target.value) })} className="w-full border rounded px-1.5 py-1 text-[10px] bg-white" /></div>
                                        </div>
                                        {!single && <select value={cond.overlaySide || 'front'} onChange={e => updateCond(ci, { overlaySide: e.target.value })} className="w-full border rounded text-[10px] p-1.5 bg-white"><option value="front">رندر روی کارت</option><option value="back">رندر پشت کارت</option></select>}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => removeCond(ci)} className="absolute top-1 left-1 text-red-400 hover:text-red-600"><Icon name="X" className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ==========================================
// 5. ADMIN MANAGEMENT MODALS
// ==========================================
const ModalShell = ({ title, icon, onClose, wide, children }) => { useEscape(onClose); return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"><div role="dialog" aria-modal="true" aria-label={title} className={`glass-strong rounded-3xl p-6 w-full ${wide ? 'max-w-4xl max-h-[90vh]' : 'max-w-2xl'} my-8 shadow-2xl flex flex-col`}><div className="flex justify-between items-center border-b pb-4 mb-4"><h3 className="text-xl font-bold flex items-center gap-2"><Icon name={icon} /> {title}</h3><button aria-label="بستن" onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-5 h-5" /></button></div><div className="flex-1 overflow-y-auto min-h-0">{children}</div></div></div>
); };

// --- لیست‌های پایه ↔ اکسل: ستون A «نمایش در فرم»، ستون B «چاپ روی کارت»، ستون‌های بعدی = ستون‌های وابسته ---
const PRESET_HEADERS = ['نمایش در فرم', 'چاپ روی کارت'];
const PRESET_HEADER_WORDS = ['نمایش در فرم', 'نمایش', 'عنوان', 'نام', 'گزینه', 'مقدار', 'display', 'title', 'name', 'option', 'value', 'label'];
const normCell = (s) => normalizeFa(String(s ?? '')).replace(/\s+/g, ' ').trim();
const optKey = (s) => normCell(s).toLowerCase();
const presetToRows = (p) => {
    const cols = p.cols || [];
    return [[...PRESET_HEADERS, ...cols], ...(p.options || []).map(o => [o.display || '', o.print || '', ...cols.map(c => (o.colValues || {})[c] || '')])];
};
/** ردیف‌های فایل → گزینه‌ها و ستون‌ها. ردیف عنوان (اگر باشد) خودکار تشخیص داده می‌شود؛ تکراری‌ها و ردیف‌های خالی کنار گذاشته می‌شوند. */
const rowsToPreset = (rows) => {
    const clean = rows.map(r => (r || []).map(normCell)).filter(r => r.some(Boolean));
    if (!clean.length) return { options: [], cols: [], empty: 0, dup: 0, header: false };
    const first = clean[0];
    const header = PRESET_HEADER_WORDS.includes(optKey(first[0])) || optKey(first[1]) === optKey(PRESET_HEADERS[1]);
    const body = header ? clean.slice(1) : clean;
    const width = Math.max(header ? first.length : 0, ...body.map(r => r.length));
    const cols = Array.from({ length: Math.max(0, width - 2) }, (_, i) => (header && first[i + 2]) || `ستون ${i + 1}`);
    const seen = new Set(); const options = []; let empty = 0; let dup = 0;
    body.forEach(r => {
        if (!r[0]) { empty++; return; }
        const k = optKey(r[0]); if (seen.has(k)) { dup++; return; } seen.add(k);
        const colValues = {}; cols.forEach((c, i) => { if (r[i + 2]) colValues[c] = r[i + 2]; });
        options.push({ display: r[0], print: r[1] || '', colValues });
    });
    return { options, cols, empty, dup, header };
};
const keyFromFileName = (name) => {
    const base = String(name || '').replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return base || `LIST_${Date.now().toString(36).toUpperCase()}`;
};
const downloadPresetXlsx = async (p) => {
    try { downloadBlob(await writeXlsx(presetToRows(p), { sheetName: p.title || p.preset_key }), `${safeFileName(p.title || p.preset_key || 'list')}.xlsx`); }
    catch (e) { notifyError(e, 'ساخت فایل اکسل انجام نشد.'); }
};
const MAX_PRESET_OPTIONS = 10000;
const readPresetFile = async (file) => {
    try {
        const r = rowsToPreset(await readSpreadsheet(file));
        if (r.options.length > MAX_PRESET_OPTIONS) { notify(`فایل ${r.options.length} گزینه دارد؛ هر لیست حداکثر ${MAX_PRESET_OPTIONS} گزینه می‌تواند داشته باشد.`, 'error'); return null; }
        return r;
    }
    catch (e) { notify(e.code === 'xls' ? 'فرمت قدیمی xls پشتیبانی نمی‌شود. فایل را در اکسل با «Save As» و فرمت xlsx یا CSV ذخیره کنید.' : 'فایل خوانده نشد. یک فایل اکسل (xlsx) یا CSV انتخاب کنید.', 'error'); return null; }
};

const GUIDE_SAMPLE = [{ display: 'تهران', print: 'Tehran', colValues: { 'مرکز استان': 'تهران' } }, { display: 'اصفهان', print: 'Isfahan', colValues: { 'مرکز استان': 'اصفهان' } }, { display: 'فارس', print: '', colValues: { 'مرکز استان': 'شیراز' } }];
/**
 * راهنمای ساختار فایل اکسل پیش از انتخاب فایل: نمونه‌ی جدول به شکل برگه‌ی اکسل، توضیح هر ستون، قواعد،
 * دانلود فایل نمونه و در پایین دکمه‌ی انتخاب فایل. اگر از داخل یک لیست باز شود، ستون‌های همان لیست را نشان می‌دهد.
 */
function ExcelImportGuideModal({ list, onFile, onClose }) {
    useEscape(onClose);
    const existing = !!(list && list.options && list.options.length);
    const cols = list && list.cols && list.cols.length ? list.cols : (list ? [] : ['مرکز استان']);
    const sampleOpts = existing ? list.options.slice(0, 3) : GUIDE_SAMPLE;
    const rows = presetToRows({ cols, options: sampleOpts });
    const letters = rows[0].map((_, i) => String.fromCharCode(65 + i));
    const colInfo = [
        { l: 'A', title: 'نمایش در فرم', req: true, text: 'نامی که کاربر در فهرست کشویی فرم می‌بیند، مثلاً نام استان. هر ردیف یک گزینه است و این ستون نباید خالی باشد.' },
        { l: 'B', title: 'چاپ روی کارت', req: false, text: 'اگر می‌خواهید روی کارت متن دیگری چاپ شود (مثلاً نام انگلیسی). خالی بماند، همان متن ستون A چاپ می‌شود.' },
        ...cols.map((c, i) => ({ l: String.fromCharCode(67 + i), title: c, req: false, text: 'ستون وابسته: مقداری که با انتخاب هر گزینه، در فیلدهای متصل به این لیست پر می‌شود.' })),
    ];
    if (!cols.length) colInfo.push({ l: 'C…', title: 'ستون‌های وابسته', req: false, text: 'اختیاری. عنوان هر ستون اضافه در ردیف اول، نام یک ستون وابسته‌ی جدید می‌شود.' });
    const download = () => downloadPresetXlsx({ title: list && list.title ? `${list.title} - نمونه` : 'نمونه لیست پایه', cols, options: existing ? [] : GUIDE_SAMPLE });
    const rules = [
        'ردیف اول، عنوان ستون‌ها باشد (دقیقاً مثل نمونه). اگر عنوان نگذارید، از ردیف اول به عنوان داده خوانده می‌شود و ستون‌های C به بعد «ستون ۱، ستون ۲ …» نام می‌گیرند.',
        'فقط برگه‌ی (Sheet) اول فایل خوانده می‌شود. ستون یا سلول ادغام‌شده (Merge) نداشته باشد.',
        'ردیف‌هایی که ستون A آن‌ها خالی است رد می‌شوند. نام تکراری فقط یک بار وارد می‌شود («ی/ي» و «ک/ك» یکسان حساب می‌شوند).',
        'کدهایی که با صفر شروع می‌شوند (مثل ۰۲۱): پیش از وارد کردن، قالب آن ستون را در اکسل Text کنید؛ وگرنه اکسل صفر اول را حذف می‌کند.',
        <>فرمت فایل: xlsx یا CSV (با کدگذاری <span className="latin-digits" dir="ltr">UTF-8</span>). فرمت قدیمی xls پذیرفته نمی‌شود. حداکثر {MAX_PRESET_OPTIONS.toLocaleString('en-US')} ردیف.</>,
        existing ? 'بعد از انتخاب فایل می‌پرسیم گزینه‌ها به لیست فعلی «اضافه» شوند یا لیست «جایگزین» شود. تا «ذخیره» را نزنید چیزی ثبت نمی‌شود.' : 'بعد از انتخاب فایل، گزینه‌ها در فرم ویرایش نمایش داده می‌شوند تا بررسی کنید. تا «ذخیره» را نزنید چیزی ثبت نمی‌شود.',
    ];
    // روی body رسم می‌شود: داخل پنجره‌ی شیشه‌ای (backdrop-filter) موقعیت fixed نسبت به همان پنجره حساب می‌شد و راهنما بریده می‌شد
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <div role="dialog" aria-modal="true" aria-labelledby="xl-guide-title" className="glass-strong rounded-3xl p-5 sm:p-6 w-full max-w-3xl my-8 shadow-2xl">
                <div className="flex justify-between items-start gap-3 mb-4">
                    <div><h3 id="xl-guide-title" className="text-lg font-bold text-slate-800 flex items-center gap-2"><Icon name="FileSpreadsheet" className="w-5 h-5 text-emerald-700" /> {existing ? `ورود از اکسل به «${list.title}»` : 'ساخت لیست پایه از فایل اکسل'}</h3>
                        <p className="text-sm text-slate-500 mt-1">فایل اکسل را با این ساختار آماده کنید. ساده‌ترین راه: فایل نمونه را دانلود کنید، ردیف‌های نمونه را پاک کنید و داده‌های خودتان را جایگزین کنید.</p></div>
                    <button onClick={onClose} aria-label="بستن" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full shrink-0"><Icon name="X" className="w-4 h-4" /></button>
                </div>

                <div className="rounded-xl border border-slate-300 overflow-x-auto bg-white mb-1" dir="rtl">
                    <table className="text-sm border-collapse min-w-full" aria-label="نمونه‌ی ساختار فایل اکسل">
                        <thead><tr><th className="w-10 bg-slate-100 border border-slate-300 text-[11px] text-slate-500 font-normal" aria-hidden="true"></th>{letters.map(l => <th key={l} className="bg-slate-100 border border-slate-300 text-[11px] text-slate-500 font-normal px-3 py-1 latin-digits">{l}</th>)}</tr></thead>
                        <tbody>{rows.map((r, ri) => (
                            <tr key={ri}><td className="bg-slate-100 border border-slate-300 text-[11px] text-slate-500 text-center px-2" aria-hidden="true">{ri + 1}</td>
                                {r.map((c, ci) => <td key={ci} className={`border border-slate-200 px-3 py-1.5 whitespace-nowrap ${ri === 0 ? 'font-bold bg-indigo-50 text-indigo-900' : c ? 'text-slate-700' : 'text-slate-300'}`}>{c || (ri === 0 ? '' : 'خالی')}</td>)}</tr>
                        ))}{!existing && <tr><td className="bg-slate-100 border border-slate-300 text-[11px] text-slate-400 text-center" aria-hidden="true">…</td><td colSpan={letters.length} className="border border-slate-200 px-3 py-1.5 text-xs text-slate-400">ردیف‌های بعدی: بقیه‌ی گزینه‌ها</td></tr>}</tbody>
                    </table>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">{existing ? 'سه ردیف اول لیست فعلی شما به عنوان نمونه نمایش داده شده است.' : 'ردیف ۱ (آبی) عنوان ستون‌هاست؛ از ردیف ۲ به بعد هر ردیف یک گزینه است.'}</p>

                <div className="grid sm:grid-cols-2 gap-2 mb-4">{colInfo.map(ci => (
                    <div key={ci.l} className="bg-white/70 border border-white rounded-xl p-3 flex gap-3">
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-slate-800 text-white text-sm font-bold flex items-center justify-center latin-digits">{ci.l}</span>
                        <div className="min-w-0"><p className="text-sm font-bold text-slate-800">{ci.title} <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${ci.req ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{ci.req ? 'الزامی' : 'اختیاری'}</span></p><p className="text-xs text-slate-600 mt-0.5">{ci.text}</p></div>
                    </div>
                ))}</div>
                {existing && cols.length > 0 && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 mb-4">عنوان ستون‌های وابسته در فایل باید دقیقاً همین‌ها باشد: {cols.map(c => `«${c}»`).join('، ')}. ستونی با عنوان دیگر، به‌عنوان ستون وابسته‌ی جدید اضافه می‌شود.</p>}

                <ul className="space-y-1.5 mb-5">{rules.map((r, i) => <li key={i} className="flex gap-2 text-xs text-slate-700"><Icon name="CircleCheck" className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span>{r}</span></li>)}</ul>

                <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold focus-within:ring-4 focus-within:ring-emerald-200"><Icon name="Upload" className="w-5 h-5" /> انتخاب فایل اکسل و ورود
                        <input type="file" accept=".xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) { onClose(); onFile(f); } }} /></label>
                    <button type="button" onClick={download} className="flex items-center justify-center gap-2 bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 px-5 py-3 rounded-xl font-bold"><Icon name="Download" className="w-4 h-4" /> دانلود فایل نمونه</button>
                    <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl font-bold text-slate-600 hover:bg-white/60">انصراف</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function PresetsManagerModal({ onClose }) {
    const [presets, setPresets] = useState([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState(null);
    const [pending, setPending] = useState(null); // ورود اکسل به لیستی که گزینه دارد: منتظر انتخاب «افزودن» یا «جایگزینی»
    const [guide, setGuide] = useState(null); // 'new' | 'edit': راهنمای ساختار فایل پیش از انتخاب فایل
    const fetchPresets = () => { setLoading(true); apiGet('get_presets').then(d => setPresets(Array.isArray(d) ? d : [])).catch(e => notifyError(e)).finally(() => setLoading(false)); };
    useEffect(() => { fetchPresets(); }, []);
    const handleDelete = async (id) => { if (!(await askConfirm('این مورد حذف شود؟', { danger: true, okText: 'حذف' }))) return; try { await apiPost('delete_preset', { id }); fetchPresets(); } catch (e) { notifyError(e); } };
    const handleSave = async () => {
        if (!editing.preset_key || !editing.title) return notify('شناسه و عنوان الزامی است');
        if (!editing.id && presets.some(p => p.preset_key === editing.preset_key)) return notify(`شناسه «${editing.preset_key}» قبلاً برای لیست دیگری استفاده شده است. شناسه دیگری بنویسید.`, 'error');
        try { await apiPost('save_preset', editing); setEditing(null); setPending(null); fetchPresets(); notifySuccess('لیست ذخیره شد.'); } catch (e) { notifyError(e); }
    };
    // ویرایش روی یک کپی عمیق انجام می‌شود تا «انصراف» تغییری در لیست باقی نگذارد
    const startEdit = (p) => { setPending(null); setEditing(JSON.parse(JSON.stringify({ ...p, options: p.options || [], cols: p.cols || [] }))); };
    const setOpt = (i, patch) => setEditing(ed => ({ ...ed, options: ed.options.map((o, idx) => idx === i ? { ...o, ...patch } : o) }));
    // تغییر نام ستون، مقدارهای همان ستون را در همه‌ی گزینه‌ها با خود می‌برد
    const renameCol = (i, name) => setEditing(ed => {
        const old = ed.cols[i];
        return { ...ed, cols: ed.cols.map((x, idx) => idx === i ? name : x), options: ed.options.map(o => { const cv = { ...(o.colValues || {}) }; if (old in cv) { cv[name] = cv[old]; delete cv[old]; } return { ...o, colValues: cv }; }) };
    });
    const summary = (r) => [`${r.options.length} گزینه`, r.cols.length ? `${r.cols.length} ستون وابسته` : '', r.dup ? `${r.dup} تکراری کنار گذاشته شد` : '', r.empty ? `${r.empty} ردیف بدون نام رد شد` : ''].filter(Boolean).join('، ');

    const importAsNew = async (file) => {
        const r = await readPresetFile(file); if (!r) return;
        if (!r.options.length) return notify('در فایل گزینه‌ای پیدا نشد. ستون اول باید نام گزینه‌ها باشد.', 'warning');
        startEdit({ preset_key: keyFromFileName(file.name), title: String(file.name).replace(/\.[^.]+$/, ''), options: r.options, cols: r.cols });
        notify(`از فایل خوانده شد: ${summary(r)}. شناسه و عنوان را بررسی و «ذخیره» را بزنید.`, 'success');
    };
    const importIntoEditing = async (file) => {
        const r = await readPresetFile(file); if (!r) return;
        if (!r.options.length) return notify('در فایل گزینه‌ای پیدا نشد. ستون اول باید نام گزینه‌ها باشد.', 'warning');
        if (!editing.options.length) { setEditing(ed => ({ ...ed, options: r.options, cols: [...new Set([...(ed.cols || []), ...r.cols])] })); notify(`از فایل خوانده شد: ${summary(r)}.`, 'success'); return; }
        setPending({ ...r, fileName: file.name });
    };
    const applyPending = (mode) => {
        const r = pending; setPending(null);
        setEditing(ed => {
            const cols = [...new Set([...(mode === 'append' ? ed.cols || [] : []), ...r.cols])];
            if (mode === 'replace') return { ...ed, options: r.options, cols };
            const seen = new Set(ed.options.map(o => optKey(o.display)));
            const added = r.options.filter(o => !seen.has(optKey(o.display)));
            notify(`${added.length} گزینه‌ی جدید اضافه شد${r.options.length - added.length ? `؛ ${r.options.length - added.length} گزینه از قبل در لیست بود` : ''}.`, 'success');
            return { ...ed, options: [...ed.options, ...added], cols };
        });
        if (mode === 'replace') notify(`گزینه‌های لیست با ${r.options.length} گزینه‌ی فایل جایگزین شد. برای ثبت، «ذخیره» را بزنید.`, 'success');
    };
    const guideButton = (label, mode, cls) => (
        <button type="button" onClick={() => setGuide(mode)} className={`flex items-center gap-1.5 ${cls}`}><Icon name="FileSpreadsheet" className="w-4 h-4" /> {label}</button>
    );

    return (
        <ModalShell title="مدیریت لیست‌های پایه" icon="Database" onClose={guide ? () => { } : onClose} wide>
            {guide && <ExcelImportGuideModal list={guide === 'edit' ? editing : null} onFile={guide === 'edit' ? importIntoEditing : importAsNew} onClose={() => setGuide(null)} />}
            {editing ? (
                <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold block mb-1">شناسه یکتا</label><input type="text" value={editing.preset_key} onChange={e => setEditing({ ...editing, preset_key: e.target.value.toUpperCase().replace(/\s/g, '_') })} className="w-full border rounded-xl px-3 py-2 bg-white" dir="ltr" /></div>
                        <div><label className="text-xs font-bold block mb-1">عنوان نمایشی</label><input type="text" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="w-full border rounded-xl px-3 py-2 bg-white" /></div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center bg-white border rounded-xl p-3">
                        <span className="text-xs text-slate-500 ml-auto">{editing.options.length} گزینه</span>
                        {guideButton('ورود از اکسل', 'edit', 'text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-bold')}
                        <button type="button" onClick={() => downloadPresetXlsx(editing)} disabled={!editing.options.length} className="text-xs bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-40"><Icon name="Download" className="w-4 h-4" /> خروجی اکسل</button>
                    </div>
                    {pending && (
                        <div role="alert" className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                            <p className="text-sm text-emerald-900"><b>{pending.fileName}</b>: {summary(pending)}. این لیست الان {editing.options.length} گزینه دارد. با گزینه‌های فایل چه کنم؟</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => applyPending('append')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold">افزودن گزینه‌های جدید به لیست</button>
                                <button type="button" onClick={() => applyPending('replace')} className="bg-white border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold">جایگزینی کامل لیست</button>
                                <button type="button" onClick={() => setPending(null)} className="text-slate-600 px-3 py-2 text-sm">انصراف</button>
                            </div>
                            <p className="text-[11px] text-emerald-800">در «افزودن»، گزینه‌هایی که نامشان در لیست هست تکرار نمی‌شوند. تا «ذخیره» را نزنید چیزی ثبت نمی‌شود.</p>
                        </div>
                    )}
                    <div className="border-t pt-4">
                        <div className="mb-4 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                            <h5 className="text-[10px] font-bold text-indigo-900 mb-2">تعریف ستون‌های وابسته</h5>
                            {(editing.cols || []).map((c, i) => (<div key={i} className="flex gap-1 mb-1 items-center"><input value={c} onChange={e => renameCol(i, e.target.value)} className="flex-1 text-xs border rounded px-2 py-1" aria-label={`نام ستون ${i + 1}`} /><button onClick={() => setEditing({ ...editing, cols: editing.cols.filter((_, idx) => idx !== i) })} className="text-red-500 px-1 text-xs font-bold" aria-label={`حذف ستون ${c}`}>×</button></div>))}
                            <button onClick={() => setEditing({ ...editing, cols: [...(editing.cols || []), `ستون ${(editing.cols || []).length + 1}`] })} className="text-[10px] bg-white text-indigo-700 py-1 px-3 border border-indigo-200 rounded font-bold hover:bg-indigo-50 mt-1">+ افزودن ستون</button>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-2 pr-2 custom-scrollbar">{editing.options.map((opt, i) => (
                            <div key={i} className="bg-white p-3 rounded-xl border relative">
                                <div className="flex gap-2 items-center"><span className="text-xs text-slate-400 w-6 text-center shrink-0">{i + 1}</span><input value={opt.display || ''} onChange={e => setOpt(i, { display: e.target.value })} placeholder="نمایش فرم" className="w-1/2 border rounded px-2 py-1.5 text-sm" /><input value={opt.print || ''} onChange={e => setOpt(i, { print: e.target.value })} placeholder="چاپ روی کارت" className="w-1/2 border rounded px-2 py-1.5 text-sm" /><button onClick={() => setEditing({ ...editing, options: editing.options.filter((_, idx) => idx !== i) })} className="text-red-500 p-1 hover:bg-red-50 rounded" aria-label={`حذف ${opt.display || 'گزینه'}`}><Icon name="X" className="w-4 h-4" /></button></div>
                                {(editing.cols || []).length > 0 && <div className="mt-2 pl-6 border-r-2 border-indigo-100 space-y-1">{editing.cols.map((col, ci) => (<div key={ci} className="flex items-center gap-1"><span className="text-[10px] text-slate-500 w-16 truncate">{col}:</span><input value={(opt.colValues && opt.colValues[col]) || ''} onChange={e => setOpt(i, { colValues: { ...(opt.colValues || {}), [col]: e.target.value } })} className="flex-1 text-xs border rounded px-1.5 py-1 bg-slate-50" /></div>))}</div>}
                            </div>
                        ))}</div>
                        <button onClick={() => setEditing({ ...editing, options: [...editing.options, { display: '', print: '', colValues: {} }] })} className="w-full mt-3 bg-indigo-50 text-indigo-700 font-bold py-2 rounded-xl">+ افزودن گزینه جدید</button>
                    </div>
                    <div className="flex gap-3 pt-4 border-t"><button onClick={() => { setEditing(null); setPending(null); }} className="flex-1 bg-slate-200 py-3 rounded-xl font-bold">انصراف</button><button onClick={handleSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">ذخیره</button></div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 items-center">
                        <button onClick={() => startEdit({ preset_key: '', title: '', options: [], cols: [] })} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">+ ساخت لیست جدید</button>
                        {guideButton('ساخت لیست از فایل اکسل', 'new', 'bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-700')}
                    </div>
                    <table className="w-full text-right bg-white rounded-2xl border"><thead className="bg-slate-50 border-b"><tr><th className="p-4">عنوان</th><th className="p-4" dir="ltr">Key</th><th className="p-4 text-center">گزینه‌ها</th><th className="p-4 text-center">عملیات</th></tr></thead>
                        <tbody className="divide-y">{loading ? <tr><td colSpan="4" className="text-center p-8">بارگذاری...</td></tr> : presets.length === 0 ? <tr><td colSpan="4" className="text-center p-8 text-slate-400">هنوز لیستی ساخته نشده است.</td></tr> : presets.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50"><td className="p-4 font-bold">{p.title}</td><td className="p-4 font-mono text-sm text-slate-500" dir="ltr">{p.preset_key}</td><td className="p-4 text-center">{(p.options && p.options.length) || 0}</td>
                                <td className="p-4 flex justify-center gap-2"><button onClick={() => startEdit(p)} className="bg-slate-100 p-2 rounded text-indigo-600" aria-label={`ویرایش ${p.title}`} title="ویرایش"><Icon name="Edit2" className="w-4 h-4" /></button><button onClick={() => downloadPresetXlsx(p)} className="bg-slate-100 p-2 rounded text-emerald-700" aria-label={`خروجی اکسل ${p.title}`} title="خروجی اکسل"><Icon name="FileDown" className="w-4 h-4" /></button><button onClick={() => handleDelete(p.id)} className="bg-slate-100 p-2 rounded text-red-600" aria-label={`حذف ${p.title}`} title="حذف"><Icon name="Trash2" className="w-4 h-4" /></button></td></tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </ModalShell>
    );
}

function FontsManagerModal({ onClose, fetchGlobalFonts }) {
    const [fonts, setFonts] = useState([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState(null); const [uploadingFile, setUploadingFile] = useState(false);
    const fetchList = () => { setLoading(true); apiGet('get_fonts').then(d => setFonts(Array.isArray(d) ? d : [])).catch(e => notifyError(e)).finally(() => setLoading(false)); };
    useEffect(() => { fetchList(); }, []);
    const handleDelete = async (id) => { if (!(await askConfirm('این مورد حذف شود؟', { danger: true, okText: 'حذف' }))) return; try { await apiPost('delete_font', { id }); fetchList(); fetchGlobalFonts(); } catch (e) { notifyError(e); } };
    const handleSave = async () => { if (!editing.font_key || !editing.font_name || !editing.font_url) return notify('همه‌ی موارد الزامی است'); try { await apiPost('save_font', editing); setEditing(null); fetchList(); fetchGlobalFonts(); } catch (e) { notifyError(e); } };
    const handleFileUpload = async (e) => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; if (file.size > 10 * 1024 * 1024) return notify('حجم فایل نباید بیشتر از 10 مگابایت باشد'); setUploadingFile(true); try { const r = await apiPost('upload_font', { file: await readFileAsDataURL(file) }); setEditing(ed => ({ ...ed, font_url: r.url })); } catch (err) { notifyError(err, 'خطا در آپلود'); } setUploadingFile(false); };
    return (
        <ModalShell title="کتابخانه مرکزی فونت‌ها" icon="Type" onClose={onClose}>
            {editing ? (<div className="space-y-4 bg-slate-50 p-6 rounded-2xl border"><div><label className="text-xs font-bold block mb-1">شناسه یکتا</label><input type="text" value={editing.font_key} onChange={e => setEditing({ ...editing, font_key: e.target.value.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_\-]/g, '') })} className="w-full border rounded-xl px-3 py-2" dir="ltr" placeholder="yekan_bakh" /></div><div><label className="text-xs font-bold block mb-1">نام خانواده فونت (Font Family)</label><input type="text" value={editing.font_name} onChange={e => setEditing({ ...editing, font_name: e.target.value.replace(/["'`;\\]/g, '') })} className="w-full border rounded-xl px-3 py-2" dir="ltr" placeholder="YekanBakh" /></div><div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-col items-center justify-center"><label className="text-xs font-bold text-indigo-900 mb-2">آپلود فایل فونت روی هاست (TTF/OTF/WOFF/WOFF2)</label>{uploadingFile ? <span className="text-sm font-bold text-indigo-600 animate-pulse">در حال آپلود، لطفا صبر کنید...</span> : <label className="bg-white px-4 py-2 border border-indigo-200 text-indigo-700 rounded-xl cursor-pointer hover:bg-indigo-100 font-bold text-sm shadow-sm"><Icon name="UploadCloud" className="inline-block w-4 h-4 ml-1" /> انتخاب فایل<input type="file" className="hidden" accept=".ttf,.otf,.woff,.woff2" onChange={handleFileUpload} /></label>}{editing.font_url && <span className="text-[10px] text-green-600 mt-2 font-mono truncate w-full text-center" dir="ltr">{editing.font_url}</span>}</div><div className="flex gap-3 pt-4 border-t"><button onClick={() => setEditing(null)} className="flex-1 bg-slate-200 py-3 rounded-xl font-bold">انصراف</button><button onClick={handleSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">ذخیره</button></div></div>) :
                (<div className="space-y-4"><button onClick={() => setEditing({ font_key: '', font_name: '', font_url: '' })} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">+ افزودن فونت جدید</button><table className="w-full text-right bg-white rounded-2xl border"><thead className="bg-slate-50 border-b"><tr><th className="p-4">نام فونت</th><th className="p-4 text-center">عملیات</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan="2" className="text-center p-8">بارگذاری...</td></tr> : fonts.map(f => (<tr key={f.id} className="hover:bg-slate-50"><td className="p-4 font-bold" dir="ltr"><span className="font-preview text-lg" style={{ '--preview-font': `"${f.font_name}"` }}>{f.font_name} — نمونه متن ۱۲۳</span> <span className="text-xs text-slate-400">({f.font_key})</span></td><td className="p-4 flex justify-center gap-2"><button onClick={() => setEditing({ ...f })} className="bg-slate-100 p-2 rounded text-indigo-600"><Icon name="Edit2" className="w-4 h-4" /></button><button onClick={() => handleDelete(f.id)} className="bg-slate-100 p-2 rounded text-red-600"><Icon name="Trash2" className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>)}
        </ModalShell>
    )
}

function ValidationsManagerModal({ onClose, fetchGlobalValidations }) {
    const [rules, setRules] = useState([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState(null);
    const fetchList = () => { setLoading(true); apiGet('get_validations').then(d => setRules(Array.isArray(d) ? d : [])).catch(e => notifyError(e)).finally(() => setLoading(false)); };
    useEffect(() => { fetchList(); }, []);
    const handleDelete = async (id) => { if (!(await askConfirm('این مورد حذف شود؟', { danger: true, okText: 'حذف' }))) return; try { await apiPost('delete_validation', { id }); fetchList(); fetchGlobalValidations(); } catch (e) { notifyError(e); } };
    const handleSave = async () => { if (!editing.title || !editing.pattern) return notify('عنوان و الگو الزامی است'); try { new RegExp(editing.pattern); } catch (e) { return notify('الگوی Regex نامعتبر است'); } try { await apiPost('save_validation', editing); setEditing(null); fetchList(); fetchGlobalValidations(); } catch (e) { notifyError(e); } };
    return (
        <ModalShell title="موتور اعتبارسنجی پویا (Regex)" icon="CheckCircle2" onClose={onClose}>
            {editing ? (<div className="space-y-4 bg-slate-50 p-6 rounded-2xl border"><div><label className="text-xs font-bold block mb-1">عنوان الگو (مثلا: فقط موبایل همراه اول)</label><input type="text" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="w-full border rounded-xl px-3 py-2" /></div><div><label className="text-xs font-bold block mb-1">الگوی Regex</label><input type="text" value={editing.pattern} onChange={e => setEditing({ ...editing, pattern: e.target.value })} className="w-full border rounded-xl px-3 py-2 font-mono text-left" dir="ltr" placeholder="^091\d{8}$" /></div><div><label className="text-xs font-bold block mb-1">پیام خطای نمایشی به کاربر</label><input type="text" value={editing.error_msg} onChange={e => setEditing({ ...editing, error_msg: e.target.value })} className="w-full border rounded-xl px-3 py-2" placeholder="شماره موبایل باید با 091 شروع شود..." /></div><div className="flex gap-3 pt-4 border-t"><button onClick={() => setEditing(null)} className="flex-1 bg-slate-200 py-3 rounded-xl font-bold">انصراف</button><button onClick={handleSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">ذخیره الگو</button></div></div>) :
                (<div className="space-y-4"><button onClick={() => setEditing({ title: '', pattern: '', error_msg: '' })} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">+ ساخت الگوی جدید</button><table className="w-full text-right bg-white rounded-2xl border"><thead className="bg-slate-50 border-b"><tr><th className="p-4">عنوان الگو</th><th className="p-4 text-center">عملیات</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan="2" className="text-center p-8">بارگذاری...</td></tr> : rules.map(f => (<tr key={f.id} className="hover:bg-slate-50"><td className="p-4 font-bold">{f.title} <br /><span className="text-[10px] text-slate-400 font-mono" dir="ltr">{f.pattern}</span></td><td className="p-4 flex justify-center gap-2"><button onClick={() => setEditing({ ...f })} className="bg-slate-100 p-2 rounded text-indigo-600"><Icon name="Edit2" className="w-4 h-4" /></button><button onClick={() => handleDelete(f.id)} className="bg-slate-100 p-2 rounded text-red-600"><Icon name="Trash2" className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>)}
        </ModalShell>
    )
}

function AdminCardEditModal({ tenant, card, onClose, onSave, t, globalValidations }) {
    const [formData, setFormData] = useState(card.cardData || {}); const [requesterName, setRequesterName] = useState(card.requesterName || ''); const [isSubmitting, setIsSubmitting] = useState(false); const [inputWarnings, setInputWarnings] = useState({});
    const { handlePhotoUpload, cropModal } = usePhotoCrop(setFormData);
    useEscape(onClose);
    const [customSelects, setCustomSelects] = useState(() => { const init = {}; (tenant.fields || []).filter(f => f.type === 'select' && f.hasOtherOption).forEach(f => { const v = (card.cardData || {})[f.id]; if (v && !(f.options || []).find(o => o.display === v)) init[f.id] = true; }); return init; });
    const visibleFields = getVisibleFields(tenant.fields, tenant);
    const hasErrors = formHasErrors(visibleFields, formData, t, globalValidations);
    const [showMissing, setShowMissing] = useState(false);
    const save = async () => {
        if (!requesterName.trim()) { setShowMissing(true); notify(t('req_name_empty')); return focusField('_requester'); }
        const bad = findFirstInvalid(visibleFields, formData, t, globalValidations);
        if (bad) { setShowMissing(true); notify(bad.message); return focusField(bad.field.id); }
        setIsSubmitting(true);
        const fontsLoaded = await ensureFonts(collectFontFamilies(tenant), tenant.customFonts);
        const finalCardData = { ...formData, _fontError: !fontsLoaded };
        try { const result = await apiPost('update_card', { id: card.id, requesterName, cardData: finalCardData }); onSave({ ...card, requesterName, cardData: result.cardData || finalCardData }); }
        catch (e) { notifyError(e, t('error_server')); if (e.field) { setShowMissing(true); focusField(e.field); } }
        setIsSubmitting(false);
    };
    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            {cropModal(t)}
            <div role="dialog" aria-modal="true" aria-label={t('edit_info')} className="glass-strong rounded-3xl p-6 md:p-8 w-full max-w-2xl my-8 relative">
                <div className="flex justify-between items-center border-b pb-4 mb-6"><h3 className="text-xl font-bold flex items-center gap-2"><Icon name="Edit2" /> {t('edit_info')}</h3><button aria-label="بستن" onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-5 h-5" /></button></div>
                <div className="space-y-6"><div id="fieldwrap-_requester"><label className="block text-sm font-bold text-indigo-900 mb-2">{t('requester_name')}</label><input type="text" value={requesterName} onChange={e => setRequesterName(e.target.value)} className="w-full border rounded-xl px-4 py-2.5 bg-indigo-50/30" /></div>
                    <SharedFieldsRenderer formData={formData} setFormData={setFormData} inputWarnings={inputWarnings} setInputWarnings={setInputWarnings} handlePhotoUpload={handlePhotoUpload} visibleFields={visibleFields} customSelects={customSelects} setCustomSelects={setCustomSelects} t={t} globalValidations={globalValidations} showMissing={showMissing} />
                    <div className="flex gap-4 pt-6 border-t mt-6"><button onClick={onClose} className="flex-1 py-3 bg-slate-100 font-bold rounded-xl">{t('cancel')}</button><button onClick={save} disabled={isSubmitting} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-50">{isSubmitting ? t('saving') : t('save_changes')}</button></div>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// 6. MAIN SCREENS & APP
// ==========================================
function SystemEntry({ mode, tenant, t, langControl, onSuperAdmin, onTenantLogin }) {
    const plat = usePlatform();
    const [passcode, setPasscode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    // قفل موقت پس از تلاش‌های ناموفق: شمارش معکوس تا امکان ورود دوباره
    const [lockUntil, setLockUntil] = useState(0); const [now, setNow] = useState(Date.now());
    useEffect(() => { if (lockUntil <= Date.now()) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [lockUntil]);
    const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000));
    const fmtLeft = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    // رمز فقط در سرور بررسی می‌شود؛ هیچ رمزی در کد کلاینت وجود ندارد.
    const handleLogin = async (e) => {
        e.preventDefault(); if (!passcode || busy || lockLeft > 0) return; setBusy(true); setError('');
        try {
            if (mode === 'SUPER_ADMIN_PORTAL') { await apiPost('login_super', { passcode }); onSuperAdmin(); }
            else { const r = await apiPost('login_tenant', { orgId: tenant.id, passcode }); onTenantLogin(r.role, r.tenant); }
        } catch (err) {
            if (err.status === 429 && err.retryAfter) { setLockUntil(Date.now() + err.retryAfter * 1000); setNow(Date.now()); }
            else setError(err.status === 401 ? t('invalid_passcode') : err.message);
            setBusy(false);
        }
    };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4"><div className="glass-strong p-8 rounded-3xl w-full max-w-md relative overflow-hidden flex flex-col"><div className="relative z-10 flex-1 flex flex-col"><div className="flex justify-between items-center text-slate-600 mb-2"><ThemeToggle t={t} compact />{langControl && <LanguageSwitcher control={langControl} />}</div><div className="flex justify-center mb-6"><LogoImg src={tenant && tenant.logoUrl} alt="Logo" className="h-20 object-contain drop-shadow-2xl rounded-xl" /></div>{tenant && tenant.closedReason && <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm text-center">{tenant.closedReason}</div>}<h1 className="text-2xl font-bold text-center text-slate-800 mb-2">{tenant ? tenant.orgName : plat.name}</h1><p className="text-center text-slate-600 mb-8 text-sm">{tenant ? (tenant.welcomeText || t('enter_passcode')) : t('enter_passcode')}</p><form onSubmit={handleLogin} className="space-y-4 mb-4"><div><input type="password" aria-label={t('passcode')} value={passcode} onChange={(e) => { setPasscode(e.target.value); setError(''); }} autoComplete="current-password" className="w-full px-4 py-3 bg-white/70 border border-white rounded-xl text-slate-800 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={t('passcode')} autoFocus /></div>{error && <p role="alert" className="text-red-600 text-sm text-center">{error}</p>}{lockLeft > 0 && <p role="status" className="text-amber-700 text-sm text-center font-bold">{t('locked_wait', fmtLeft(lockLeft))}</p>}<button type="submit" disabled={busy || !passcode || lockLeft > 0} className="w-full btn-grad py-3 rounded-xl font-bold transition-all">{busy ? t('processing') : t('login')}</button></form><div className="mt-auto pt-6 border-t border-white/60"><BrandingFooter /></div></div></div></div>
    );
}

/** کپی متن در کلیپ‌بورد (با روش جایگزین برای مرورگرهای قدیمی/غیر HTTPS). */
const copyText = async (text, okMsg = 'کپی شد.') => {
    try { await navigator.clipboard.writeText(text); notifySuccess(okMsg); return; } catch (e) { }
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); notifySuccess(okMsg); } catch (e) { notify('کپی خودکار ممکن نشد؛ لینک را دستی کپی کنید.', 'warning'); }
    document.body.removeChild(ta);
};


/** لینک سازمان: کپی، QR برای پخش بین کارمندان، باز کردن. */
function TenantLinkModal({ tenant, justPublished, onClose }) {
    const rewriteOk = useRewriteOk(); const link = tenantLinkFor(tenant, rewriteOk); const canvasRef = useRef(null);
    useEffect(() => { if (window.QRious && canvasRef.current) new window.QRious({ element: canvasRef.current, value: link, size: 260, level: 'M' }); }, [link]);
    const downloadQr = () => { try { const a = document.createElement('a'); a.download = `QR-${tenant.orgName || tenant.id}.png`; a.href = canvasRef.current.toDataURL('image/png'); a.click(); } catch (e) { notifyError(e); } };
    return (
        <ModalShell title={justPublished ? 'سامانه آماده‌ی استفاده است' : `لینک «${tenant.orgName}»`} icon="Link" onClose={onClose}>
            <div className="flex flex-col items-center gap-4 text-center">
                {justPublished && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 w-full">سازمان «{tenant.orgName}» ذخیره و منتشر شد. لینک زیر را برای کاربران بفرستید.</p>}
                <div className="flex w-full gap-2"><input readOnly value={link} onFocus={e => e.target.select()} aria-label="لینک سازمان" className="flex-1 border rounded-xl px-3 py-2 text-sm bg-slate-50 font-mono" dir="ltr" /><button type="button" onClick={() => copyText(link, 'لینک کپی شد.')} className="bg-indigo-600 text-white px-4 rounded-xl font-bold text-sm flex items-center gap-1"><Icon name="Copy" className="w-4 h-4" /> کپی</button></div>
                {!tenant.slug && <p className="text-xs text-slate-500">برای لینک خوانا (مثلاً <span dir="ltr">…/{'acme'}</span>)، در ویرایش سازمان «آدرس اختصاصی» تعیین کنید.</p>}
                <canvas ref={canvasRef} role="img" aria-label="QR لینک سازمان" className="border rounded-xl p-2 bg-white" />
                <div className="flex gap-2 flex-wrap justify-center"><button type="button" onClick={downloadQr} className="bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1"><Icon name="Download" className="w-4 h-4" /> دانلود QR</button><a href={link} target="_blank" rel="noopener" className="bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1"><Icon name="ExternalLink" className="w-4 h-4" /> باز کردن</a></div>
            </div>
        </ModalShell>
    );
}

const AUDIT_ACTIONS = ['login', 'login_failed', 'super_login', 'super_login_failed', 'super_password_changed', 'super_password_failed', 'platform_settings', 'tenant_create', 'tenant_update', 'tenant_delete', 'tenant_active', 'passwords_change', 'card_create', 'card_update', 'card_delete', 'cards_bulk_delete', 'card_status'];
const auditDetails = (r, t) => {
    const d = r.details || {}; const parts = [];
    if (d.requester) parts.push(`${t('requester')}: ${d.requester}`);
    if (d.orgName) parts.push(d.orgName);
    if (d.role) parts.push(d.role === 'ADMIN' ? t('actor_admin') : t('actor_user'));
    if (d.count !== undefined) parts.push(`${d.count}`);
    if (d.revoked !== undefined) parts.push(d.revoked ? t('status_revoked') : t('status_active'));
    if (d.expiresAt) parts.push(`${t('expires_at')}: ${d.expiresAt}`);
    if (d.isActive !== undefined) parts.push(d.isActive ? 'فعال' : 'غیرفعال');
    return parts.join(' — ');
};
/** گزارش فعالیت (چه کسی، چه زمانی، چه کاری). tenantId خالی = همه‌ی سازمان‌ها (فقط سوپرادمین). */
function AuditLogModal({ tenantId, title, t, lang = 'fa', onClose }) {
    const [rows, setRows] = useState(null); const [filter, setFilter] = useState('');
    useEffect(() => { apiGet('get_audit_log', { tenant_id: tenantId || '', limit: 300 }).then(d => setRows(Array.isArray(d) ? d : [])).catch(e => { notifyError(e); setRows([]); }); }, [tenantId]);
    const shown = (rows || []).filter(r => !filter || r.action === filter);
    return (
        <ModalShell title={title || t('activity_log')} icon="ScrollText" onClose={onClose} wide>
            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap"><select value={filter} onChange={e => setFilter(e.target.value)} aria-label={t('filter')} className="border rounded-lg px-2 py-1.5 text-sm"><option value="">{t('all_actions')}</option>{AUDIT_ACTIONS.map(a => <option key={a} value={a}>{t(`audit_${a}`)}</option>)}</select><span className="text-xs text-slate-500">{shown.length}</span></div>
            {rows === null ? <p className="text-center p-8 text-slate-500">{t('loading')}</p> : (
                <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm text-right"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">{t('time')}</th><th className="p-2">{t('actor')}</th><th className="p-2">{t('action')}</th><th className="p-2">{t('details')}</th><th className="p-2">IP</th></tr></thead>
                    <tbody className="divide-y">{shown.length === 0 ? <tr><td colSpan="5" className="p-6 text-center text-slate-400">{t('no_records')}</td></tr> : shown.map(r => (
                        <tr key={r.id} className={r.action.endsWith('failed') ? 'bg-red-50/40' : ''}><td className="p-2 whitespace-nowrap text-xs" dir="auto">{formatDateTime(r.created_at, lang)}</td><td className="p-2 text-xs">{t(`actor_${r.actor}`)}</td><td className="p-2 font-bold text-xs">{t(`audit_${r.action}`)}{!tenantId && r.tenant_id ? <span className="block font-mono font-normal text-[10px] text-slate-400" dir="ltr">{r.tenant_id}</span> : null}</td><td className="p-2 text-xs text-slate-600">{auditDetails(r, t)}{r.target && r.target !== r.tenant_id ? <span className="block font-mono text-[10px] text-slate-400" dir="ltr">{r.target}</span> : null}</td><td className="p-2 text-[10px] font-mono text-slate-400" dir="ltr">{r.ip}</td></tr>
                    ))}</tbody></table></div>
            )}
        </ModalShell>
    );
}

const tenantStatus = (tn) => !tn.closedReason ? ['فعال', 'bg-green-50 text-green-700'] : (tn.isActive === false ? ['غیرفعال', 'bg-red-50 text-red-700'] : ['پایان مهلت', 'bg-amber-50 text-amber-700']);

/** آپلود یا لینک یک تصویر (لوگو، آیکون تب) با پیش‌نمایش. */
function ImageSettingField({ id, label, hint, value, onChange, error, maxSize = 512, previewClass = 'w-20 h-20' }) {
    const [uploading, setUploading] = useState(false);
    const upload = async (file) => { if (!file) return; setUploading(true); const url = await uploadImageFile(file, { keepTransparency: true, maxSize }); setUploading(false); if (url) onChange(url); };
    return (
        <div>
            <label htmlFor={id} className="text-sm font-bold block mb-1">{label}</label>
            {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
            <div className="flex items-center gap-3">
                <div className={`${previewClass} shrink-0 rounded-2xl bg-white/80 border flex items-center justify-center p-2`}><LogoImg key={value} src={value.trim()} usePlatform={false} alt={`پیش‌نمایش ${label}`} className="max-w-full max-h-full object-contain" /></div>
                <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex gap-2">
                        <label className={`flex items-center justify-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer shrink-0 ${uploading ? 'opacity-50 animate-pulse pointer-events-none' : ''}`}><Icon name="UploadCloud" className="w-4 h-4" /> {uploading ? 'در حال آپلود…' : 'آپلود'}<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; e.target.value = ''; upload(f); }} /></label>
                        <input id={id} dir="ltr" value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." className="w-full min-w-0 border rounded-xl px-3 py-2 text-sm text-left bg-white/80" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
                    </div>
                    {value && <button type="button" onClick={() => onChange('')} className="text-xs text-slate-500 hover:text-red-600 underline">بازگشت به پیش‌فرض</button>}
                </div>
            </div>
            {error && <p id={`${id}-err`} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
    );
}

/** فرم تغییر رمز سوپرادمین (رمز فعلی + رمز جدید دو بار). */
function SuperPasswordForm() {
    const [f, setF] = useState({ currentPass: '', newPass: '', repeat: '' }); const [err, setErr] = useState({}); const [busy, setBusy] = useState(false);
    const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setErr({}); };
    const strength = f.newPass.length === 0 ? '' : f.newPass.length < 10 ? 'کوتاه' : (/[a-z]/.test(f.newPass) + /[A-Z]/.test(f.newPass) + /\d/.test(f.newPass) + /[^A-Za-z0-9]/.test(f.newPass) >= 3 && f.newPass.length >= 12 ? 'قوی' : 'متوسط');
    const submit = async (e) => {
        e.preventDefault();
        if (f.newPass.length < 10) return setErr({ newPass: 'رمز جدید باید حداقل ۱۰ کاراکتر باشد.' });
        if (f.newPass !== f.repeat) return setErr({ repeat: 'تکرار رمز با رمز جدید یکی نیست.' });
        setBusy(true);
        try { await apiPost('change_super_password', { currentPass: f.currentPass, newPass: f.newPass }); setF({ currentPass: '', newPass: '', repeat: '' }); notifySuccess('رمز سوپرادمین تغییر کرد. از این به بعد با رمز جدید وارد شوید.'); }
        catch (e2) { setErr({ [e2.field || 'currentPass']: e2.message }); }
        setBusy(false);
    };
    const input = (k, label, ac) => (
        <div>
            <label htmlFor={`sp-${k}`} className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
            <input id={`sp-${k}`} type="password" autoComplete={ac} dir="ltr" value={f[k]} onChange={e => set(k, e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm bg-white/80" aria-invalid={!!err[k]} aria-describedby={err[k] ? `sp-${k}-err` : undefined} />
            {err[k] && <p id={`sp-${k}-err`} role="alert" className="text-xs text-red-600 mt-1">{err[k]}</p>}
        </div>
    );
    return (
        <form onSubmit={submit} className="space-y-3 bg-white/50 border border-white/70 rounded-xl p-4">
            <label className="text-sm font-bold block">تغییر رمز سوپرادمین</label>
            {input('currentPass', 'رمز فعلی', 'current-password')}
            {input('newPass', 'رمز جدید (حداقل ۱۰ کاراکتر)', 'new-password')}
            {strength && <p className={`text-[11px] -mt-2 ${strength === 'قوی' ? 'text-green-700' : strength === 'متوسط' ? 'text-amber-700' : 'text-red-600'}`}>قدرت رمز: {strength}</p>}
            {input('repeat', 'تکرار رمز جدید', 'new-password')}
            <p className="text-[10px] text-slate-500">بعد از تغییر از اینجا، رمز فایل config.php دیگر استفاده نمی‌شود. اگر رمز را فراموش کردید، در phpMyAdmin ردیف superPassHash را از جدول platform_settings پاک کنید تا رمز config.php دوباره فعال شود.</p>
            <button type="submit" disabled={busy || !f.currentPass || !f.newPass || !f.repeat} className="w-full bg-slate-800 text-white py-2 rounded-xl text-sm font-bold disabled:opacity-50">{busy ? 'در حال تغییر…' : 'تغییر رمز'}</button>
        </form>
    );
}

/** تنظیمات کلی پلتفرم: هویت و ظاهر (نام، لوگو، آیکون تب، فوتر، رنگ‌ها) و امنیت (رمز، خروج خودکار، قفل ورود). */
function PlatformSettingsModal({ onClose }) {
    useEscape(onClose);
    const current = usePlatform();
    const [tab, setTab] = useState('identity');
    const [d, setD] = useState(() => ({ ...current, footer: { ...current.footer } }));
    const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false);
    const set = (k, v) => { setD(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };
    const setFooter = (k, v) => { setD(p => ({ ...p, footer: { ...p.footer, [k]: v } })); setErrors(e => ({ ...e, [`footer.${k}`]: undefined })); };
    const themeProxy = (k) => ({ data: { theme: d[k] }, setData: (fn) => setD(p => ({ ...p, [k]: (typeof fn === 'function' ? fn({ theme: p[k] }) : fn).theme })) });
    const save = async () => {
        setSaving(true); setErrors({});
        const payload = { name: d.name, logoUrl: d.logoUrl.trim(), faviconUrl: d.faviconUrl.trim(), footer: d.footer, defaultTheme: d.defaultTheme, superTheme: d.superTheme, idleMinutes: Number(d.idleMinutes), loginMaxAttempts: Number(d.loginMaxAttempts), loginLockMinutes: Number(d.loginLockMinutes) };
        try { const r = await apiPost('save_platform_settings', payload); setPlatform(r.platform); notifySuccess('تنظیمات پلتفرم ذخیره شد.'); onClose(); }
        catch (e) {
            if (e.field) { setErrors({ [e.field]: e.message }); setTab(['idleMinutes', 'loginMaxAttempts', 'loginLockMinutes'].includes(e.field) ? 'security' : 'identity'); }
            else notifyError(e);
        }
        setSaving(false);
    };
    const err = (k) => errors[k] && <p role="alert" className="text-xs text-red-600 mt-1">{errors[k]}</p>;
    const text = (k, label, opts = {}) => (
        <div>
            <label htmlFor={`ps-${k}`} className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
            <input id={`ps-${k}`} value={opts.value !== undefined ? opts.value : d[k]} onChange={e => (opts.onChange || (v => set(k, v)))(e.target.value)} dir={opts.dir || 'auto'} maxLength={opts.maxLength} placeholder={opts.placeholder} disabled={opts.disabled} className="w-full border rounded-xl px-3 py-2 text-sm bg-white/80 disabled:opacity-50" />
            {err(opts.errKey || k)}
        </div>
    );
    const num = (k, label, min, max, hint) => (
        <div>
            <label htmlFor={`ps-${k}`} className="text-sm font-bold block mb-1">{label}</label>
            <div className="flex items-center gap-2"><input id={`ps-${k}`} type="number" min={min} max={max} value={d[k]} onChange={e => set(k, e.target.value)} className="w-28 border rounded-xl px-3 py-2 text-sm text-center bg-white/80" dir="ltr" aria-invalid={!!errors[k]} />{hint && <span className="text-xs text-slate-500">{hint}</span>}</div>
            {err(k)}
        </div>
    );
    const tabBtn = (k, ic, label) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-slate-600"><Icon name={ic} className="w-4 h-4" /> {label}</button>;
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <div role="dialog" aria-modal="true" aria-label="تنظیمات پلتفرم" className="glass-strong rounded-3xl p-5 sm:p-6 w-full max-w-2xl my-8">
                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Icon name="Settings" className="w-5 h-5" /> تنظیمات پلتفرم</h3><button onClick={onClose} aria-label="بستن" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-4 h-4" /></button></div>
                <div role="tablist" aria-label="بخش‌های تنظیمات" className="view-toggle flex bg-slate-100/80 rounded-xl p-1 mb-5">{tabBtn('identity', 'Palette', 'هویت و ظاهر')}{tabBtn('security', 'ShieldCheck', 'امنیت')}</div>

                {tab === 'identity' && <div className="space-y-5" role="tabpanel">
                    <div>{text('name', 'نام پلتفرم', { maxLength: 80 })}<p className="text-[11px] text-slate-500 mt-1">در عنوان تب مرورگر، صفحه ورود سوپرادمین و سربرگ پنل نمایش داده می‌شود.</p></div>
                    <ImageSettingField id="ps-logo" label="لوگوی پلتفرم" hint="در سربرگ پنل سوپرادمین و صفحه ورود، و برای سازمان‌هایی که لوگوی خودشان را ندارند. تصویر مربع با پس‌زمینه شفاف (PNG) بهترین نتیجه را دارد." value={d.logoUrl} onChange={v => set('logoUrl', v)} error={errors.logoUrl} />
                    <ImageSettingField id="ps-favicon" label="آیکون تب مرورگر (favicon)" hint="تصویر مربع ساده، ترجیحاً PNG حداقل ۶۴×۶۴. اگر خالی بماند، لوگوی پیش‌فرض سامانه استفاده می‌شود." value={d.faviconUrl} onChange={v => set('faviconUrl', v)} error={errors.faviconUrl} maxSize={256} previewClass="w-14 h-14" />
                    <div className="space-y-3 bg-white/50 border border-white/70 rounded-xl p-4">
                        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={d.footer.show} onChange={e => setFooter('show', e.target.checked)} className="accent-indigo-600 w-4 h-4" /> نمایش فوتر در پایین صفحه‌ها</label>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {text('line1', 'خط اول', { value: d.footer.line1, onChange: v => setFooter('line1', v), maxLength: 120, disabled: !d.footer.show, errKey: 'footer.line1' })}
                            {text('line2', 'خط دوم', { value: d.footer.line2, onChange: v => setFooter('line2', v), maxLength: 120, disabled: !d.footer.show, errKey: 'footer.line2' })}
                            {text('phone', 'تلفن (اختیاری)', { value: d.footer.phone, onChange: v => setFooter('phone', v), maxLength: 30, dir: 'ltr', disabled: !d.footer.show, errKey: 'footer.phone' })}
                            {text('link', 'لینک تلفن (اختیاری)', { value: d.footer.link, onChange: v => setFooter('link', v), maxLength: 500, dir: 'ltr', placeholder: 'https://t.me/...', disabled: !d.footer.show, errKey: 'footer.link' })}
                        </div>
                        {d.footer.show && <div className="rounded-xl border border-dashed border-slate-300 bg-white/40"><p className="text-[10px] text-slate-500 pt-2 text-center">پیش‌نمایش</p><BrandingFooter preview={d.footer} /></div>}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <ThemeEditor {...themeProxy('superTheme')} title="رنگ‌های پنل سوپرادمین" hint="پس‌زمینه پنل سوپرادمین و صفحه ورود آن." />
                        <ThemeEditor {...themeProxy('defaultTheme')} title="رنگ پیش‌فرض سازمان‌های جدید" hint="سازمان‌هایی که از این به بعد ساخته می‌شوند با این رنگ‌ها شروع می‌کنند. رنگ سازمان‌های فعلی تغییر نمی‌کند." />
                    </div>
                </div>}

                {tab === 'security' && <div className="space-y-5" role="tabpanel">
                    <SuperPasswordForm />
                    <div className="space-y-4 bg-white/50 border border-white/70 rounded-xl p-4">
                        {num('idleMinutes', 'خروج خودکار پس از بی‌کاری', 0, 1440, 'دقیقه (۰ = خاموش)')}
                        <p className="text-[11px] text-slate-500 -mt-2">برای همه پنل‌ها (سوپرادمین، مدیر سازمان و کاربر). یک دقیقه قبل از خروج هشدار داده می‌شود و پیش‌نویس ویزارد حفظ می‌شود.</p>
                        {num('loginMaxAttempts', 'تعداد ورود ناموفق مجاز', 3, 20, 'بار')}
                        {num('loginLockMinutes', 'مدت قفل ورود پس از آن', 1, 1440, 'دقیقه')}
                        <p className="text-[11px] text-slate-500 -mt-2">برای هر IP و هر صفحه ورود جداگانه حساب می‌شود.</p>
                    </div>
                </div>}

                <div className="flex gap-2 mt-6"><button type="button" onClick={save} disabled={saving} className="flex-1 btn-grad text-white py-2.5 rounded-xl font-bold">{saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}</button><button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold bg-white/70 border">انصراف</button></div>
                {tab === 'security' && <p className="text-[10px] text-slate-500 mt-2 text-center">دکمه «ذخیره تنظیمات» برای خروج خودکار و قفل ورود است؛ تغییر رمز دکمه جداگانه دارد.</p>}
            </div>
        </div>
    );
}

function SuperAdminPanel({ tenants, t, fetchGlobalFonts, fetchGlobalValidations, onNewWizard, onEditWizard, onDuplicateWizard, onDeleteWizard, onRefresh, onLogout, publishedId, onPublishedSeen }) {
    const validTenants = Array.isArray(tenants) ? tenants : []; const plat = usePlatform();
    const [showPresetsManager, setShowPresetsManager] = useState(false); const [showFontsManager, setShowFontsManager] = useState(false); const [showValidationsManager, setShowValidationsManager] = useState(false); const [showPlatformSettings, setShowPlatformSettings] = useState(false);
    const rewriteOk = useRewriteOk();
    const [search, setSearch] = useState(''); const [sortBy, setSortBy] = useState('created'); const [linkFor, setLinkFor] = useState(null); const [auditFor, setAuditFor] = useState(null);
    useEffect(() => { if (publishedId) { const tn = validTenants.find(x => x.id === publishedId); if (tn) { setLinkFor({ tenant: tn, justPublished: true }); onPublishedSeen(); } } }, [publishedId, validTenants]);
    const passBadge = (isSet) => isSet ? <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold">✓ {t('pass_is_set')}</span> : <span className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs font-bold">—</span>;
    const q = normalizeFa(search.trim().toLowerCase());
    const shown = validTenants.filter(tn => !q || normalizeFa(`${tn.orgName} ${tn.id} ${tn.slug || ''}`.toLowerCase()).includes(q)).sort((a, b) => {
        if (sortBy === 'name') return String(a.orgName).localeCompare(String(b.orgName), 'fa');
        if (sortBy === 'cards') return ((b.stats || {}).cardCount || 0) - ((a.stats || {}).cardCount || 0);
        if (sortBy === 'activity') return String((b.stats || {}).lastIssuedAt || '').localeCompare(String((a.stats || {}).lastIssuedAt || ''));
        return 0;
    });
    const toggleActive = async (tn) => {
        const next = tn.isActive === false;
        if (!next && !(await askConfirm(`سامانه‌ی «${tn.orgName}» غیرفعال شود؟ کاربران دیگر نمی‌توانند وارد شوند یا کارت صادر کنند.`, { danger: true, okText: 'غیرفعال کن' }))) return;
        try { await apiPost('set_tenant_active', { id: tn.id, isActive: next }); notifySuccess(next ? 'سامانه فعال شد.' : 'سامانه غیرفعال شد.'); onRefresh(); } catch (e) { notifyError(e); }
    };
    const totalCards = validTenants.reduce((s, tn) => s + ((tn.stats || {}).cardCount || 0), 0);
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 flex-1 w-full flex flex-col relative">
            {showPresetsManager && <PresetsManagerModal onClose={() => setShowPresetsManager(false)} />}
            {showPlatformSettings && <PlatformSettingsModal onClose={() => setShowPlatformSettings(false)} />}
            {showFontsManager && <FontsManagerModal onClose={() => setShowFontsManager(false)} fetchGlobalFonts={fetchGlobalFonts} />}
            {showValidationsManager && <ValidationsManagerModal onClose={() => setShowValidationsManager(false)} fetchGlobalValidations={fetchGlobalValidations} />}
            {linkFor && <TenantLinkModal tenant={linkFor.tenant} justPublished={linkFor.justPublished} onClose={() => setLinkFor(null)} />}
            {auditFor && <AuditLogModal tenantId={auditFor.id} title={auditFor.id ? `گزارش فعالیت «${auditFor.orgName}»` : 'گزارش فعالیت همه‌ی سازمان‌ها'} t={t} onClose={() => setAuditFor(null)} />}
            <header className="flex flex-col lg:flex-row justify-between items-center mb-6 glass p-4 rounded-2xl gap-4"><div className="flex items-center gap-4"><LogoImg alt="" className="w-12 h-12 object-contain rounded-lg" /><div><h1 className="text-xl font-bold text-slate-800 lg:whitespace-nowrap">{plat.name}</h1><p className="text-sm text-slate-500">{t('manage_platforms')}</p><p className="text-xs text-slate-500 mt-1 flex items-center gap-3"><span className="flex items-center gap-1"><Icon name="Building2" className="w-3.5 h-3.5" />{validTenants.length} سازمان</span><span className="flex items-center gap-1"><Icon name="CreditCard" className="w-3.5 h-3.5" />{totalCards} کارت</span></p></div></div><div className="flex items-center gap-2 flex-wrap justify-end"><button onClick={() => setAuditFor({ id: '' })} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl font-bold shadow-sm"><Icon name="ScrollText" className="w-4 h-4" /> گزارش فعالیت</button><button onClick={() => setShowValidationsManager(true)} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl font-bold shadow-sm"><Icon name="CheckCircle2" className="w-4 h-4" /> اعتبارسنجی</button><button onClick={() => setShowFontsManager(true)} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl font-bold shadow-sm"><Icon name="Type" className="w-4 h-4" /> فونت‌ها</button><button onClick={() => setShowPresetsManager(true)} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl font-bold shadow-sm"><Icon name="Database" className="w-4 h-4" /> {t('base_lists')}</button><ThemeToggle t={t} /><button onClick={() => setShowPlatformSettings(true)} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl font-bold shadow-sm"><Icon name="Settings" className="w-4 h-4" /> تنظیمات پلتفرم</button><button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-500 bg-slate-50 hover:bg-red-50 px-4 py-2 rounded-xl font-bold border"><Icon name="LogOut" className="w-4 h-4" /> {t('logout')}</button></div></header>
            <div className="flex flex-col sm:flex-row gap-3 mb-6"><div className="relative flex-1"><Icon name="Search" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="جستجوی سازمان (نام یا شناسه)..." aria-label="جستجوی سازمان" className="w-full pr-10 pl-4 py-2.5 border border-white rounded-xl bg-white/70" /></div><select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="مرتب‌سازی" className="border border-white rounded-xl px-3 py-2.5 bg-white/70 text-sm"><option value="created">جدیدترین</option><option value="name">نام</option><option value="cards">بیشترین کارت</option><option value="activity">آخرین فعالیت</option></select></div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
                <button type="button" onClick={onNewWizard} className="glass-soft border-2 border-dashed border-indigo-300 rounded-3xl p-8 flex flex-col items-center justify-center text-indigo-700 hover:bg-white/60 transition-colors cursor-pointer min-h-[220px]"><Icon name="Plus" className="w-12 h-12 mb-3" /><span className="font-bold text-lg">{t('new_org')}</span><span className="text-sm opacity-80 text-center mt-2">{t('new_org_desc')}</span></button>
                {shown.length === 0 && search && <p className="md:col-span-2 text-center text-slate-400 self-center">سازمانی با این عبارت پیدا نشد.</p>}
                {shown.map(tn => { const [stLabel, stCls] = tenantStatus(tn); const st = tn.stats || {}; return (<div key={tn.id} className="glass rounded-3xl p-6 flex flex-col min-h-[220px] relative overflow-hidden"><div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundImage: `linear-gradient(90deg, ${themeOf(tn).c1}, ${themeOf(tn).c2}, ${themeOf(tn).c3})` }} />
                    <div className="flex items-center gap-4 mb-4">{tn.logoUrl ? <img src={tn.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-slate-50" /> : <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center"><Icon name="LayoutTemplate" className="text-slate-400" /></div>}<div className="min-w-0"><h3 className="font-bold text-lg text-slate-800 truncate">{tn.orgName}</h3>{tn.slug && <span className="block text-[11px] text-indigo-700 font-mono" dir="ltr">/{tn.slug}</span>}<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stCls}`}>{stLabel}{tn.activeUntil ? ` تا ${formatDateTime(tn.activeUntil, 'fa')}` : ''}</span></div></div>
                    <div className="space-y-2 text-sm text-slate-600 flex-1">
                        <p className="flex justify-between items-center"><span className="text-slate-400">کارت‌های صادرشده:</span> <b>{toPersianNum(st.cardCount || 0)}</b></p>
                        <p className="flex justify-between items-center"><span className="text-slate-400">آخرین صدور:</span> <span className="text-xs">{st.lastIssuedAt ? formatDateTime(st.lastIssuedAt, 'fa') : '—'}</span></p>
                        <p className="flex justify-between items-center"><span className="text-slate-400">{t('admin_pass')}:</span> {passBadge(tn.hasAdminPass)}</p>
                        <p className="flex justify-between items-center"><span className="text-slate-400">{t('public_pass')}:</span> {passBadge(tn.hasPublicPass)}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t flex flex-wrap gap-2 justify-between">
                        <div className="flex gap-1"><button type="button" onClick={() => setLinkFor({ tenant: tn })} className="flex items-center gap-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg text-xs font-bold"><Icon name="QrCode" className="w-3.5 h-3.5" /> لینک و QR</button><button type="button" onClick={() => copyText(tenantLinkFor(tn, rewriteOk), 'لینک کپی شد.')} aria-label={`کپی لینک ${tn.orgName}`} title="کپی لینک" className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg"><Icon name="Link" className="w-3.5 h-3.5" /></button></div>
                        <div className="flex gap-1">
                            <button type="button" onClick={() => setAuditFor(tn)} aria-label={`گزارش فعالیت ${tn.orgName}`} title="گزارش فعالیت" className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg"><Icon name="ScrollText" className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => toggleActive(tn)} aria-label={tn.isActive === false ? `فعال کردن ${tn.orgName}` : `غیرفعال کردن ${tn.orgName}`} title={tn.isActive === false ? 'فعال کردن' : 'غیرفعال کردن'} className={`px-2 py-1.5 rounded-lg ${tn.isActive === false ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-amber-700 bg-amber-50 hover:bg-amber-100'}`}><Icon name="Power" className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => { const dup = JSON.parse(JSON.stringify(tn)); delete dup.id; delete dup.hasAdminPass; delete dup.hasPublicPass; delete dup.stats; delete dup.closedReason; delete dup.slug; dup.orgName += ' (Copy)'; onDuplicateWizard(dup); }} aria-label={`${t('copy_org')} ${tn.orgName}`} title={t('copy_org')} className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg"><Icon name="Copy" className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => { const c = { ...tn }; delete c.stats; delete c.closedReason; onEditWizard(c); }} aria-label={`${t('edit')} ${tn.orgName}`} title={t('edit')} className="text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg"><Icon name="Edit2" className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={async () => { if (!(await askConfirm(`سازمان «${tn.orgName}» و همه‌ی ${toPersianNum(st.cardCount || 0)} کارت صادرشده‌ی آن برای همیشه حذف شوند؟`, { danger: true, okText: 'حذف سازمان' }))) return; onDeleteWizard(tn.id); }} aria-label={`${t('delete')} ${tn.orgName}`} title={t('delete')} className="text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1.5 rounded-lg"><Icon name="Trash2" className="w-3.5 h-3.5" /></button>
                        </div>
                    </div>
                </div>); })}
            </div>
        </div>
    );
}

// ویرایشگر وب‌هوک‌ها به‌صورت کامپوننت مستقل (تعریف آن داخل render باعث remount و از دست رفتن فوکوس در هر تایپ می‌شد)
function WebhookEditor({ webhooks, onChange, tenantId, sampleData }) {
    const list = webhooks || [];
    const [testing, setTesting] = useState(null); const [results, setResults] = useState({}); const [logs, setLogs] = useState(null);
    const update = (idx, patch) => onChange(list.map((wh, i) => i === idx ? { ...wh, ...patch } : wh));
    const addWh = () => onChange([...list, { isActive: true, url: '', method: 'POST', headers: '', payloadTemplate: '{\n  "name": "{requesterName}"\n}' }]);
    const remove = async (idx) => { if (!(await askConfirm('این وب‌هوک حذف شود؟', { danger: true, okText: 'حذف' }))) return; onChange(list.filter((_, i) => i !== idx)); };
    // ارسال آزمایشی با داده‌های نمونه‌ی «شبیه‌ساز فرم» (بدون نیاز به ذخیره)
    const test = async (idx) => {
        setTesting(idx);
        try { const r = await apiPost('test_webhook', { webhook: list[idx], tenantId: tenantId || '', sampleData: sampleData || {} }); setResults(p => ({ ...p, [idx]: r.result })); if (logs) loadLogs(); }
        catch (e) { setResults(p => ({ ...p, [idx]: { code: 0, error: e.message, body: '' } })); }
        setTesting(null);
    };
    const loadLogs = () => { if (!tenantId) return; apiGet('get_webhook_logs', { tenant_id: tenantId }).then(d => setLogs(Array.isArray(d) ? d : [])).catch(notifyError); };
    return (<div className="mt-6 border-t pt-6"><h4 className="font-bold text-sm text-indigo-900 mb-4 flex items-center gap-2"><Icon name="Globe" className="w-4 h-4" /> تنظیمات اتوماسیون (Webhooks)</h4>
        {list.map((wh, idx) => { const urlInvalid = wh.url && !/^https:\/\/[^\s/]+/i.test(wh.url); const res = results[idx]; return (<div key={idx} className="bg-slate-50 p-4 rounded-xl border mb-4 relative">
            <button onClick={() => remove(idx)} aria-label={`حذف وب‌هوک ${idx + 1}`} title="حذف" className="absolute top-2 left-2 text-red-500 hover:bg-red-50 p-1 rounded"><Icon name="Trash2" className="w-4 h-4" /></button>
            <div className="grid md:grid-cols-2 gap-4 mb-4"><div><label className="text-xs font-bold block mb-1">Webhook URL</label><input type="text" value={wh.url} onChange={e => update(idx, { url: e.target.value })} className={`w-full border rounded-lg px-3 py-2 text-sm ${urlInvalid ? 'border-amber-400' : ''}`} dir="ltr" placeholder="https://..." />{urlInvalid && <p className="text-[10px] text-amber-600 mt-1">فقط آدرس‌های https عمومی پذیرفته می‌شوند.</p>}</div><div><label className="text-xs font-bold block mb-1">Method</label><select value={wh.method} onChange={e => update(idx, { method: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="GET">GET</option></select></div></div>
            <div className="mb-4"><label className="text-xs font-bold block mb-1">Custom Headers (هر خط یک هدر)</label><textarea value={wh.headers} onChange={e => update(idx, { headers: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-16" dir="ltr" placeholder="Authorization: Bearer Token..."></textarea></div>
            <div><label className="text-xs font-bold block mb-1">Payload Template (JSON) - متغیرها: {`{requesterName}, {cardId}, {field_id}`}</label><textarea value={wh.payloadTemplate} onChange={e => update(idx, { payloadTemplate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-32 bg-slate-800 text-green-400" dir="ltr"></textarea><p className="text-[10px] text-slate-500 mt-1">متغیرها را داخل کوتیشن بگذارید، مثل "{'{requesterName}'}"؛ مقدارها به‌صورت خودکار escape می‌شوند.</p></div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3"><label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={!!wh.isActive} onChange={e => update(idx, { isActive: e.target.checked })} className="accent-indigo-600" /> فعال بودن این وب‌هوک</label><button type="button" onClick={() => test(idx)} disabled={!wh.url || testing !== null} className="text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-bold disabled:opacity-50 flex items-center gap-1"><Icon name="Send" className="w-3.5 h-3.5" /> {testing === idx ? 'در حال ارسال...' : 'ارسال آزمایشی'}</button></div>
            {res && <div role="status" className={`mt-3 text-xs rounded-lg p-2 border ${res.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}><b>{res.error ? `ناموفق: ${res.error}` : `موفق (HTTP ${res.code})`}</b>{res.body && <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600 max-h-24 overflow-auto" dir="ltr">{res.body}</pre>}</div>}
        </div>); })}
        <div className="flex flex-wrap gap-2"><button onClick={addWh} className="text-sm bg-indigo-50 text-indigo-700 font-bold px-4 py-2 rounded-xl hover:bg-indigo-100">+ افزودن وب‌هوک جدید</button>{tenantId && <button type="button" onClick={loadLogs} className="text-sm bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-xl hover:bg-slate-200">{logs ? 'به‌روزرسانی گزارش ارسال' : 'گزارش ارسال‌ها'}</button>}</div>
        {logs && (<div className="mt-3 border rounded-xl overflow-hidden"><table className="w-full text-[11px]"><thead className="bg-slate-100"><tr><th className="p-2 text-right">زمان</th><th className="p-2 text-right">کارت</th><th className="p-2 text-right">نتیجه</th></tr></thead><tbody className="divide-y">{logs.length === 0 ? <tr><td colSpan="3" className="p-3 text-center text-slate-400">هنوز ارسالی ثبت نشده است.</td></tr> : logs.map(l => (<tr key={l.id} className={l.error ? 'bg-red-50/50' : ''}><td className="p-2 whitespace-nowrap">{formatDateTime(l.created_at, 'fa')}</td><td className="p-2 font-mono" dir="ltr">{l.card_id === 'test' ? 'آزمایشی' : l.card_id}</td><td className="p-2">{l.error ? <span className="text-red-600">{l.error}</span> : <span className="text-green-700">HTTP {l.http_code}</span>}<div className="text-slate-400 truncate max-w-[180px]" dir="ltr" title={l.url}>{l.url}</div></td></tr>))}</tbody></table></div>)}
    </div>);
}

const INITIAL_WIZARD_DATA = { orgName: '', adminPass: '', publicPass: '', logoUrl: '', welcomeText: 'به سامانه یکپارچه صدور کارت خوش آمدید.', langCode: 'fa', frontBg: '', backBg: '', fields: [], conditions: [], dashboardNameFormat: [], webhooks: [], cardLayout: 'double', showcase3d: false, canvasW: 800, canvasH: 500, canvasMode: 'auto', bgFit: 'stretch', printW: 0, printH: 0, validityDays: 0, isActive: true, activeUntil: '', allowLangSwitch: true, slug: '', theme: { ...DEFAULT_THEME } };
const STEPS = [{ title: 'هویت و اتوماسیون' }, { title: 'درگاه ورود' }, { title: 'روی کارت' }, { title: 'پشت کارت' }, { title: 'مدیریت فونت' }, { title: 'شبیه‌ساز درگاه' }, { title: 'شبیه‌ساز فرم' }, { title: 'شبیه‌ساز رندر' }, { title: 'شبیه‌ساز داشبورد' }, { title: 'انتشار نهایی' }];

/** ابعاد واقعی هر روی کارت: حالت ثابت = ابعاد بوم؛ حالت خودکار = ابعاد عکس زمینه (یا ابعاد پیش‌فرض بوم بدون عکس). */
const useSideDims = (data) => {
    const [dims, setDims] = useState(null);
    const fixed = isFixedCanvas(data); const def = getCanvasDefault(data);
    useEffect(() => {
        let alive = true;
        const get = async (url) => { if (fixed || !url) return def; const r = await loadImageAny(url); return r ? { w: r.img.width, h: r.img.height } : def; };
        Promise.all([get(data.frontBg), get(data.backBg)]).then(([front, back]) => { if (alive) setDims({ front, back }); });
        return () => { alive = false; };
    }, [data.frontBg, data.backBg, fixed, def.w, def.h]);
    return dims;
};
const hasSideMismatch = (data, dims) => !isSingleSided(data) && !!dims && !sameDim(dims.front, dims.back);

/** گزارش مغایرت ابعاد روی و پشت کارت و ابزار یکسان‌سازی (ابعاد به‌صورت ورودی). */
function SideDimsReport({ data, setData, dims }) {
    const mismatch = hasSideMismatch(data, dims);
    const [w, setW] = useState(''); const [h, setH] = useState(''); const [fit, setFit] = useState('stretch');
    useEffect(() => { if (mismatch) { setW(String(dims.front.w)); setH(String(dims.front.h)); } }, [mismatch, dims && dims.front.w, dims && dims.front.h]);
    if (!mismatch) return null;
    const ratioDiff = !sameRatio(dims.front, dims.back);
    const apply = async () => {
        const W = Math.round(Number(w)); const H = Math.round(Number(h));
        if (!(W >= 50 && H >= 50 && W <= 10000 && H <= 10000)) return notify('عرض و ارتفاع باید عددی بین ۵۰ تا ۱۰۰۰۰ پیکسل باشد.');
        const sides = ['front', 'back'].filter(sd => (data.fields || []).some(f => f.side === sd) && !sameDim(dims[sd], { w: W, h: H }));
        const rescale = sides.length > 0 && await askConfirm('موقعیت و اندازه‌ی المان‌ها متناسب با ابعاد جدید هر رو تنظیم شود؟', { okText: 'بله، تنظیم شود', cancelText: 'خیر' });
        setData(p => {
            let next = { ...p, canvasMode: 'fixed', canvasW: W, canvasH: H, bgFit: fit };
            if (rescale) sides.forEach(sd => { next = scaleSideFields(next, sd, W / dims[sd].w, H / dims[sd].h); });
            return next;
        });
    };
    return (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3 text-right">
            <div className="flex items-start gap-2"><Icon name="AlertTriangle" className="w-5 h-5 text-amber-600 mt-0.5" /><div><p className="text-sm font-bold text-amber-900">مغایرت ابعاد روی و پشت کارت</p><p className="text-xs text-amber-800 mt-1">روی کارت: <b dir="ltr">{dims.front.w}×{dims.front.h}</b> — پشت کارت: <b dir="ltr">{dims.back.w}×{dims.back.h}</b></p>{ratioDiff && <p className="text-[11px] text-amber-700 mt-1">نسبت ابعاد دو رو هم متفاوت است؛ هنگام یکسان‌سازی، تصویر یکی از دو رو کشیده، برش‌خورده یا حاشیه‌دار می‌شود.</p>}</div></div>
            <div><label className="text-[11px] font-bold text-amber-900 block mb-1">ابعاد یکسان برای هر دو رو (پیکسل)</label><div className="flex gap-2 items-center" dir="ltr"><input type="number" min="50" value={w} onChange={e => setW(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" title="عرض" /><span className="text-slate-400">×</span><input type="number" min="50" value={h} onChange={e => setH(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" title="ارتفاع" /></div>
                <div className="flex gap-1 mt-1 flex-wrap">{[['روی', dims.front], ['پشت', dims.back]].map(([lbl, d]) => <button key={lbl} type="button" onClick={() => { setW(String(d.w)); setH(String(d.h)); }} className="text-[10px] bg-white border border-amber-200 rounded px-2 py-0.5 text-amber-800">مثل {lbl} <span dir="ltr">({d.w}×{d.h})</span></button>)}</div></div>
            <div><label className="text-[11px] font-bold text-amber-900 block mb-1">جای‌گیری عکس زمینه</label><select value={fit} onChange={e => setFit(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">{BG_FITS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
            <button type="button" onClick={apply} className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold py-2 rounded-lg">یکسان‌سازی ابعاد دو رو</button>
        </div>
    );
}

const PRINT_PRESETS = [
    { key: 'auto', label: 'خودکار (روی کاغذ A4 با حاشیه)', w: 0, h: 0 },
    { key: 'card', label: 'کارت استاندارد ۸۵٫۶×۵۴ میلی‌متر', w: 85.6, h: 54 },
    { key: 'photo', label: 'عکس ۱۰×۱۵ سانتی‌متر', w: 100, h: 150 },
    { key: 'a6', label: 'A6 (۱۰۵×۱۴۸)', w: 105, h: 148 },
    { key: 'a5', label: 'A5 (۱۴۸×۲۱۰)', w: 148, h: 210 },
    { key: 'a4', label: 'A4 (۲۱۰×۲۹۷)', w: 210, h: 297 },
    { key: 'a3', label: 'A3 (۲۹۷×۴۲۰)', w: 297, h: 420 },
];
/** اندازه‌ی چاپ واقعی خروجی PDF (جهت صفحه خودکار با جهت تصویر هماهنگ می‌شود). */
function PrintSizeEditor({ data, setData }) {
    const w = Number(data.printW) || 0; const h = Number(data.printH) || 0;
    const preset = (PRINT_PRESETS.find(p => (p.w === w && p.h === h) || (p.w === h && p.h === w)) || { key: 'custom' }).key;
    return (
        <div><label className="text-xs font-bold text-slate-700 block mb-1">اندازه‌ی چاپ / PDF</label>
            <select value={preset} onChange={e => { const p = PRINT_PRESETS.find(x => x.key === e.target.value); if (p) setData(d => ({ ...d, printW: p.w, printH: p.h })); else setData(d => ({ ...d, printW: w || 100, printH: h || 100 })); }} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">{PRINT_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}<option value="custom">سفارشی (میلی‌متر)</option></select>
            {preset === 'custom' && <div className="flex gap-2 mt-2 items-center" dir="ltr"><input type="number" min="10" step="0.1" value={w} onChange={e => setData(d => ({ ...d, printW: Number(e.target.value) }))} aria-label="عرض چاپ (میلی‌متر)" className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" /><span className="text-slate-400">×</span><input type="number" min="10" step="0.1" value={h} onChange={e => setData(d => ({ ...d, printH: Number(e.target.value) }))} aria-label="ارتفاع چاپ (میلی‌متر)" className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" /><span className="text-xs text-slate-500">mm</span></div>}
            <p className="text-[10px] text-slate-500 mt-1">دکمه‌ی «دانلود PDF» و «چاپ» برای کاربران، فایلی دقیقاً با همین اندازه می‌سازد (هر رو در یک صفحه).</p>
        </div>
    );
}

/** انتخاب رنگ‌های گرادیانت پس‌زمینه‌ی پنل این سازمان. */
function ThemeEditor({ data, setData, title = 'رنگ‌های پس‌زمینه‌ی پنل', hint = 'این رنگ‌ها در صفحه‌ی ورود، فرم، داشبورد و صفحه‌ی استعلام همین سازمان به‌صورت گرادیانت سیال نمایش داده می‌شوند.' }) {
    const th = themeOf(data);
    const setColor = (k, v) => setData(p => ({ ...p, theme: { ...themeOf(p), [k]: v } }));
    const isActive = (pr) => pr.c1 === th.c1 && pr.c2 === th.c2 && pr.c3 === th.c3;
    return (
        <div className="space-y-3 bg-white/50 border border-white/70 rounded-xl p-4">
            <label className="text-sm font-bold block">{title}</label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="پالت‌های آماده">{THEME_PRESETS.map(pr => (
                <button key={pr.name} type="button" role="radio" aria-checked={isActive(pr)} title={pr.name} aria-label={pr.name} onClick={() => setData(p => ({ ...p, theme: { c1: pr.c1, c2: pr.c2, c3: pr.c3 } }))} className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 ${isActive(pr) ? 'border-slate-800 scale-110' : 'border-white'}`} style={{ backgroundImage: `linear-gradient(135deg, ${pr.c1}, ${pr.c2}, ${pr.c3})` }} />
            ))}</div>
            <div className="grid grid-cols-3 gap-2">{[['c1', 'رنگ ۱'], ['c2', 'رنگ ۲'], ['c3', 'رنگ ۳']].map(([k, l]) => (
                <label key={k} className="flex flex-col items-center gap-1 text-[11px] text-slate-600"><input type="color" value={th[k]} onChange={e => setColor(k, e.target.value)} className="w-full h-9 rounded-lg cursor-pointer border border-white bg-transparent" aria-label={l} /><span dir="ltr" className="font-mono">{th[k]}</span></label>
            ))}</div>
            <div className="h-3 rounded-full" style={{ backgroundImage: `linear-gradient(90deg, ${th.c1}, ${th.c2}, ${th.c3})` }} aria-hidden="true" />
            {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
        </div>
    );
}

/** آدرس اختصاصی لینک سازمان؛ خالی = لینک با شناسه‌ی تصادفی. */
function SlugEditor({ data, setData, originalSlug }) {
    const rewriteOk = useRewriteOk(); const slug = data.slug || '';
    const [st, setSt] = useState({ checking: false, ok: null, reason: '' });
    useEffect(() => {
        if (!slug) { setSt({ checking: false, ok: null, reason: '' }); return; }
        setSt(p => ({ ...p, checking: true }));
        const timer = setTimeout(() => { apiGet('check_slug', { slug, id: data.id || '' }).then(r => setSt({ checking: false, ok: r.available, reason: r.reason || '' })).catch(e => setSt({ checking: false, ok: null, reason: e.message })); }, 350);
        return () => clearTimeout(timer);
    }, [slug, data.id]);
    const preview = slug ? tenantLinkFor({ slug }, rewriteOk) : (data.id ? tenantLinkFor({ id: data.id }, rewriteOk) : '');
    return (
        <div>
            <label htmlFor="slug-input" className="text-sm font-bold mb-1 block">آدرس اختصاصی لینک <span className="font-normal text-xs text-slate-500">(اختیاری)</span></label>
            <div className="flex items-stretch border border-slate-300 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-indigo-500" dir="ltr">
                <span className="px-3 flex items-center text-xs text-slate-400 bg-slate-50 border-r max-w-[45%] truncate">{window.location.host}{APP_BASE}{rewriteOk ? '' : '?org='}</span>
                <input id="slug-input" value={slug} onChange={e => setData(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) }))} placeholder="my-company" className="flex-1 px-3 py-2.5 outline-none min-w-0" aria-describedby="slug-help" aria-invalid={st.ok === false} />
                <span className="px-2 flex items-center" aria-live="polite">{st.checking ? <Icon name="Loader" className="w-4 h-4 animate-spin text-slate-400" /> : st.ok === true ? <Icon name="CheckCircle2" className="w-4 h-4 text-green-600" /> : st.ok === false ? <Icon name="XCircle" className="w-4 h-4 text-red-500" /> : null}</span>
            </div>
            <p id="slug-help" className={`text-[11px] mt-1 ${st.ok === false ? 'text-red-600 font-bold' : 'text-slate-500'}`}>{st.ok === false ? st.reason : (slug ? 'حروف کوچک انگلیسی، عدد و خط تیره (۳ تا ۴۰ کاراکتر).' : 'اگر خالی بماند، سیستم لینک تصادفی می‌سازد.')}</p>
            {preview && <p className="text-[11px] text-indigo-700 font-mono mt-1 break-all" dir="ltr">{preview}</p>}
            {originalSlug && slug !== originalSlug && <p className="text-[11px] text-amber-700 mt-1">توجه: پس از ذخیره، لینک قبلی (/{originalSlug}) دیگر کار نمی‌کند.</p>}
        </div>
    );
}

/** تنظیمات بهره‌برداری سازمان: اعتبار کارت‌ها، وضعیت سامانه، زبان کاربران. */
/** ترتیب نمایش فیلدها در فرم کاربر، با دکمه‌های بالا و پایین (ترتیب لایه‌ها روی کارت تغییر نمی‌کند). */
function FormOrderEditor({ data, setData }) {
    const fields = getVisibleFields(data.fields, data); const single = isSingleSided(data);
    const move = (i, dir) => {
        const ids = fields.map(f => f.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        setData(p => ({ ...p, formOrder: ids }), { checkpoint: true });
    };
    const custom = Array.isArray(data.formOrder) && data.formOrder.length > 0;
    const btn = 'p-1.5 rounded-lg border bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-600 disabled:opacity-30 disabled:pointer-events-none';
    return (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-6">
            <div className="p-5 border-b flex flex-wrap justify-between items-start gap-3">
                <div><h3 className="font-bold text-lg text-slate-800">ترتیب فیلدها در فرم</h3><p className="text-sm text-slate-500">ترتیبی که کاربر فیلدها را در فرم صدور کارت می‌بیند. جای المان‌ها روی کارت عوض نمی‌شود.</p></div>
                {custom && <button type="button" onClick={() => setData(p => ({ ...p, formOrder: [] }), { checkpoint: true })} className="text-xs text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"><Icon name="RotateCcw" className="w-3.5 h-3.5" /> بازگشت به ترتیب طراحی</button>}
            </div>
            {fields.length === 0 ? <p className="text-center p-6 text-slate-400 text-sm">هنوز فیلدی برای فرم تعریف نشده است.</p> : (
                <ol className="divide-y" aria-label="ترتیب فیلدها در فرم">{fields.map((f, i) => (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                        <span className="w-7 h-7 shrink-0 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate font-bold text-slate-700">{f.label || '—'}</span>
                        <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">{FIELD_TYPE_LABELS[f.type] || f.type}{!single && ` · ${f.side === 'back' ? 'پشت' : 'رو'}`}</span>
                        <div className="flex gap-1 shrink-0">
                            <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`انتقال به بالا: ${f.label}`} title="بالا"><Icon name="ArrowUp" className="w-4 h-4" /></button>
                            <button type="button" className={btn} disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`انتقال به پایین: ${f.label}`} title="پایین"><Icon name="ArrowDown" className="w-4 h-4" /></button>
                        </div>
                    </li>
                ))}</ol>
            )}
        </div>
    );
}

function TenantSettingsEditor({ data, setData }) {
    const active = data.isActive !== false;
    return (
        <div className="space-y-3 bg-slate-50 border rounded-xl p-4">
            <label className="text-sm font-bold block">تنظیمات بهره‌برداری</label>
            <div><label className="text-xs font-bold text-slate-700 block mb-1">مدت اعتبار هر کارت (روز)</label><div className="flex gap-2 items-center"><input type="number" min="0" value={data.validityDays || 0} onChange={e => setData(p => ({ ...p, validityDays: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className="w-28 border rounded-lg px-2 py-1.5 text-sm text-center bg-white" dir="ltr" /><div className="flex gap-1 flex-wrap">{[[0, 'نامحدود'], [365, '۱ سال'], [730, '۲ سال']].map(([v, l]) => <button key={v} type="button" onClick={() => setData(p => ({ ...p, validityDays: v }))} className={`text-[10px] px-2 py-1 rounded border ${Number(data.validityDays || 0) === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`}>{l}</button>)}</div></div><p className="text-[10px] text-slate-500 mt-1">۰ = نامحدود. تاریخ انقضا هنگام صدور ثبت می‌شود و در صفحه‌ی استعلام (QR) و داشبورد نمایش داده می‌شود.</p></div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"><input type="checkbox" checked={active} onChange={e => setData(p => ({ ...p, isActive: e.target.checked }))} className="accent-indigo-600 w-4 h-4" /> سامانه فعال است</label>
            <div><label className="text-xs font-bold text-slate-700 block mb-1">فعال تا تاریخ (اختیاری)</label><div className="flex items-center gap-2"><input type="date" value={data.activeUntil || ''} onChange={e => setData(p => ({ ...p, activeUntil: e.target.value }))} className="border rounded-lg px-2 py-1.5 text-sm bg-white" dir="ltr" />{data.activeUntil && <><span className="text-xs text-slate-600">{formatDateTime(data.activeUntil, 'fa')}</span><button type="button" onClick={() => setData(p => ({ ...p, activeUntil: '' }))} className="text-[10px] text-red-500">حذف</button></>}</div><p className="text-[10px] text-slate-500 mt-1">در حالت غیرفعال یا پس از این تاریخ، کاربران نمی‌توانند وارد شوند یا کارت صادر کنند؛ مدیر سازمان همچنان به داشبورد دسترسی دارد.</p></div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={data.allowLangSwitch !== false} onChange={e => setData(p => ({ ...p, allowLangSwitch: e.target.checked }))} className="accent-indigo-600 w-4 h-4" /> کاربران بتوانند زبان را تغییر دهند</label>
        </div>
    );
}

/** ورودی عددی که فقط با خروج از فیلد یا Enter اعمال می‌شود (برای مقادیری که تغییرشان سنگین است یا تأیید می‌خواهد). */
function CommitNumberInput({ value, onCommit, ...rest }) {
    const [v, setV] = useState(String(value));
    useEffect(() => { setV(String(value)); }, [value]);
    const commit = () => { const n = Number(v); if (v !== '' && !isNaN(n) && n !== Number(value)) onCommit(n); else setV(String(value)); };
    return <input type="number" value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} {...rest} />;
}

// قالب خروجی: کارت دورو یا خروجی تک‌رو (پوستر خوش‌آمدگویی، کارت تک‌رو، گواهی و ...) و ابعاد بوم
function OutputFormatEditor({ data, setData, dims }) {
    const single = isSingleSided(data); const dim = getCanvasDefault(data); const fixed = isFixedCanvas(data);
    const presetKey = (CANVAS_PRESETS.find(p => p.w === dim.w && p.h === dim.h) || { key: 'custom' }).key;
    const setLayout = async (layout) => {
        if (layout === 'single' && (data.fields || []).some(f => f.side === 'back') && !(await askConfirm('در حالت تک‌رو، المان‌های پشت کارت نه در فرم نمایش داده می‌شوند و نه چاپ می‌شوند (حذف نمی‌شوند و با برگشت به حالت دورو بازمی‌گردند). ادامه می‌دهید؟'))) return;
        setData(p => ({ ...p, cardLayout: layout }));
    };
    const setDim = async (w, h) => {
        w = Math.max(50, Math.min(10000, Math.round(w) || 0)); h = Math.max(50, Math.min(10000, Math.round(h) || 0));
        if (w === dim.w && h === dim.h) return;
        // در حالت ثابت همه‌ی سمت‌ها و در حالت خودکار فقط سمت‌های بدون عکس زمینه از ابعاد بوم پیروی می‌کنند
        const sides = [['front', 'frontBg'], ['back', 'backBg']].filter(([side, bgKey]) => (fixed || !data[bgKey]) && (data.fields || []).some(f => f.side === side)).map(([side]) => side);
        const rescale = sides.length > 0 && await askConfirm('موقعیت و اندازه‌ی المان‌های فعلی متناسب با ابعاد جدید تنظیم شود؟', { okText: 'بله، تنظیم شود', cancelText: 'خیر' });
        setData(p => { let next = { ...p, canvasW: w, canvasH: h }; if (rescale) sides.forEach(side => { next = scaleSideFields(next, side, w / dim.w, h / dim.h); }); return next; });
    };
    const setMode = async (mode) => {
        if (mode === (fixed ? 'fixed' : 'auto') || !dims) return;
        if (mode === 'fixed') {
            // ابعاد ثابت از ابعاد فعلی روی کارت شروع می‌شود تا روی کارت جابه‌جا نشود
            const base = dims.front;
            const backNeeds = !single && !sameDim(dims.back, base) && (data.fields || []).some(f => f.side === 'back');
            const rescale = backNeeds && await askConfirm(`ابعاد بوم برای هر دو رو ${base.w}×${base.h} می‌شود. المان‌های پشت کارت متناسب تنظیم شوند؟`, { okText: 'بله، تنظیم شود', cancelText: 'خیر' });
            setData(p => { let next = { ...p, canvasMode: 'fixed', canvasW: base.w, canvasH: base.h, bgFit: p.bgFit || 'stretch' }; if (rescale) next = scaleSideFields(next, 'back', base.w / dims.back.w, base.h / dims.back.h); return next; });
        } else {
            // بازگشت به حالت خودکار: هر رو ابعاد عکس زمینه‌ی خودش را می‌گیرد
            (async () => {
                const get = async (url) => { if (!url) return dim; const r = await loadImageAny(url); return r ? { w: r.img.width, h: r.img.height } : dim; };
                const [fd, bd] = await Promise.all([get(data.frontBg), get(data.backBg)]);
                const sides = [['front', fd], ['back', bd]].filter(([sd, d]) => !sameDim(d, dim) && (data.fields || []).some(f => f.side === sd));
                const rescale = sides.length > 0 && await askConfirm('در حالت خودکار ابعاد هر رو برابر ابعاد عکس زمینه‌ی آن می‌شود. المان‌ها متناسب تنظیم شوند؟', { okText: 'بله، تنظیم شود', cancelText: 'خیر' });
                setData(p => { let next = { ...p, canvasMode: 'auto' }; if (rescale) sides.forEach(([sd, d]) => { next = scaleSideFields(next, sd, d.w / dim.w, d.h / dim.h); }); return next; });
            })();
        }
    };
    const choice = (active, title, desc, onClick) => (<button type="button" onClick={onClick} className={`text-right p-3 rounded-xl border-2 transition-colors ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><span className="block text-sm font-bold text-slate-800">{title}</span><span className="block text-[10px] text-slate-500 mt-1">{desc}</span></button>);
    return (
        <div className="space-y-3 bg-slate-50 border rounded-xl p-4">
            <label className="text-sm font-bold block">قالب خروجی</label>
            <div className="grid grid-cols-2 gap-2">
                {choice(!single, 'کارت دورو', 'روی کارت + پشت کارت', () => setLayout('double'))}
                {choice(single, 'تک‌رو', 'پوستر، کارت تک‌رو، گواهی', () => setLayout('single'))}
            </div>
            {!single && <label className="flex items-start gap-2 bg-white border rounded-xl p-3 cursor-pointer"><input type="checkbox" checked={!!data.showcase3d} onChange={e => setData(p => ({ ...p, showcase3d: e.target.checked }))} className="accent-indigo-600 w-4 h-4 mt-0.5" /><span><span className="block text-sm font-bold text-slate-800">نمایش حرفه‌ای سه‌بعدی</span><span className="block text-[10px] text-slate-500 mt-0.5">بعد از ساخت کارت (و در «کارت‌های من»)، کارت به‌صورت سه‌بعدی با ضخامت، سایه، درخشش و انعکاس حول محور عمودی می‌چرخد تا کاربر هر دو رو را ببیند. کاربر می‌تواند با کشیدن، کارت را بچرخاند. نمای تخت، دانلود و چاپ مثل قبل در دسترس است.</span></span></label>}
            <label className="text-sm font-bold block pt-2">ابعاد بوم</label>
            <div className="grid grid-cols-2 gap-2">
                {choice(!fixed, 'خودکار از عکس زمینه', 'با آپلود عکس زمینه، ابعاد بوم همان ابعاد عکس می‌شود', () => setMode('auto'))}
                {choice(fixed, 'ابعاد ثابت', 'ابعاد را خودتان تعیین می‌کنید و عکس زمینه داخل آن جا می‌گیرد', () => setMode('fixed'))}
            </div>
            <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">{fixed ? 'ابعاد بوم (هر دو رو)' : 'ابعاد پیش‌فرض (وقتی عکس زمینه ندارید)'}</label>
                <select value={presetKey} onChange={e => { const pr = CANVAS_PRESETS.find(p => p.key === e.target.value); if (pr) setDim(pr.w, pr.h); }} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                    {CANVAS_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    <option value="custom">سفارشی</option>
                </select>
                <div className="flex gap-2 mt-2 items-center" dir="ltr"><CommitNumberInput min="50" value={dim.w} onCommit={n => setDim(n, dim.h)} className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" title="عرض (px)" aria-label="عرض بوم (پیکسل)" /><span className="text-slate-400">×</span><CommitNumberInput min="50" value={dim.h} onCommit={n => setDim(dim.w, n)} className="w-full border rounded-lg px-2 py-1.5 text-sm text-center bg-white" title="ارتفاع (px)" aria-label="ارتفاع بوم (پیکسل)" /></div>
                {fixed && <div className="mt-2"><label className="text-xs font-bold text-slate-700 block mb-1">جای‌گیری عکس زمینه</label><select value={data.bgFit || 'stretch'} onChange={e => setData(p => ({ ...p, bgFit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">{BG_FITS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>}
                {!fixed && dims && <p className="text-[10px] text-slate-500 mt-1">ابعاد فعلی: روی <span dir="ltr">{dims.front.w}×{dims.front.h}</span>{!single && <> — پشت <span dir="ltr">{dims.back.w}×{dims.back.h}</span></>}</p>}
            </div>
            <PrintSizeEditor data={data} setData={setData} />
            <SideDimsReport data={data} setData={setData} dims={dims} />
        </div>
    );
}

// پیش‌نویس ویزارد در مرورگر ذخیره می‌شود تا با رفرش یا بستن تصادفی صفحه، کار از دست نرود (رمزها ذخیره نمی‌شوند).
const wizardDraftKey = (id) => `wizard_draft_${id || 'new'}`;
const stripWizardSecrets = (d) => { const c = { ...d }; delete c.adminPass; delete c.publicPass; return c; };
const readWizardDraft = (id) => { try { const raw = localStorage.getItem(wizardDraftKey(id)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
const writeWizardDraft = (id, draft) => { try { localStorage.setItem(wizardDraftKey(id), JSON.stringify(draft)); } catch (e) { } };
const removeWizardDraft = (id) => { try { localStorage.removeItem(wizardDraftKey(id)); } catch (e) { } };

function SuperAdminWizard({ initialData, globalFonts, globalValidations, t, onComplete, onCancel }) {
    const [data, setData, history] = useUndoableState(() => ({ ...INITIAL_WIZARD_DATA, theme: { ...platformState.defaultTheme }, ...(initialData || {}), adminPass: '', publicPass: '' }));
    const isEdit = !!data.id;
    const [step, setStep] = useState(1); const [isSaving, setIsSaving] = useState(false); const [previewFormData, setPreviewFormData] = useState({}); const [stepError, setStepError] = useState(''); const [selectedFieldId, setSelectedFieldId] = useState(null); const [dbPresets, setDbPresets] = useState([]); const [uploadingLogo, setUploadingLogo] = useState(false);
    // آیا رمزها روی سرور تعیین شده‌اند (برای ویرایش: خالی گذاشتن = بدون تغییر)
    const [passSet, setPassSet] = useState({ admin: !!(initialData && initialData.id && initialData.hasAdminPass), public: !!(initialData && initialData.id && initialData.hasPublicPass) });
    const [savedJson, setSavedJson] = useState(() => (initialData && initialData.id) ? JSON.stringify(stripWizardSecrets({ ...INITIAL_WIZARD_DATA, ...initialData })) : null);
    const currentJson = useMemo(() => JSON.stringify(stripWizardSecrets(data)), [data]);
    const dirty = currentJson !== savedJson || !!data.adminPass || !!data.publicPass;
    useEffect(() => { apiGet('get_presets').then(d => { if (Array.isArray(d)) setDbPresets(d); }).catch(() => { }); }, []);

    // بازیابی پیش‌نویس ذخیره‌نشده (برای سازمان جدید یا ویرایش؛ نه برای کپی)
    useEffect(() => {
        const isDuplicate = initialData && !initialData.id; if (isDuplicate) return;
        const draft = readWizardDraft(initialData && initialData.id);
        if (!draft || !draft.data || JSON.stringify(draft.data) === currentJson) return;
        const when = new Date(draft.savedAt || Date.now()).toLocaleString('fa-IR');
        askConfirm(`یک پیش‌نویس ذخیره‌نشده از ${when} پیدا شد. بازیابی شود؟`, { okText: 'بازیابی پیش‌نویس', cancelText: 'نادیده گرفتن' }).then(ok => {
            if (ok) { history.setSilently(p => ({ ...p, ...draft.data, adminPass: '', publicPass: '' })); if (draft.step) setStep(draft.step); }
            else removeWizardDraft(initialData && initialData.id);
        });
    }, []);
    // ذخیره‌ی خودکار پیش‌نویس (با تأخیر)
    useEffect(() => {
        if (!dirty) return;
        const timer = setTimeout(() => writeWizardDraft(data.id, { data: stripWizardSecrets(data), step, savedAt: Date.now() }), 800);
        return () => clearTimeout(timer);
    }, [currentJson, step, dirty]);
    // هشدار مرورگر هنگام بستن/رفرش صفحه با تغییرات ذخیره‌نشده
    useEffect(() => {
        if (!dirty) return;
        const h = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
    }, [dirty]);
    // میانبرهای Undo/Redo (وقتی فوکوس در فیلد متنی نیست، تا Undo خود فیلد مختل نشود)
    useEffect(() => {
        const h = (e) => {
            if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target)) return;
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
            else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); history.redo(); }
            else if (k === 's') { e.preventDefault(); saveTenant(false); }
        };
        document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
    });

    const validateStep1 = () => {
        if (!data.orgName.trim()) return t('required_fields');
        if ((!passSet.admin && !data.adminPass) || (!passSet.public && !data.publicPass)) return t('required_fields');
        if ((data.adminPass && data.adminPass.length < 4) || (data.publicPass && data.publicPass.length < 4)) return t('pass_min_length');
        if (data.adminPass && data.adminPass === data.publicPass) return t('pass_mismatch');
        return '';
    };
    const single = isSingleSided(data);
    const sideDims = useSideDims(data);

    /** ذخیره در هر مرحله؛ publish=true در مرحله‌ی آخر پس از ذخیره از ویزارد خارج می‌شود. */
    const saveTenant = async (publish = false) => {
        if (isSaving) return;
        const err = validateStep1();
        if (err) { setStep(1); setStepError(err); notify(err); return; }
        if (publish && hasSideMismatch(data, sideDims) && !(await askConfirm(`ابعاد روی کارت (${sideDims.front.w}×${sideDims.front.h}) و پشت کارت (${sideDims.back.w}×${sideDims.back.h}) یکسان نیست. با همین وضعیت منتشر شود؟`, { okText: 'انتشار', title: 'مغایرت ابعاد' }))) return;
        setIsSaving(true);
        try {
            const payload = { ...data }; delete payload.hasAdminPass; delete payload.hasPublicPass;
            if (!payload.adminPass) delete payload.adminPass; if (!payload.publicPass) delete payload.publicPass;
            const result = await apiPost('save_tenant', payload);
            const saved = { ...data, id: result.id, adminPass: '', publicPass: '' };
            history.setSilently(saved);
            setPassSet(p => ({ admin: p.admin || !!data.adminPass, public: p.public || !!data.publicPass }));
            setSavedJson(JSON.stringify(stripWizardSecrets(saved)));
            removeWizardDraft(data.id); removeWizardDraft(result.id);
            setStepError('');
            if (publish) onComplete(result.id); else notifySuccess('تغییرات ذخیره شد.');
        } catch (e) { notifyError(e); if (e.field === 'slug') { setStep(1); setStepError(e.message); setTimeout(() => focusField('slug'), 100); } }
        setIsSaving(false);
    };
    const cancel = async () => {
        if (dirty && !(await askConfirm('تغییرات ذخیره‌نشده دارید. بدون ذخیره خارج می‌شوید؟', { danger: true, okText: 'خروج بدون ذخیره', cancelText: 'ماندن' }))) return;
        removeWizardDraft(data.id); onCancel();
    };
    // در حالت تک‌رو، مرحله‌ی «پشت کارت» رد می‌شود
    const activeFields = (data.fields || []).filter(f => !(single && f.side === 'back'));
    // اگر با لود بوم آماده در مرحله‌ی «پشت کارت» حالت تک‌رو شد، به مرحله‌ی طراحی برگرد
    useEffect(() => { if (single && step === 4) setStep(3); }, [single, step]);
    const stepTitle = (n) => n === 3 && single ? 'طراحی بوم' : STEPS[n - 1].title;
    const visibleSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(n => !(single && n === 4));
    /** پرش مستقیم به هر مرحله (خروج از مرحله‌ی ۱ فقط با اطلاعات هویتی معتبر). */
    const goTo = (n) => {
        if (n === step) return;
        if (step === 1 && n > 1) { const err = validateStep1(); if (err) return setStepError(err); }
        setStepError(''); setSelectedFieldId(null); setStep(n === 4 && single ? 3 : n);
    };
    const nextStep = () => { if (step === 7 && formHasErrors(getVisibleFields(data.fields, data), previewFormData, t, globalValidations)) return notify(t('fix_errors')); const i = visibleSteps.indexOf(step); goTo(visibleSteps[Math.min(i + 1, visibleSteps.length - 1)]); };
    const prevStep = () => { const i = visibleSteps.indexOf(step); goTo(visibleSteps[Math.max(i - 1, 0)]); };
    const sideEditor = (side, bgKey) => <VisualEditor side={side} bgUrl={data[bgKey]} defaultDim={getCanvasDefault(data)} fixed={isFixedCanvas(data)} bgFit={data.bgFit || 'stretch'} fields={(data.fields || []).filter(f => f.side === side)} onUpdateFields={(newFields, opts) => setData(p => ({ ...p, fields: [...(p.fields || []).filter(f => f.side !== side), ...newFields] }), opts)} onUpdateBg={(url) => setData(p => ({ ...p, [bgKey]: url }))} data={data} setData={setData} selectedId={selectedFieldId} setSelectedId={setSelectedFieldId} />;
    const passPlaceholder = (key) => (key === 'hasAdminPass' ? passSet.admin : passSet.public) ? t('pass_keep_hint') : '';

    return (
        <div className="h-screen flex flex-col w-full">
            <header className="glass border-b border-white/60 px-4 md:px-6 py-3 flex flex-wrap gap-3 justify-between items-center z-10">
                <div className="flex items-center gap-3"><button onClick={cancel} aria-label="خروج از ویزارد" title="خروج" className="p-2 hover:bg-slate-100 rounded-full"><Icon name="ArrowRight" /></button><div><h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">{isEdit ? `${t('edit')}: ${data.orgName || ''}` : t('new_org')}{dirty && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">ذخیره نشده</span>}</h2><p className="text-xs text-slate-500">{t('step')} {visibleSteps.indexOf(step) + 1} {t('from')} {visibleSteps.length}: {stepTitle(step)}</p></div></div>
                <nav aria-label="مراحل ویزارد" className="hidden lg:flex gap-1 flex-wrap">{visibleSteps.map((n, i) => {
                    // شماره‌ی مرحله داخل دایره؛ مرحله‌ی فعلی پررنگ، مراحل گذشته با دایره‌ی رنگی
                    const active = step === n; const passed = visibleSteps.indexOf(step) > i;
                    return (<button key={n} type="button" onClick={() => goTo(n)} aria-current={active ? 'step' : undefined} aria-label={`مرحله ${i + 1}: ${stepTitle(n)}`} title={stepTitle(n)} className={`flex items-center gap-1.5 ps-1 pe-2.5 py-1 rounded-full border text-[11px] transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'}`}>
                        <span aria-hidden="true" className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${active ? 'step-dot-active' : passed ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                        <span>{stepTitle(n)}</span>
                    </button>);
                })}</nav>
                <select aria-label="رفتن به مرحله" value={step} onChange={e => goTo(Number(e.target.value))} className="lg:hidden border rounded-lg px-2 py-1.5 text-sm bg-white">{visibleSteps.map((n, i) => <option key={n} value={n}>{i + 1}. {stepTitle(n)}</option>)}</select>
                <div className="flex items-center gap-2">
                    <ThemeToggle compact className="text-slate-600" /><button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="واگرد (Ctrl+Z)" title="واگرد (Ctrl+Z)" className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"><Icon name="Undo2" className="w-5 h-5" /></button>
                    <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="ازنو (Ctrl+Y)" title="ازنو (Ctrl+Y)" className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30"><Icon name="Redo2" className="w-5 h-5" /></button>
                    <button type="button" onClick={() => saveTenant(false)} disabled={isSaving || (!dirty && isEdit)} title="ذخیره (Ctrl+S)" className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Icon name="Save" className="w-4 h-4" /> {isSaving ? t('saving') : 'ذخیره'}</button>
                </div>
            </header>
            <div className="flex-1 overflow-hidden flex">
                <div className={`flex-1 overflow-y-auto relative ${step <= 5 ? 'block' : 'w-full'}`}>
                    {step === 1 && <div className="h-full flex items-center justify-center text-slate-400 p-8 text-center"><div className="space-y-4"><Icon name="Shield" className="w-16 h-16 mx-auto opacity-50" /><p>هویت سازمان، زبان پلتفرم و اتصالات (وب‌هوک) را تعیین کنید.</p></div></div>}
                    {step === 2 && <div className="h-full relative overflow-hidden"><LiquidBackground colors={themeOf(data)} fixed={false} /><div className="relative h-full flex items-center justify-center p-8 transform scale-90 origin-top"><TenantLoginPreview data={data} t={t} /></div></div>}
                    {step === 3 && sideEditor('front', 'frontBg')}
                    {step === 4 && !single && sideEditor('back', 'backBg')}
                    {step === 5 && (<div className="h-full p-6 lg:p-12 overflow-y-auto flex flex-col items-center"><div className="max-w-4xl w-full"><FormOrderEditor data={data} setData={setData} /><div className="bg-white p-6 rounded-2xl shadow-sm border mb-6 flex justify-between items-center"><div><h3 className="font-bold text-lg text-slate-800">تخصیص فونت به فیلدها</h3><p className="text-sm text-slate-500">از فونت‌های پیش‌فرض یا آپلودی استفاده کنید.</p></div></div><div className="bg-white rounded-2xl shadow-sm border overflow-hidden"><table className="w-full text-right text-sm"><thead className="bg-slate-50 border-b"><tr><th className="p-4">المان چاپی</th><th className="p-4">انتخاب فونت</th><th className="p-4">پیش‌نمایش</th><th className="p-4">حداکثر سایز (Max px)</th></tr></thead><tbody className="divide-y">{activeFields.filter(f => f.printOnCard && (f.type === 'text' || f.type === 'select' || f.type === 'date')).map(f => (<tr key={f.id} className="hover:bg-slate-50"><td className="p-4 font-bold text-slate-700">{f.label}</td><td className="p-4"><select className="border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[200px]" value={f.fontFamily || 'Vazirmatn'} onChange={e => setData(p => ({ ...p, fields: p.fields.map(df => df.id === f.id ? { ...df, fontFamily: e.target.value } : df) }))}><optgroup label="پیش‌فرض">{DEFAULT_FONTS.map(font => <option key={font} value={font}>{font}</option>)}</optgroup><optgroup label="کتابخانه مرکزی">{globalFonts.map(font => <option key={font.font_key} value={font.font_name}>{font.font_name}</option>)}</optgroup></select></td><td className="p-4"><span className="font-preview text-xl text-slate-800 whitespace-nowrap" style={{ '--preview-font': `"${f.fontFamily || 'Vazirmatn'}"`, fontWeight: f.fontWeight === 'normal' ? 400 : 700 }}>{f.label || 'نمونه متن'} ۱۲۳ Abc</span></td><td className="p-4"><input type="number" min="8" className="border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500 w-24 text-center" value={f.maxFontSize || 40} onChange={e => setData(p => ({ ...p, fields: p.fields.map(df => df.id === f.id ? { ...df, maxFontSize: Number(e.target.value) } : df) }))} /> px</td></tr>))}{activeFields.filter(f => f.printOnCard && (f.type === 'text' || f.type === 'select' || f.type === 'date')).length === 0 && <tr><td colSpan="4" className="text-center p-6 text-slate-400">فیلدی برای تنظیم فونت وجود ندارد.</td></tr>}</tbody></table></div></div></div>)}
                    {step === 6 && <div className="h-full relative overflow-hidden"><LiquidBackground colors={themeOf(data)} fixed={false} /><div className="relative h-full flex items-center justify-center p-4"><TenantLoginPreview data={data} t={t} realMode /></div></div>}
                    {step === 7 && <div className="h-full p-6"><TenantFormPreview data={data} formData={previewFormData} setFormData={setPreviewFormData} t={t} globalValidations={globalValidations} /></div>}
                    {step === 8 && (<div className="h-full p-6 flex flex-col items-center justify-center overflow-y-auto"><div className="mb-6 bg-blue-50 text-blue-700 p-4 rounded-xl border border-blue-200 text-sm max-w-2xl w-full text-center shadow-sm">پیش‌نمایش بر اساس داده‌های تستی مرحله قبل ساخته شده است.</div><CardLivePreview config={data} userData={previewFormData} showActions showcase t={t} /></div>)}
                    {step === 9 && (<div className="h-full flex flex-col p-6 overflow-y-auto"><div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border max-w-6xl mx-auto w-full"><h3 className="font-bold text-slate-800 mb-3">ترکیب ستون «نام صاحب کارت» در داشبورد</h3><div className="flex gap-2 flex-wrap">{activeFields.filter(f => f.type !== 'photo' && f.type !== 'barcode' && f.type !== 'qrcode' && f.type !== 'stars').map(f => (<label key={f.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${(data.dashboardNameFormat || []).includes(f.id) ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-50 hover:bg-slate-100'}`}><input type="checkbox" className="accent-indigo-600" checked={(data.dashboardNameFormat || []).includes(f.id)} onChange={e => setData(p => { const arr = p.dashboardNameFormat || []; return { ...p, dashboardNameFormat: e.target.checked ? [...arr, f.id] : arr.filter(id => id !== f.id) }; })} /> <span className="text-sm font-medium">{f.label}</span></label>))}</div></div><TenantDashboardPreview data={data} previewFormData={previewFormData} t={t} /></div>)}
                    {step === 10 && (<div className="h-full flex flex-col items-center justify-center text-center p-8"><div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6"><Icon name="Check" className="w-12 h-12" /></div><h2 className="text-3xl font-bold text-slate-800 mb-4">{t('platform_ready')}</h2><div className="max-w-md w-full mb-24"><SideDimsReport data={data} setData={setData} dims={sideDims} /></div></div>)}
                </div>
                {step <= 5 && (
                    <div className="w-[350px] md:w-[400px] glass-strong border-r border-white/60 z-20 flex flex-col">
                        <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                            {stepError && <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm border border-red-200 animate-pulse">{stepError}</div>}
                            {(step === 3 || step === 4) && selectedFieldId ? (<PropertiesSidebarPanel data={data} setData={setData} selectedFieldId={selectedFieldId} onDelete={() => setSelectedFieldId(null)} onSelect={setSelectedFieldId} dbPresets={dbPresets} globalValidations={globalValidations} />) : (
                                <><h3 className="font-bold text-xl text-indigo-900 border-b pb-2">{stepTitle(step)}</h3>
                                    {step === 1 && (<div className="space-y-4"><div><label className="text-sm font-bold mb-1 block">زبان پلتفرم</label><select value={data.langCode} onChange={e => setData(p => ({ ...p, langCode: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 outline-none bg-slate-50"><option value="fa">فارسی (Persian)</option><option value="en">English (انگلیسی)</option><option value="ar">العربية (عربی)</option><option value="tr">Türkçe (ترکی)</option></select></div><OutputFormatEditor data={data} setData={setData} dims={sideDims} /><TenantSettingsEditor data={data} setData={setData} /><div><label className="text-sm font-bold mb-1 block">نام سازمان</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={data.orgName} onChange={e => setData(p => ({ ...p, orgName: e.target.value }))} /></div><div id="fieldwrap-slug"><SlugEditor data={data} setData={setData} originalSlug={initialData && initialData.id ? initialData.slug : ''} /></div><div><label className="text-sm font-bold mb-1 block">{t('admin_pass')}</label><input type="password" autoComplete="new-password" placeholder={passPlaceholder('hasAdminPass')} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={data.adminPass} onChange={e => setData(p => ({ ...p, adminPass: e.target.value }))} /></div><div><label className="text-sm font-bold mb-1 block">{t('public_pass')}</label><input type="password" autoComplete="new-password" placeholder={passPlaceholder('hasPublicPass')} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" value={data.publicPass} onChange={e => setData(p => ({ ...p, publicPass: e.target.value }))} /></div><WebhookEditor webhooks={data.webhooks} onChange={(webhooks) => setData(p => ({ ...p, webhooks }))} tenantId={data.id} sampleData={previewFormData} /></div>)}
                                    {step === 2 && (<div className="space-y-4"><div><label className="text-sm font-bold mb-1 block">لوگو (آپلود از سیستم یا لینک)</label><div className="flex gap-2"><label className={`bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-center shrink-0 ${uploadingLogo ? 'opacity-50 animate-pulse' : ''}`}><Icon name="UploadCloud" /><input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; setUploadingLogo(true); const url = await uploadImageFile(f, { keepTransparency: true }); setUploadingLogo(false); if (url) setData(p => ({ ...p, logoUrl: url })); }} /></label><input className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-left" dir="ltr" value={data.logoUrl} onChange={e => setData(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." /></div></div><div><label className="text-sm font-bold mb-1 block">متن خوش‌آمدگویی سامانه</label><textarea className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32" value={data.welcomeText} onChange={e => setData(p => ({ ...p, welcomeText: e.target.value }))} /></div><ThemeEditor data={data} setData={setData} /></div>)}
                                    {(step === 3 || step === 4) && <SideDimsReport data={data} setData={setData} dims={sideDims} />}
                                    {step === 3 && <div className="text-sm text-slate-600 bg-indigo-50 p-4 rounded-xl border border-indigo-100">با استفاده از نوار ابزار در بالا، المان اضافه کنید. روی المان کلیک کنید تا تنظیمات آن باز شود و با ماوس آن را جابجا کنید.</div>}
                                    {step === 4 && <div className="text-sm text-slate-600 bg-indigo-50 p-4 rounded-xl border border-indigo-100">در صورت نیاز به چاپ اطلاعات در پشت کارت، در این قسمت المان‌ها را تنظیم کنید.</div>}
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t border-white/60 bg-white/40 flex gap-3"><button onClick={prevStep} disabled={step === 1} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50 font-bold">{t('prev_step')}</button><button onClick={nextStep} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">{t('next_step')} <Icon name="ArrowLeft" className="w-4 h-4" /></button></div>
                    </div>
                )}
            </div>
            {step >= 6 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 border z-50">
                    <button onClick={prevStep} className="text-slate-600 hover:text-indigo-600 font-bold px-4 py-2 rounded-full hover:bg-slate-100 flex items-center gap-2"><Icon name="ArrowRight" className="w-4 h-4" /> {t('prev_step')}</button><div className="w-px h-6 bg-slate-300"></div>
                    {step < 10 ? (<button onClick={nextStep} className="flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-2 rounded-full hover:bg-indigo-700 shadow-lg shadow-indigo-200">{t('next_step')} <Icon name="Check" className="w-4 h-4" /></button>) : (<button onClick={() => saveTenant(true)} disabled={isSaving} className="flex items-center gap-2 bg-green-600 text-white font-bold px-6 py-2 rounded-full hover:bg-green-700 shadow-lg shadow-green-200 disabled:opacity-70">{isSaving ? t('saving') : t('final_publish')} <Icon name="CheckCircle2" className="w-5 h-5" /></button>)}
                </div>
            )}
        </div>
    );
}

const PHOTO_PREFIX = 'data:';
/** ذخیره پیش‌نویس فرم در localStorage؛ اگر حافظه پر شد، بدون عکس‌ها ذخیره می‌کند و هرگز اپ را از کار نمی‌اندازد. */
const saveDraft = (key, draft) => {
    try { localStorage.setItem(key, JSON.stringify(draft)); return; } catch (e) { }
    try { const fd = {}; Object.entries(draft.formData || {}).forEach(([k, v]) => { if (!(typeof v === 'string' && v.startsWith(PHOTO_PREFIX))) fd[k] = v; }); localStorage.setItem(key, JSON.stringify({ ...draft, formData: fd })); } catch (e) { }
};
const removeDraft = (key) => { try { localStorage.removeItem(key); } catch (e) { } };

// --- تاریخچه‌ی کارت‌های همین دستگاه (شناسه + کلید دسترسی امضاشده‌ای که سرور هنگام صدور می‌دهد) ---
const myCardsKey = (tid) => `my_cards_${tid}`;
const readMyCards = (tid) => { try { const v = JSON.parse(localStorage.getItem(myCardsKey(tid)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const writeMyCards = (tid, list) => { try { localStorage.setItem(myCardsKey(tid), JSON.stringify(list.slice(0, 200))); } catch (e) { } };
const rememberMyCard = (tid, id, key) => writeMyCards(tid, [{ id, key }, ...readMyCards(tid).filter(c => c.id !== id)]);

const cardOwnerName = (tenant, cd) => {
    cd = cd || {}; const fmt = tenant.dashboardNameFormat;
    if (fmt && fmt.length) return fmt.map(id => cd[id] || '').join(' ').trim();
    const ft = (tenant.fields || []).find(f => f.type === 'text'); return ft ? String(cd[ft.id] || '') : '';
};
/** تاریخ/زمان سرور (میلادی) → نمایش بر اساس زبان (فارسی = شمسی). */
const formatDateTime = (str, lang) => {
    if (!str) return ''; const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return String(str);
    const [, y, mo, d, hh, mm] = m; const time = hh ? ` ${hh}:${mm}` : '';
    if (lang === 'fa') { const [jy, jm, jd] = g2j(+y, +mo, +d); return toPersianNum(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}${time}`); }
    return `${y}/${mo}/${d}${time}`;
};
const STATUS_STYLE = { active: 'bg-green-50 text-green-700 border-green-200', expired: 'bg-amber-50 text-amber-700 border-amber-200', revoked: 'bg-red-50 text-red-700 border-red-200' };
const StatusBadge = ({ status, t }) => <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${STATUS_STYLE[status] || STATUS_STYLE.active}`}>{t(`status_${status || 'active'}`)}</span>;

/** انتخاب زبان رابط کاربری برای کاربر نهایی. */
function LanguageSwitcher({ control, className = '' }) {
    if (!control || control.options.length < 2) return null;
    return (
        <label className={`inline-flex items-center gap-1.5 text-xs ${className}`}><Icon name="Languages" className="w-4 h-4" /><span className="sr-only">Language</span>
            <select value={control.value} onChange={e => control.onChange(e.target.value)} className="bg-transparent border border-current/20 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Language / زبان">
                {control.options.map(o => <option key={o.code} value={o.code} className="text-slate-800">{o.name}</option>)}
            </select>
        </label>
    );
}

function CardPreviewModal({ tenant, card, t, onClose, showcase = false }) {
    useEscape(onClose);
    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div role="dialog" aria-modal="true" aria-label={t('preview_card')} className="glass-strong rounded-3xl p-6 w-full max-w-5xl flex flex-col items-center my-8">
                <div className="w-full flex justify-between items-center mb-6 border-b border-slate-200 pb-4"><h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">{t('preview_card')} {card.status && <StatusBadge status={card.status} t={t} />}</h3><button onClick={onClose} aria-label={t('close')} className="p-2 bg-slate-200 hover:bg-slate-300 rounded-full"><Icon name="X" className="w-5 h-5" /></button></div>
                <CardLivePreview config={tenant} userData={card.cardData || {}} showActions showcase={showcase} t={t} />
            </div>
        </div>
    );
}

function MyCardsModal({ tenant, t, lang, onClose, onEdit }) {
    useEscape(onClose);
    const [cards, setCards] = useState(null); const [preview, setPreview] = useState(null);
    useEffect(() => {
        const list = readMyCards(tenant.id); if (!list.length) { setCards([]); return; }
        apiPost('get_my_cards', { tenantId: tenant.id, cards: list }).then(d => {
            const arr = Array.isArray(d) ? d : []; setCards(arr);
            const alive = new Set(arr.map(c => c.id)); writeMyCards(tenant.id, list.filter(c => alive.has(c.id))); // کارت‌های حذف‌شده از فهرست پاک می‌شوند
        }).catch(e => { notifyError(e); setCards([]); });
    }, []);
    const open = async (card, mode) => { try { const full = await apiGet('get_card_full', { id: card.id }); if (mode === 'edit') onEdit(full); else setPreview(full); } catch (e) { notifyError(e); } };
    const forget = async (card) => { if (!(await askConfirm(t('forget_card_confirm'), { okText: t('forget_card'), cancelText: t('cancel') }))) return; writeMyCards(tenant.id, readMyCards(tenant.id).filter(c => c.id !== card.id)); setCards(p => p.filter(c => c.id !== card.id)); };
    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            {preview && <CardPreviewModal tenant={tenant} card={preview} t={t} showcase onClose={() => setPreview(null)} />}
            <div role="dialog" aria-modal="true" aria-label={t('my_cards')} className="glass-strong rounded-3xl w-full max-w-3xl my-8 p-6">
                <div className="flex justify-between items-center border-b pb-4 mb-4"><h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Icon name="History" className="w-5 h-5" /> {t('my_cards')}</h3><button onClick={onClose} aria-label={t('close')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-5 h-5" /></button></div>
                <p className="text-xs text-slate-500 mb-4">{t('my_cards_hint')}</p>
                {cards === null ? <p className="text-center py-10 text-slate-500">{t('loading')}</p> : cards.length === 0 ? <p className="text-center py-10 text-slate-400">{t('no_records')}</p> : (
                    <ul className="divide-y border rounded-2xl">{cards.map(c => (
                        <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                            <div className="flex-1 min-w-[180px]"><p className="font-bold text-slate-800">{cardOwnerName(tenant, c.cardData) || c.requesterName}</p><p className="text-xs text-slate-500"><span dir="auto">{formatDateTime(c.issuedAt, lang)}</span> — {t('requester')}: {c.requesterName}</p></div>
                            <StatusBadge status={c.status} t={t} />
                            <div className="flex gap-1">
                                <button type="button" onClick={() => open(c, 'view')} className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold">{t('view_print')}</button>
                                <button type="button" onClick={() => open(c, 'edit')} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-bold">{t('edit')}</button>
                                <button type="button" onClick={() => forget(c)} aria-label={`${t('forget_card')}: ${c.requesterName}`} title={t('forget_card')} className="text-xs text-slate-400 hover:text-red-600 px-2 py-1.5 rounded-lg"><Icon name="X" className="w-4 h-4" /></button>
                            </div>
                        </li>
                    ))}</ul>
                )}
            </div>
        </div>
    );
}

/** مقدار خالی برای بررسی «الزامی» (تاریخ ناقص هم خالی حساب می‌شود). */
const isEmptyValue = (f, v) => f.type === 'date' ? !/^\d+\/\d+\/\d+$/.test(v || '') : !(v !== undefined && v !== null && String(v).trim());
const needsInput = (f) => !f.autoIncrement && !(f.type === 'text' && f.linkedFieldId) && !(f.type === 'stars' && f.litSource === 'issued');
/** اولین فیلد نامعتبر فرم (خطای اعتبارسنجی، المان ستاره‌ی خالی، یا فیلد الزامی خالی). */
const findFirstInvalid = (fields, formData, t, globalValidations) => {
    for (const f of fields) {
        if (!needsInput(f)) continue;
        const v = formData[f.id]; const err = getFieldError(f, v, t, globalValidations);
        if (err) return { field: f, message: `${f.label}: ${err}` };
        if (f.type === 'stars' && isEmptyValue(f, v)) return { field: f, message: `${t('stars_required')} ${f.label}` };
        if (f.required && isEmptyValue(f, v)) return { field: f, message: t('field_required', f.label) };
    }
    return null;
};
/** اسکرول و فوکوس روی فیلد، همراه با برجسته‌سازی کوتاه. */
const focusField = (id) => {
    const el = document.getElementById(`fieldwrap-${id}`); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('field-flash'); void el.offsetWidth; el.classList.add('field-flash');
    const input = el.querySelector('input:not([type=file]):not([readonly]), select, textarea');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 350);
};

function TenantForm({ tenant, t, lang, langControl, globalValidations, onLogout }) {
    const [formData, setFormData] = useState({}); const [requesterName, setRequesterName] = useState(''); const [isIssued, setIsIssued] = useState(false); const [isSubmitting, setIsSubmitting] = useState(false); const [inputWarnings, setInputWarnings] = useState({}); const [customSelects, setCustomSelects] = useState({}); const [issuedCardId, setIssuedCardId] = useState(null);
    const [showMissing, setShowMissing] = useState(false); const [showMyCards, setShowMyCards] = useState(false); const [myCount, setMyCount] = useState(() => readMyCards(tenant.id).length);
    const draftKey = `tenant_${tenant.id}_draft`;
    const { handlePhotoUpload, cropModal } = usePhotoCrop(setFormData);
    useEffect(() => { try { const saved = localStorage.getItem(draftKey); if (saved) { const parsed = JSON.parse(saved); if (parsed.formData) setFormData(parsed.formData); if (parsed.reqName) setRequesterName(parsed.reqName); if (parsed.customs) setCustomSelects(parsed.customs); } } catch (e) { } }, [tenant.id]);
    useEffect(() => { if (!isIssued && !issuedCardId) saveDraft(draftKey, { formData, reqName: requesterName, customs: customSelects }); }, [formData, requesterName, customSelects, isIssued, issuedCardId]);
    const resetForm = () => { setFormData({}); setRequesterName(''); setCustomSelects({}); setIssuedCardId(null); setShowMissing(false); removeDraft(draftKey); };
    const clearForm = async () => { if (await askConfirm(t('clear_confirm'), { danger: true, okText: t('clear_form'), cancelText: t('cancel') })) resetForm(); };
    const visibleFields = getVisibleFields(tenant.fields, tenant);
    const closed = tenant.closedReason;

    const handleIssue = async () => {
        if (closed) return notify(closed);
        if (!requesterName.trim()) { setShowMissing(true); notify(t('req_name_empty')); return focusField('_requester'); }
        const bad = findFirstInvalid(visibleFields, formData, t, globalValidations);
        if (bad) { setShowMissing(true); notify(bad.message); return focusField(bad.field.id); }
        setIsSubmitting(true);
        const fontsLoaded = await ensureFonts(collectFontFamilies(tenant), tenant.customFonts);
        const finalCardData = { ...formData, _fontError: !fontsLoaded };
        try {
            // اگر این کارت قبلاً صادر شده (ویرایش)، همان کارت به‌روزرسانی می‌شود نه کارت جدید
            const result = issuedCardId
                ? await apiPost('update_card', { id: issuedCardId, requesterName, cardData: finalCardData })
                : await apiPost('save_card', { tenantId: tenant.id, requesterName, cardData: finalCardData });
            if (result.id) { setIssuedCardId(result.id); if (result.accessKey) { rememberMyCard(tenant.id, result.id, result.accessKey); setMyCount(readMyCards(tenant.id).length); } }
            if (result.cardData) setFormData(result.cardData); // شامل سریال و اطلاعات تعیین‌شده توسط سرور
            removeDraft(draftKey); setShowMissing(false); setIsIssued(true);
        } catch (err) { notifyError(err, t('error_server')); if (err.field) { setShowMissing(true); focusField(err.field); } }
        setIsSubmitting(false);
    };
    const editExisting = (full) => {
        const cd = full.cardData || {}; const customs = {};
        (tenant.fields || []).filter(f => f.type === 'select' && f.hasOtherOption).forEach(f => { if (cd[f.id] && !(f.options || []).find(o => o.display === cd[f.id])) customs[f.id] = true; });
        setFormData(cd); setRequesterName(full.requesterName || ''); setCustomSelects(customs); setIssuedCardId(full.id); setIsIssued(false); setShowMyCards(false);
        notify(t('editing_issued_card'), 'info');
    };
    const myCardsButton = (cls) => <button type="button" onClick={() => setShowMyCards(true)} className={cls}><Icon name="History" className="w-4 h-4" /> {t('my_cards')}{myCount > 0 && <span className="bg-indigo-600 text-white rounded-full px-2 text-[10px]">{myCount}</span>}</button>;
    const myCardsModal = showMyCards && <MyCardsModal tenant={tenant} t={t} lang={lang} onClose={() => { setShowMyCards(false); setMyCount(readMyCards(tenant.id).length); }} onEdit={editExisting} />;

    if (isIssued) return (<div className="min-h-screen p-4 md:p-8 flex flex-col items-center">{myCardsModal}<header className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 print:hidden"><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">{t('card_issued')}<ThemeToggle t={t} compact className="text-slate-500" /></h2><div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">{myCardsButton('flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-bold')}<button onClick={() => setIsIssued(false)} className="bg-white border-2 border-indigo-100 text-indigo-700 hover:bg-indigo-50 px-6 py-2.5 rounded-xl font-bold shadow-sm">{t('edit_this_card')}</button><button onClick={() => { setIsIssued(false); resetForm(); }} className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-2.5 rounded-xl font-bold shadow-md">{t('issue_new_card')}</button></div></header><CardLivePreview config={tenant} userData={formData} showActions showcase t={t} /><BrandingFooter /></div>);

    const isRtl = document.documentElement.dir === 'rtl';
    return (
        <div className="min-h-screen flex flex-col md:flex-row">
            {cropModal(t)}{myCardsModal}
            <div className="md:w-1/3 glass border-l border-white/60 p-8 flex flex-col items-center text-center z-10 relative">
                <div className={`absolute top-4 ${isRtl ? 'right-4' : 'left-4'} flex items-center gap-3 text-slate-500`}><button onClick={onLogout} aria-label={t('logout')} title={t('logout')} className="hover:text-red-500"><Icon name="LogOut" className="w-5 h-5" /></button><ThemeToggle t={t} compact /><LanguageSwitcher control={langControl} /></div>
                <div className="flex-1 flex flex-col items-center justify-center w-full mt-10"><LogoImg src={tenant.logoUrl} alt="" className="w-32 h-32 object-contain mb-6 rounded-2xl shadow-sm" /><h1 className="text-3xl font-bold text-slate-800 mb-4">{tenant.orgName}</h1><p className="text-slate-500 leading-relaxed">{tenant.welcomeText}</p></div>
                <div className="mt-auto pt-8 border-t border-slate-100 w-full"><BrandingFooter /></div>
            </div>
            <div className="flex-1 p-4 md:p-12 overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-8 glass-strong p-6 md:p-8 rounded-3xl">
                    {closed && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-bold">{closed}</div>}
                    {issuedCardId && <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl p-3 text-sm flex flex-wrap justify-between items-center gap-2"><span>{t('editing_issued_card')}</span><button type="button" onClick={resetForm} className="text-xs font-bold underline">{t('issue_new_card')}</button></div>}
                    <div className="flex flex-wrap gap-2 justify-between items-center mb-2 print:hidden"><h3 className="font-bold text-xl text-slate-800 flex items-center gap-2"><Icon name="ClipboardList" className="w-5 h-5 text-slate-400" /> {t('form_title')}</h3><div className="flex gap-1">{myCardsButton('text-xs text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1')}<button onClick={clearForm} className="text-xs text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-bold flex items-center gap-1"><Icon name="RefreshCcw" className="w-3.5 h-3.5" /> {t('clear_form')}</button></div></div>
                    <div id="fieldwrap-_requester" className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100"><label htmlFor="requester-input" className="block text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2"><Icon name="Users" className="w-4 h-4" /> {t('requester_name')} <span className="text-red-500" aria-hidden="true">*</span></label><input id="requester-input" type="text" required aria-required="true" aria-invalid={showMissing && !requesterName.trim()} value={requesterName} onChange={e => setRequesterName(e.target.value)} className={`w-full border-none shadow-inner rounded-xl px-4 py-3 bg-white ${showMissing && !requesterName.trim() ? 'ring-2 ring-red-400' : ''}`} placeholder={t('requester_placeholder')} />{showMissing && !requesterName.trim() && <p className="text-red-500 text-xs mt-1">{t('req_name_empty')}</p>}</div>
                    <SharedFieldsRenderer formData={formData} setFormData={setFormData} inputWarnings={inputWarnings} setInputWarnings={setInputWarnings} handlePhotoUpload={handlePhotoUpload} visibleFields={visibleFields} customSelects={customSelects} setCustomSelects={setCustomSelects} t={t} globalValidations={globalValidations} showMissing={showMissing} />
                    <button onClick={handleIssue} disabled={isSubmitting || !!closed} className="w-full mt-8 btn-grad py-4 rounded-2xl font-bold text-lg hover:scale-[1.01] transition-all flex items-center justify-center gap-2"> {isSubmitting ? t('processing') : (issuedCardId ? t('save_changes') : t('submit_issue'))} <Icon name={isRtl ? "ArrowLeft" : "ArrowRight"} className="w-5 h-5" /> </button>
                </div>
            </div>
        </div>
    );
}

/** نسخه سبک کارت برای فهرست داشبورد (بدون داده‌ی تصویر). */
const lightenCard = (card) => { const cd = {}; Object.entries(card.cardData || {}).forEach(([k, v]) => { cd[k] = typeof v === 'string' && v.startsWith(PHOTO_PREFIX) ? '[IMAGE]' : v; }); return { ...card, cardData: cd }; };
const cardSearchText = (c) => normalizeFa([c.id, c.requesterName, c.issuedAt, ...Object.entries(c.cardData || {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v !== '[IMAGE]').map(([, v]) => v)].join(' ').toLowerCase());

/** رندر هر دو روی کارت (یا یک رو در حالت تک‌رو) برای خروجی گروهی. */
const renderCardCanvases = async (tenant, cardData) => {
    await ensureFonts(collectFontFamilies(tenant), tenant.customFonts);
    const ac = findActiveCondition(tenant.conditions, cardData);
    const common = { config: tenant, userData: cardData, showActions: true, activeCondition: ac };
    const front = await renderCardSide({ ...common, side: 'front', bgUrl: (ac && ac.newFrontBg) || tenant.frontBg, baseBgUrl: tenant.frontBg });
    if (isSingleSided(tenant)) return [front];
    const back = await renderCardSide({ ...common, side: 'back', bgUrl: (ac && ac.newBackBg) || tenant.backBg, baseBgUrl: tenant.backBg });
    return [front, back];
};
const canvasBlob = (c, type = 'image/jpeg') => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('blob')), type, 0.92));
const safeFileName = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'card';

function TenantDashboard({ tenant, t, lang, langControl, globalValidations, onLogout }) {
    const [cards, setCards] = useState([]); const [loading, setLoading] = useState(true); const [searchTerm, setSearchTerm] = useState(''); const [showSettings, setShowSettings] = useState(false); const [passwords, setPasswords] = useState({ adminPass: '', publicPass: '' }); const [settingsError, setSettingsError] = useState(''); const [previewCard, setPreviewCard] = useState(null); const [editingCard, setEditingCard] = useState(null);
    const [currentPage, setCurrentPage] = useState(1); const [perPage, setPerPage] = useState(20);
    const [sort, setSort] = useState({ key: 'issuedAt', dir: 'desc' }); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState(''); const [statusFilter, setStatusFilter] = useState('');
    const [selected, setSelected] = useState(() => new Set()); const [bulk, setBulk] = useState(null); const [showAudit, setShowAudit] = useState(false);
    const [view, setView] = useState('list'); // list | reports
    useEscape(() => { setShowSettings(false); setSettingsError(''); }, showSettings);
    const loadCards = () => { setLoading(true); apiGet('get_cards', { tenant_id: tenant.id }).then(d => setCards(Array.isArray(d) ? d : [])).catch(e => { setCards([]); notifyError(e); }).finally(() => setLoading(false)); };
    useEffect(loadCards, [tenant.id]);

    const saveSettings = async () => {
        const { adminPass, publicPass } = passwords;
        if (!adminPass && !publicPass) return setSettingsError(t('required_fields'));
        if ((adminPass && adminPass.length < 4) || (publicPass && publicPass.length < 4)) return setSettingsError(t('pass_min_length'));
        if (adminPass && adminPass === publicPass) return setSettingsError(t('pass_mismatch'));
        try { await apiPost('change_tenant_passwords', { tenantId: tenant.id, adminPass, publicPass }); notifySuccess(t('success_save')); setShowSettings(false); setPasswords({ adminPass: '', publicPass: '' }); setSettingsError(''); }
        catch (e) { setSettingsError(e.message); }
    };
    const deleteCard = async (c) => { if (!(await askConfirm(t('delete_confirm'), { danger: true, okText: t('delete'), cancelText: t('cancel') }))) return; try { await apiPost('delete_card', { id: c.id }); setCards(prev => prev.filter(x => x.id !== c.id)); setSelected(p => { const n = new Set(p); n.delete(c.id); return n; }); notifySuccess(t('deleted')); } catch (e) { notifyError(e); } };
    const openPreview = async (card) => { try { setPreviewCard(await apiGet('get_card_full', { id: card.id })); } catch (e) { notifyError(e); } };
    const openEdit = async (card) => { try { setEditingCard(await apiGet('get_card_full', { id: card.id })); } catch (e) { notifyError(e); } };
    const applyStatus = (id, res) => setCards(prev => prev.map(c => c.id === id ? lightenCard({ ...c, status: res.status, expiresAt: (res.cardData || {})._exp || null, cardData: res.cardData || c.cardData }) : c));
    const toggleRevoke = async (c) => {
        const revoke = c.status !== 'revoked';
        if (revoke && !(await askConfirm(t('revoke_confirm'), { danger: true, okText: t('revoke'), cancelText: t('cancel') }))) return;
        try { applyStatus(c.id, await apiPost('set_card_status', { id: c.id, revoked: revoke })); notifySuccess(revoke ? t('status_revoked') : t('status_active')); } catch (e) { notifyError(e); }
    };
    const changeExpiry = async (c) => {
        const v = await askPrompt(t('set_expiry_prompt'), c.expiresAt || '', { inputType: 'date', title: t('expires_at'), dir: 'ltr' });
        if (v === null) return;
        try { applyStatus(c.id, await apiPost('set_card_status', { id: c.id, expiresAt: v })); notifySuccess(t('success_save')); } catch (e) { notifyError(e); }
    };

    // --- فیلتر، مرتب‌سازی، صفحه‌بندی ---
    const ownerOf = (c) => cardOwnerName(tenant, c.cardData);
    const normSearch = normalizeFa(searchTerm.trim().toLowerCase());
    const filteredCards = useMemo(() => {
        let list = cards.filter(c => (!normSearch || cardSearchText(c).includes(normSearch)) && (!statusFilter || (c.status || 'active') === statusFilter) && (!dateFrom || String(c.issuedAt).slice(0, 10) >= dateFrom) && (!dateTo || String(c.issuedAt).slice(0, 10) <= dateTo));
        const val = (c) => sort.key === 'owner' ? ownerOf(c) : sort.key === 'requester' ? c.requesterName : sort.key === 'status' ? (c.status || 'active') : String(c.issuedAt);
        list = [...list].sort((a, b) => { const r = String(val(a)).localeCompare(String(val(b)), 'fa'); return sort.dir === 'asc' ? r : -r; });
        return list;
    }, [cards, normSearch, statusFilter, dateFrom, dateTo, sort]);
    const totalPages = Math.max(1, Math.ceil(filteredCards.length / perPage)); const paginatedCards = filteredCards.slice((currentPage - 1) * perPage, currentPage * perPage);
    useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages]);
    useEffect(() => { setCurrentPage(1); }, [normSearch, statusFilter, dateFrom, dateTo, perPage]);
    const sortBtn = (key, label, cls = '') => (<th className={`py-3 px-4 font-medium ${cls}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))} className="inline-flex items-center gap-1 hover:text-indigo-700">{label}{sort.key === key && <Icon name={sort.dir === 'asc' ? 'ChevronUp' : 'ChevronDown'} className="w-3.5 h-3.5" />}</button></th>);

    // --- انتخاب و عملیات گروهی ---
    const allFilteredSelected = filteredCards.length > 0 && filteredCards.every(c => selected.has(c.id));
    const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filteredCards.map(c => c.id)));
    const toggleOne = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const selectedCards = filteredCards.filter(c => selected.has(c.id));
    const bulkDelete = async () => {
        if (!(await askConfirm(t('bulk_delete_confirm', selectedCards.length), { danger: true, okText: t('delete'), cancelText: t('cancel') }))) return;
        try { const r = await apiPost('delete_cards', { tenantId: tenant.id, ids: selectedCards.map(c => c.id) }); const gone = new Set(selectedCards.map(c => c.id)); setCards(p => p.filter(c => !gone.has(c.id))); setSelected(new Set()); notifySuccess(t('bulk_deleted', r.deleted)); } catch (e) { notifyError(e); }
    };
    /** رندر کارت‌های انتخاب‌شده یکی‌یکی (با نمایش پیشرفت) و ساخت ZIP تصاویر یا PDF چندصفحه‌ای. */
    const bulkExport = async (kind) => {
        const list = selectedCards; if (!list.length) return;
        setBulk({ kind, done: 0, total: list.length });
        try {
            const zip = kind === 'zip' ? new JSZip() : null; const pdfCanvases = [];
            for (let i = 0; i < list.length; i++) {
                const full = await apiGet('get_card_full', { id: list[i].id });
                const canvases = await renderCardCanvases(tenant, full.cardData || {});
                const base = `${String(i + 1).padStart(3, '0')}_${safeFileName(ownerOf(full) || full.requesterName)}`;
                if (zip) { for (let k = 0; k < canvases.length; k++) zip.file(`${base}${canvases.length > 1 ? (k === 0 ? '_front' : '_back') : ''}.jpg`, await canvasBlob(canvases[k])); }
                else pdfCanvases.push(...canvases);
                setBulk({ kind, done: i + 1, total: list.length });
            }
            const stamp = new Date().toISOString().slice(0, 10);
            if (zip) downloadBlob(await zip.generateAsync({ type: 'blob' }), `Cards_${safeFileName(tenant.orgName)}_${stamp}.zip`);
            else downloadBlob(canvasesToPdf(pdfCanvases, { printW: Number(tenant.printW) || 0, printH: Number(tenant.printH) || 0 }), `Cards_${safeFileName(tenant.orgName)}_${stamp}.pdf`);
            notifySuccess(t('export_done', list.length));
        } catch (e) { notifyError(e, t('bg_cors_error')); }
        setBulk(null);
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col relative">
            {showSettings && (<div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label={t('settings_panel')} className="glass-strong rounded-3xl p-8 w-full max-w-md"><h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-900"><Icon name="Settings" /> {t('settings_panel')}</h3>{settingsError && <div role="alert" className="bg-red-100 text-red-700 p-3 rounded-xl text-sm border border-red-200 mb-4">{settingsError}</div>}<div className="space-y-4"><div><label htmlFor="np-admin" className="block text-sm font-bold text-slate-700 mb-2">{t('new_admin_pass')}</label><input id="np-admin" type="password" autoComplete="new-password" placeholder={t('pass_keep_hint')} value={passwords.adminPass} onChange={e => setPasswords({ ...passwords, adminPass: e.target.value })} className="w-full border rounded-xl px-4 py-3" /></div><div><label htmlFor="np-public" className="block text-sm font-bold text-slate-700 mb-2">{t('new_public_pass')}</label><input id="np-public" type="password" autoComplete="new-password" placeholder={t('pass_keep_hint')} value={passwords.publicPass} onChange={e => setPasswords({ ...passwords, publicPass: e.target.value })} className="w-full border rounded-xl px-4 py-3" /></div></div><div className="flex gap-3 mt-8"><button onClick={() => { setShowSettings(false); setSettingsError(''); setPasswords({ adminPass: '', publicPass: '' }); }} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">{t('cancel')}</button><button onClick={saveSettings} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md">{t('save_changes')}</button></div></div></div>)}
            {editingCard && <AdminCardEditModal tenant={tenant} card={editingCard} onClose={() => setEditingCard(null)} onSave={(updatedCard) => { setCards(prev => prev.map(c => c.id === updatedCard.id ? lightenCard({ ...c, ...updatedCard }) : c)); setEditingCard(null); notifySuccess(t('success_save')); }} t={t} globalValidations={globalValidations} />}
            {previewCard && <CardPreviewModal tenant={tenant} card={previewCard} t={t} onClose={() => setPreviewCard(null)} />}
            {showAudit && <AuditLogModal tenantId={tenant.id} t={t} lang={lang} onClose={() => setShowAudit(false)} />}
            {bulk && <div role="status" aria-live="polite" className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl"><p className="font-bold text-slate-800 mb-3">{t('export_progress', bulk.done, bulk.total)}</p><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${(bulk.done / bulk.total) * 100}%` }} /></div></div></div>}

            <header className="max-w-6xl mx-auto w-full glass rounded-2xl p-4 md:p-6 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4"><div className="flex items-center gap-4"><LogoImg src={tenant.logoUrl} alt="" className="w-12 h-12 object-contain bg-slate-50 rounded-lg p-1" /><div><h1 className="text-2xl font-bold text-slate-800">{t('dashboard_title')}</h1><p className="text-sm text-slate-500">{tenant.orgName} — {t('history_subtitle')}</p></div></div><div className="flex flex-wrap gap-2 justify-center items-center"><ThemeToggle t={t} /><LanguageSwitcher control={langControl} className="text-slate-600" /><button onClick={() => exportToCSV(selectedCards.length ? selectedCards : filteredCards, tenant, t)} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl font-bold"><Icon name="FileSpreadsheet" className="w-4 h-4" /> {t('export_excel')}</button><button onClick={() => setShowAudit(true)} className="flex items-center gap-2 text-slate-600 bg-slate-100 px-4 py-2 rounded-xl font-bold"><Icon name="ScrollText" className="w-4 h-4" /> {t('activity_log')}</button><button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-slate-600 bg-slate-100 px-4 py-2 rounded-xl font-bold"><Icon name="Settings" className="w-4 h-4" /> {t('settings')}</button><button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-500 bg-slate-100 px-4 py-2 rounded-xl font-bold"><Icon name="LogOut" className="w-4 h-4" /> {t('logout')}</button></div></header>
            {tenant.closedReason && <div role="alert" className="max-w-6xl mx-auto w-full mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm font-bold">{tenant.closedReason} {t('admin_view_only')}</div>}
            <div role="tablist" aria-label={t('dashboard_title')} className="view-toggle max-w-6xl mx-auto w-full mb-4 flex"><div className="inline-flex glass rounded-xl p-1">{[['list', 'List', t('card_list')], ['reports', 'ChartColumn', t('reports')]].map(([v, ic, lb]) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-slate-600"><Icon name={ic} className="w-4 h-4" /> {lb}</button>)}</div></div>
            {view === 'reports' && <div className="max-w-6xl mx-auto w-full flex-1 mb-8"><ReportsPanel tenant={tenant} cards={cards} loading={loading} t={t} lang={lang} Icon={Icon} formatDate={formatDateTime} /></div>}
            <div className={`max-w-6xl mx-auto w-full flex-1 flex flex-col ${view === 'list' ? '' : 'hidden'}`}><div className="glass-strong rounded-3xl overflow-hidden mb-8 flex-1 flex flex-col">
                <div className="p-4 md:p-6 border-b border-white/60 bg-white/30 space-y-3">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3"><h2 className="font-bold text-lg text-slate-800">{t('history_count')} ({toPersianNum(filteredCards.length)}{filteredCards.length !== cards.length ? ` / ${toPersianNum(cards.length)}` : ''})</h2><div className="relative w-full md:w-auto"><Icon name="Search" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" aria-label={t('search')} placeholder={t('search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-4 pr-10 py-2 border rounded-xl text-sm w-full md:w-72" /></div></div>
                    <div className="flex flex-wrap gap-3 items-end text-sm">
                        <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('date_from')}</span><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded-lg px-2 py-1.5" dir="ltr" /></label>
                        <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('date_to')}</span><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded-lg px-2 py-1.5" dir="ltr" /></label>
                        <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">{t('status')}</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">{t('all')}</option><option value="active">{t('status_active')}</option><option value="expired">{t('status_expired')}</option><option value="revoked">{t('status_revoked')}</option></select></label>
                        {(dateFrom || dateTo || statusFilter || searchTerm) && <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setSearchTerm(''); }} className="text-xs text-indigo-700 font-bold underline pb-2">{t('clear_filters')}</button>}
                        {(dateFrom || dateTo) && <span className="text-[11px] text-slate-500 pb-2">{dateFrom && formatDateTime(dateFrom, lang)}{dateFrom && dateTo && ' ← '}{dateTo && formatDateTime(dateTo, lang)}</span>}
                    </div>
                    {selected.size > 0 && (
                        <div className="flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl p-2 text-sm" role="toolbar" aria-label={t('bulk_actions')}>
                            <span className="font-bold text-indigo-900 px-2">{t('selected_count', selectedCards.length)}</span>
                            <button type="button" onClick={() => bulkExport('zip')} className="bg-white border px-3 py-1.5 rounded-lg font-bold text-indigo-700 flex items-center gap-1"><Icon name="FileArchive" className="w-4 h-4" /> {t('bulk_zip')}</button>
                            <button type="button" onClick={() => bulkExport('pdf')} className="bg-white border px-3 py-1.5 rounded-lg font-bold text-indigo-700 flex items-center gap-1"><Icon name="FileText" className="w-4 h-4" /> {t('bulk_pdf')}</button>
                            <button type="button" onClick={() => exportToCSV(selectedCards, tenant, t)} className="bg-white border px-3 py-1.5 rounded-lg font-bold text-indigo-700 flex items-center gap-1"><Icon name="FileSpreadsheet" className="w-4 h-4" /> CSV</button>
                            <button type="button" onClick={bulkDelete} className="bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg font-bold text-red-600 flex items-center gap-1"><Icon name="Trash2" className="w-4 h-4" /> {t('delete')}</button>
                            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-500 underline mr-auto">{t('clear_selection')}</button>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-right"><thead className="bg-white/50 text-slate-500 text-sm"><tr><th className="py-3 px-4 w-10"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label={t('select_all')} className="accent-indigo-600 w-4 h-4" /></th><th className="py-3 px-4 font-medium">{t('row_num')}</th>{sortBtn('owner', t('card_owner'))}{sortBtn('requester', t('requester'))}{sortBtn('issuedAt', t('issue_date'))}{sortBtn('status', t('status'), 'text-center')}<th className="py-3 px-4 font-medium text-center">{t('actions')}</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? <tr><td colSpan="7" className="text-center py-8 text-slate-500">{t('loading')}</td></tr> : paginatedCards.length === 0 ? <tr><td colSpan="7" className="text-center py-8 text-slate-500">{t('no_records')}</td></tr> : paginatedCards.map((c, index) => {
                                const globalIndex = (currentPage - 1) * perPage + index + 1; const cd = c.cardData || {};
                                return (
                                    <tr key={c.id} className={`hover:bg-white/60 transition-colors ${selected.has(c.id) ? 'bg-indigo-50/60' : ''}`}><td className="py-3 px-4"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`${t('select')} ${ownerOf(c) || c.requesterName}`} className="accent-indigo-600 w-4 h-4" /></td><td className="py-3 px-4 text-sm font-mono text-slate-400">#{globalIndex}</td><td className="py-3 px-4 font-bold text-indigo-900">{ownerOf(c) || '-'}</td><td className="py-3 px-4 text-sm text-slate-600">{c.requesterName}</td><td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap" dir="auto">{formatDateTime(c.issuedAt, lang)}{c.expiresAt && <span className="block text-[10px] text-slate-400">{t('expires_at')}: {formatDateTime(c.expiresAt, lang)}</span>}</td><td className="py-3 px-4 text-center"><StatusBadge status={c.status} t={t} />{cd._fontError && <span className="block mt-1 text-[10px] text-red-600 font-bold">{t('font_err')}</span>}</td><td className="py-3 px-4"><div className="flex items-center justify-center gap-1"><button onClick={() => openPreview(c)} title={t('view_print')} aria-label={`${t('view_print')}: ${ownerOf(c) || c.requesterName}`} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Icon name="Eye" className="w-4 h-4" /></button><button onClick={() => openEdit(c)} title={t('edit_info')} aria-label={`${t('edit_info')}: ${ownerOf(c) || c.requesterName}`} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Icon name="Edit2" className="w-4 h-4" /></button><button onClick={() => changeExpiry(c)} title={t('expires_at')} aria-label={`${t('expires_at')}: ${ownerOf(c) || c.requesterName}`} className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Icon name="CalendarClock" className="w-4 h-4" /></button><button onClick={() => toggleRevoke(c)} title={c.status === 'revoked' ? t('restore') : t('revoke')} aria-label={`${c.status === 'revoked' ? t('restore') : t('revoke')}: ${ownerOf(c) || c.requesterName}`} className={`p-2 rounded-lg ${c.status === 'revoked' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}><Icon name={c.status === 'revoked' ? 'RotateCcw' : 'Ban'} className="w-4 h-4" /></button><button onClick={() => deleteCard(c)} title={t('delete_record')} aria-label={`${t('delete_record')}: ${ownerOf(c) || c.requesterName}`} className="p-2 bg-red-50 text-red-600 rounded-lg"><Icon name="Trash2" className="w-4 h-4" /></button></div></td></tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-white/60 bg-white/40 flex flex-wrap justify-center items-center gap-4 print:hidden">
                    <label className="text-xs text-slate-500 flex items-center gap-1">{t('per_page')}<select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className="border rounded px-1 py-0.5">{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
                    {totalPages > 1 && <><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label={t('prev_page')} className="p-2 bg-white rounded-lg border shadow-sm hover:bg-slate-100 disabled:opacity-50"><Icon name="ChevronRight" /></button><span className="text-sm font-bold text-slate-600">{t('page_of', currentPage, totalPages)}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label={t('next_page')} className="p-2 bg-white rounded-lg border shadow-sm hover:bg-slate-100 disabled:opacity-50"><Icon name="ChevronLeft" /></button></>}
                </div>
            </div>
            </div><BrandingFooter />
        </div>
    );
}

// ==========================================
// 7. ROOT APP COMPONENT (CardPlatform)
// ==========================================
/** صفحه‌ی عمومی استعلام اعتبار کارت (لینک QR «استعلام اعتبار»). */
function VerifyPage({ code, dicts }) {
    const [res, setRes] = useState(null); const [err, setErr] = useState('');
    useEffect(() => { apiGet('verify_card', { code }).then(setRes).catch(e => setErr(e.message)); }, [code]);
    const lang = (res && res.langCode) || 'fa'; const t = getT(dicts, lang);
    useEffect(() => { const rtl = lang === 'fa' || lang === 'ar'; document.documentElement.dir = rtl ? 'rtl' : 'ltr'; document.documentElement.lang = lang; }, [lang]);
    const icon = { active: ['CheckCircle2', 'text-green-600 bg-green-100'], expired: ['Clock', 'text-amber-600 bg-amber-100'], revoked: ['XCircle', 'text-red-600 bg-red-100'] };
    return (
        <main className="min-h-screen flex items-center justify-center p-4 relative">
            <LiquidBackground colors={res && res.theme ? res.theme : undefined} />
            <div className="glass-strong rounded-3xl p-8 w-full max-w-md text-center relative z-10">
                <h1 className="text-lg font-bold text-slate-500 mb-6">{t('verify_title')}</h1>
                {!res && !err && <p className="text-slate-500 animate-pulse">{t('loading')}</p>}
                {err && <div role="alert"><div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-red-600 bg-red-100 mb-4"><Icon name="XCircle" className="w-12 h-12" /></div><p className="font-bold text-red-700">{t('verify_not_found')}</p></div>}
                {res && (<>
                    {res.logoUrl && <img src={res.logoUrl} alt="" className="w-16 h-16 mx-auto object-contain mb-2" />}
                    <p className="font-bold text-slate-700 mb-6">{res.orgName}</p>
                    <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${icon[res.status][1]}`}><Icon name={icon[res.status][0]} className="w-12 h-12" /></div>
                    <p role="status" className="text-2xl font-bold text-slate-800 mb-1">{t(`verify_${res.status}`)}</p>
                    {res.ownerName && <p className="text-lg text-slate-700 mb-4">{res.ownerName}</p>}
                    <dl className="text-sm text-slate-600 space-y-1 border-t pt-4 mt-4"><div className="flex justify-between"><dt>{t('issue_date')}</dt><dd dir="auto">{formatDateTime(res.issuedAt, lang)}</dd></div>{res.expiresAt && <div className="flex justify-between"><dt>{t('expires_at')}</dt><dd dir="auto">{formatDateTime(res.expiresAt, lang)}</dd></div>}</dl>
                </>)}
            </div>
        </main>
    );
}

function CardPlatform() {
    const [publishedId, setPublishedId] = useState(null); const [systemMode, setSystemMode] = useState(null); const [appState, setAppState] = useState('LOADING'); const [errorMsg, setErrorMsg] = useState(''); const [tenants, setTenants] = useState([]); const [publicTenant, setPublicTenant] = useState(null); const [currentTenant, setCurrentTenant] = useState(null); const [editingTenant, setEditingTenant] = useState(null); const [dicts, setDicts] = useState([]); const [globalFonts, setGlobalFonts] = useState([]); const [globalValidations, setGlobalValidations] = useState([]);

    const fetchGlobalFonts = () => { apiGet('get_fonts').then(d => { if (Array.isArray(d)) { globalFontRegistry = d; setGlobalFonts(d); injectGlobalFonts(d); } }).catch(() => { }); };
    const fetchGlobalValidations = () => { apiGet('get_validations').then(d => { if (Array.isArray(d)) setGlobalValidations(d); }).catch(() => { }); };
    const refreshTenants = () => apiGet('get_tenants').then(d => setTenants(Array.isArray(d) ? d : [])).catch(e => notifyError(e));
    const showError = (e) => { setErrorMsg(e && e.status === 403 ? e.message : (e && e.status === 404 ? 'سازمان یافت نشد.' : 'ارتباط با سرور برقرار نشد.')); setAppState('ERROR'); };

    useEffect(() => {
        // همه‌ی داده‌های شروع (سشن، تنظیمات پلتفرم، سازمان، دیکشنری‌ها، فونت‌ها، اعتبارسنجی‌ها) با یک درخواست
        const params = new URLSearchParams(window.location.search); const orgKey = urlOrgKey(); const verify = params.get('verify');
        (async () => {
            try {
                const boot = await apiGet('bootstrap', !verify && orgKey ? { org: orgKey } : {});
                if (Array.isArray(boot.dictionaries)) setDicts(boot.dictionaries);
                if (Array.isArray(boot.fonts)) { globalFontRegistry = boot.fonts; setGlobalFonts(boot.fonts); injectGlobalFonts(boot.fonts); }
                if (Array.isArray(boot.validations)) setGlobalValidations(boot.validations);
                setPlatform(boot.platform);
                if (verify) { setAppState('VERIFY'); return; }
                if (orgKey) {
                    // آدرس می‌تواند شناسه یا آدرس اختصاصی باشد؛ از اینجا به بعد شناسه‌ی واقعی استفاده می‌شود
                    const pub = boot.tenantPublic; const orgId = pub.id;
                    try { const saved = localStorage.getItem(`ui_lang_${orgId}`); if (saved) setUserLang(saved); } catch (e) { }
                    setPublicTenant(pub); setSystemMode('TENANT_PORTAL');
                    const role = boot.tenants && boot.tenants[orgId];
                    if (role && boot.tenant) { setCurrentTenant(boot.tenant); setAppState(role === 'ADMIN' ? 'TENANT_DASHBOARD' : 'TENANT_FORM'); }
                    else setAppState('LANDING');
                } else {
                    setSystemMode('SUPER_ADMIN_PORTAL');
                    if (boot.super) { setTenants(Array.isArray(boot.tenantList) ? boot.tenantList : []); setAppState('SUPER_ADMIN'); } else setAppState('LANDING');
                }
            } catch (e) { if (verify) setAppState('VERIFY'); else showError(e); }
        })();
        const onExpired = () => { notify(FALLBACK_FA.session_expired, 'warning'); setCurrentTenant(null); setAppState('LANDING'); };
        window.addEventListener('session-expired', onExpired);
        return () => window.removeEventListener('session-expired', onExpired);
    }, []);

    const deleteTenant = async (id) => { try { await apiPost('delete_tenant', { id }); setTenants(prev => prev.filter(tn => tn.id !== id)); notifySuccess('سازمان حذف شد.'); } catch (e) { notifyError(e); } };
    const logout = async (tenantId) => { try { await apiPost('logout', tenantId ? { tenantId } : {}); } catch (e) { } setCurrentTenant(null); setAppState('LANDING'); };

    // زبان: پنل سوپرادمین فارسی است؛ کاربر سازمان (در صورت اجازه) می‌تواند زبان را خودش انتخاب کند
    const tenantInfo = currentTenant || publicTenant || {};
    const langKey = `ui_lang_${tenantInfo.id || ''}`;
    const [userLang, setUserLang] = useState('');
    const langOptions = useMemo(() => { const opts = dicts.filter(d => d.lang_code).map(d => ({ code: d.lang_code, name: d.lang_name || d.lang_code })); if (!opts.some(o => o.code === 'fa')) opts.unshift({ code: 'fa', name: 'فارسی' }); return opts; }, [dicts]);
    const canSwitchLang = tenantInfo.allowLangSwitch !== false;
    const tenantLang = (canSwitchLang && userLang && langOptions.some(o => o.code === userLang)) ? userLang : (tenantInfo.langCode || 'fa');
    const langControl = canSwitchLang ? { value: tenantLang, options: langOptions, onChange: (code) => { setUserLang(code); try { localStorage.setItem(langKey, code); } catch (e) { } } } : null;
    const tLang = appState === 'SUPER_ADMIN' || appState === 'WIZARD' ? 'fa' : tenantLang; const t = getT(dicts, tLang); const isRtl = tLang === 'fa' || tLang === 'ar';
    useEffect(() => { document.documentElement.dir = isRtl ? 'rtl' : 'ltr'; document.documentElement.lang = tLang; }, [isRtl, tLang]);
    // رنگ‌های گرادیانت: پنل‌های سازمان با رنگ‌های همان سازمان، سوپرادمین با رنگ پیش‌فرض
    const inTenantArea = systemMode === 'TENANT_PORTAL';
    const platform = usePlatform();
    const theme = inTenantArea ? themeOf(tenantInfo) : themeOf({ theme: platform.superTheme });
    useEffect(() => { const st = document.documentElement.style; st.setProperty('--g1', theme.c1); st.setProperty('--g2', theme.c2); st.setProperty('--g3', theme.c3); }, [theme.c1, theme.c2, theme.c3]);
    // عنوان تب و آیکون تب از تنظیمات پلتفرم (در پنل سازمان: نام سازمان — نام پلتفرم)
    useEffect(() => { document.title = inTenantArea && tenantInfo.orgName ? `${tenantInfo.orgName} — ${platform.name}` : platform.name; }, [inTenantArea, tenantInfo.orgName, platform.name]);
    useEffect(() => {
        let link = document.getElementById('app-favicon');
        if (!link) { link = document.createElement('link'); link.id = 'app-favicon'; link.rel = 'icon'; document.head.appendChild(link); }
        link.href = platform.faviconUrl || DEFAULT_LOGO;
    }, [platform.faviconUrl]);
    // خروج خودکار پس از بی‌کاری: فعالیت در هر تب (از طریق localStorage) شمرده می‌شود و سرور با ping در جریان می‌ماند.
    // سرور هم همین قانون را مستقل اجرا می‌کند؛ اینجا فقط برای هشدار به‌موقع و برگشت تمیز به صفحه ورود است.
    const loggedIn = ['SUPER_ADMIN', 'WIZARD', 'TENANT_FORM', 'TENANT_DASHBOARD'].includes(appState);
    const idleTenantId = systemMode === 'TENANT_PORTAL' && currentTenant ? currentTenant.id : '';
    useEffect(() => {
        const idleMs = (Number(platform.idleMinutes) || 0) * 60000;
        if (!loggedIn || idleMs <= 0) return;
        const KEY = 'cp_last_activity'; const pingEvery = Math.min(5 * 60000, idleMs / 3);
        const st = { last: Date.now(), lastPing: Date.now(), warned: false };
        const store = (n) => { try { localStorage.setItem(KEY, String(n)); } catch (e) { } };
        const lastActivity = () => { let v = 0; try { v = Number(localStorage.getItem(KEY)) || 0; } catch (e) { } return Math.max(v, st.last); };
        store(st.last);
        const mark = () => {
            const n = Date.now(); if (n - st.last < 5000) return;
            st.last = n; st.warned = false; store(n);
            if (n - st.lastPing > pingEvery) { st.lastPing = n; apiGet('ping').catch(() => { }); }
        };
        const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
        events.forEach(ev => window.addEventListener(ev, mark, { passive: true, capture: true }));
        const timer = setInterval(() => {
            const left = idleMs - (Date.now() - lastActivity());
            if (left <= 0) { clearInterval(timer); logout(idleTenantId || undefined); notify(t('idle_logout'), 'warning'); }
            else if (left <= 60000 && !st.warned) { st.warned = true; notify(t('idle_warning'), 'warning'); }
        }, 10000);
        return () => { clearInterval(timer); events.forEach(ev => window.removeEventListener(ev, mark, { capture: true })); };
    }, [loggedIn, platform.idleMinutes, idleTenantId]);

    if (appState === 'LOADING') return <><LiquidBackground /><div className="loader-container relative z-10"><div className="spinner"></div><div className="loading-text">در حال راه‌اندازی پلتفرم...</div></div></>;
    if (appState === 'VERIFY') return <VerifyPage code={new URLSearchParams(window.location.search).get('verify')} dicts={dicts} />;
    if (appState === 'ERROR') return <div className="flex flex-col h-screen items-center justify-center text-red-500 font-bold relative z-10"><LiquidBackground /><Icon name="AlertTriangle" className="w-16 h-16 mb-4" /><p>{errorMsg}</p></div>;

    return (
        <><LiquidBackground /><div className={`min-h-screen text-slate-800 flex flex-col relative z-10 ${!isRtl ? 'text-left' : ''}`}>
            {appState === 'LANDING' && <SystemEntry mode={systemMode} tenant={publicTenant} t={t} langControl={systemMode === 'TENANT_PORTAL' ? langControl : null} onSuperAdmin={async () => { await refreshTenants(); setAppState('SUPER_ADMIN'); }} onTenantLogin={(role, tenant) => { setCurrentTenant(tenant); setAppState(role === 'ADMIN' ? 'TENANT_DASHBOARD' : 'TENANT_FORM'); }} />}
            {appState === 'SUPER_ADMIN' && <SuperAdminPanel tenants={tenants} t={t} fetchGlobalFonts={fetchGlobalFonts} fetchGlobalValidations={fetchGlobalValidations} onNewWizard={() => { setEditingTenant(null); setAppState('WIZARD'); }} onEditWizard={(tn) => { setEditingTenant(tn); setAppState('WIZARD'); }} onDuplicateWizard={(dup) => { setEditingTenant(dup); setAppState('WIZARD'); }} onDeleteWizard={deleteTenant} onRefresh={refreshTenants} publishedId={publishedId} onPublishedSeen={() => setPublishedId(null)} onLogout={() => logout()} />}
            {appState === 'WIZARD' && <SuperAdminWizard initialData={editingTenant} globalFonts={globalFonts} globalValidations={globalValidations} t={t} onComplete={(id) => { refreshTenants(); setAppState('SUPER_ADMIN'); setEditingTenant(null); setPublishedId(id); }} onCancel={() => { refreshTenants(); setAppState('SUPER_ADMIN'); setEditingTenant(null); }} />}
            {appState === 'TENANT_DASHBOARD' && currentTenant && <TenantDashboard tenant={currentTenant} t={t} lang={tLang} langControl={langControl} globalValidations={globalValidations} onLogout={() => logout(currentTenant.id)} />}
            {appState === 'TENANT_FORM' && currentTenant && <TenantForm tenant={currentTenant} t={t} lang={tLang} langControl={langControl} globalValidations={globalValidations} onLogout={() => logout(currentTenant.id)} />}
        </div></>
    );
}

// ==========================================
// 8. MOUNT
// ==========================================
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><CardPlatform /><UIHost /></ErrorBoundary>);
