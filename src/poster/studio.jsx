// استودیوی پوستر و استوری: انتخاب صحنه و اندازه، رده‌ی قبلی، فیلدهای قابل نمایش، موسیقی؛ خروجی تصویر (JPG/PNG/PDF)،
// ویدیوی ۸ ثانیه‌ای (MP4) و اشتراک‌گذاری. فقط وقتی کاربر دکمه را بزند بارگذاری می‌شود.
import { prepare, renderFrame, makeTex, STILL, SCENES, SIZES, TEXTS } from './engine.js';
import { exportVideo, synthMusic, fitUserAudio, frameState, MOODS, VIDEO_SECONDS } from './media.js';
import { canvasesToPdf, downloadBlob } from '../pdf.js';
const { useState, useEffect, useRef, useMemo } = React;

const STR = {
    fa: { title: 'پوستر و استوری', poster: 'پوستر موکاپ', story: 'استوری ارتقا رده', scene: 'صحنه', size: 'اندازه', showPrev: 'نمایش رده‌ی قبلی روی استوری', prevHint: 'رده‌ی قبلی از ترتیب رده‌های سامانه برداشته می‌شود و کارتش هم در صحنه‌ی «باز شدن کارت‌ها» دیده می‌شود.', editTexts: 'ویرایش نوشته‌های تصویر', tName: 'نام', tRankNew: 'رده‌ی جدید', tRankOld: 'رده‌ی قبلی', tDate: 'تاریخ', tOrg: 'سازمان', tBadge: 'برچسب بالای نام', tScan: 'متن کنار QR', musicHint: 'موسیقی آماده، فایل خودتان، یا بدون صدا؛ اگر صدا نخواستید می‌توانید در اینستاگرام موسیقی اضافه کنید.', orgMusic: 'موسیقی سازمان', material: 'جنس کارت', fields: 'اطلاعات نمایش‌داده‌شده روی تصویر', locked: 'مخفی‌شده توسط سازمان', fieldsHint: 'تصویر عمومی می‌شود؛ هر چیزی را که نمی‌خواهید دیده شود خاموش کنید.',
        music: 'موسیقی ویدیو', noMusic: 'بدون موسیقی', myFile: 'فایل صوتی من…', quality: 'کیفیت', q1: 'بالا (۱۰۸۰)', q2: 'عادی (۷۲۰)', download: 'دانلود تصویر', share: 'اشتراک‌گذاری', pdf: 'PDF چاپی', makeVideo: 'ساخت ویدیو (۸ ثانیه)', making: 'در حال ساخت ویدیو…', cancel: 'انصراف', videoReady: 'ویدیو آماده است', dlVideo: 'دانلود ویدیو', again: 'ساخت دوباره', caption: 'متن پیشنهادی پست', copy: 'کپی', copied: 'کپی شد', play: 'پیش‌نمایش حرکت', pause: 'توقف', loading: 'در حال آماده‌سازی…', close: 'بستن', format: 'فرمت',
        scenes: { float: 'شناور دورو', neon: 'تیره و نئونی', fan: 'باز شدن کارت‌ها', lanyard: 'آویز همایش' }, sizes: { story: 'عمودی ۹:۱۶ (استوری)', feed: 'پست ۴:۵', square: 'مربع', a4: 'A4 چاپی' }, mats: { auto: 'خودکار', matte: 'مات', gloss: 'براق', metal: 'فلزی', holo: 'هولوگرام' }, moods: { celebration: 'جشن', calm: 'آرام و لوکس', epic: 'حماسی' },
        webm: 'این مرورگر MP4 نمی‌سازد و فایل WebM را اینستاگرام ممکن است نپذیرد؛ با Chrome یا Safari امتحان کنید.', opus: 'صدای این ویدیو با کدک Opus ذخیره شد. اگر اینستاگرام آن را بی‌صدا کرد، ویدیو را بدون موسیقی بسازید و موسیقی را از بخش Music خود اینستاگرام اضافه کنید.', videoErr: 'ساخت ویدیو انجام نشد.', shareFail: 'اشتراک‌گذاری در این مرورگر ممکن نیست؛ از «دانلود» استفاده کنید.', noPrevNote: 'این فایل‌ها روی دستگاه شما ساخته می‌شود و جایی ارسال نمی‌شود.' },
    en: { title: 'Poster & Story', poster: 'Mockup poster', story: 'Promotion story', scene: 'Scene', size: 'Size', showPrev: 'Show previous rank on the story', prevHint: 'The previous rank comes from the system’s rank order, and its card appears in the “Card fan” scene.', editTexts: 'Edit image texts', tName: 'Name', tRankNew: 'New rank', tRankOld: 'Previous rank', tDate: 'Date', tOrg: 'Organization', tBadge: 'Badge above the name', tScan: 'Text beside the QR', musicHint: 'Built-in music, your own file, or silent; you can also add music inside Instagram.', orgMusic: 'Organization music', material: 'Card finish', fields: 'Information shown on the image', locked: 'Hidden by the organization', fieldsHint: 'The image becomes public; switch off anything you do not want seen.',
        music: 'Video music', noMusic: 'No music', myFile: 'My audio file…', quality: 'Quality', q1: 'High (1080)', q2: 'Standard (720)', download: 'Download image', share: 'Share', pdf: 'Print PDF', makeVideo: 'Create video (8 s)', making: 'Creating video…', cancel: 'Cancel', videoReady: 'Video is ready', dlVideo: 'Download video', again: 'Create again', caption: 'Suggested caption', copy: 'Copy', copied: 'Copied', play: 'Preview motion', pause: 'Pause', loading: 'Preparing…', close: 'Close', format: 'Format',
        scenes: { float: 'Floating pair', neon: 'Dark neon', fan: 'Card fan', lanyard: 'Event lanyard' }, sizes: { story: 'Vertical 9:16 (story)', feed: 'Post 4:5', square: 'Square', a4: 'A4 print' }, mats: { auto: 'Auto', matte: 'Matte', gloss: 'Gloss', metal: 'Metal', holo: 'Holographic' }, moods: { celebration: 'Celebration', calm: 'Calm & luxe', epic: 'Epic' },
        webm: 'This browser cannot make MP4; Instagram may reject WebM. Try Chrome or Safari.', opus: 'The audio is saved as Opus. If Instagram mutes it, create the video without music and add music from Instagram’s own Music sticker.', videoErr: 'Could not create the video.', shareFail: 'Sharing is not available in this browser; use Download.', noPrevNote: 'Files are created on your device and are not uploaded.' },
};
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const materialFor = (idx, n) => { if (idx < 0 || n <= 1) return 'gloss'; const r = idx / (n - 1); return r < 0.25 ? 'matte' : r < 0.55 ? 'gloss' : r < 0.85 ? 'metal' : 'holo'; };
const canvasToBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), type, q));
const COARSE = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/**
 * استودیوی کاربر نهایی: همه‌ی طراحی (صحنه‌ها، جنس کارت، نوشته‌ها، QR، موسیقی، فیلدهای مخفی) را سوپرادمین در ویزارد تعیین کرده؛
 * کاربر فقط (اگر چند سبک تعریف شده باشد) یک سبک را انتخاب می‌کند و تصویر یا ویدیوی استوری را می‌گیرد.
 */
function Studio({ tenant, cardData, front, back, lang = 'fa', ownerName = '', orgName = '', issuedAt = '', renderSides, ownerOf, verifyUrl, formatDate, toNum = (x) => x, notify, Icon, onClose }) {
    const S = STR[lang] || STR.en; const rtl = lang === 'fa' || lang === 'ar'; const P = tenant.poster || {};
    const allowed = (P.scenes && P.scenes.length ? P.scenes : SCENES).filter(s => SCENES.includes(s));
    const rankField = useMemo(() => { const sel = (tenant.fields || []).filter(f => f.type === 'select'); return sel.find(f => f.isConditionTrigger) || sel[0] || null; }, [tenant]);
    const trOpt = (v) => { const m = rankField && rankField.i18n && rankField.i18n[lang] && rankField.i18n[lang].options; return (m && m[v] && String(m[v]).trim()) || v; };
    const rankValue = rankField ? String(cardData[rankField.id] || '') : ''; const rankOptions = rankField ? (rankField.options || []).map(o => o.display).filter(Boolean) : [];
    const allowPoster = P.allowPoster === true; const allowVideo = P.video !== false;
    const [mode, setMode] = useState('story'); const [scene, setScene] = useState(allowed.includes(P.defaultScene) ? P.defaultScene : allowed[0]); const [size, setSize] = useState('feed');
    const adminHidden = useMemo(() => new Set(P.hideFields || []), [P]); const hiddenKey = [...adminHidden].sort().join(',');
    const [assets, setAssets] = useState(null); const [vid, setVid] = useState(null); const [playing, setPlaying] = useState(false); const [copied, setCopied] = useState(false); const [busy, setBusy] = useState('');
    const cv = useRef(null); const abortRef = useRef(null); const thumbRefs = useRef({}); const tracks = Array.isArray(P.music) ? P.music : [];
    useEffect(() => { const h = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true); }, []);
    // رده‌ی قبلی: رده‌ها به ترتیب‌اند؛ پس رده‌ی قبلی همان گزینه‌ی پیش از رده‌ی فعلی است (سوپرادمین می‌تواند نمایشش را خاموش کند)
    const rIdx = rankOptions.indexOf(rankValue); const prevRank = P.showPrev !== false && rIdx > 0 ? rankOptions[rIdx - 1] : '';
    useEffect(() => {
        let alive = true; setBusy('load');
        (async () => {
            const hide = adminHidden; const filt = (d) => { const o = { ...d }; hide.forEach(id => { o[id] = ''; }); return o; };
            let f = front, b = back; if (hide.size) { const r = await renderSides(filt(cardData)); f = r[0]; b = r[1]; }
            let prevTex = null; if (prevRank && rankField) { try { const r = await renderSides(filt({ ...cardData, [rankField.id]: prevRank })); prevTex = makeTex(r[0]); } catch (e) { } }
            const [logo, logoDark, bgImage] = await Promise.all([loadImg(tenant.logoUrl), loadImg(tenant.logoUrlDark), P.bg && P.bg.image ? loadImg(P.bg.image) : null]);
            let qr = null; try { if (P.showQr !== false && window.QRious) { const q = new window.QRious({ value: verifyUrl(cardData), size: 360, level: 'M', foreground: '#111827', background: '#ffffff' }); qr = q.canvas || null; } } catch (e) { }
            try { await document.fonts.load('900 40px Vazirmatn'); await document.fonts.load('600 30px Vazirmatn'); } catch (e) { }
            if (alive) { setAssets({ front: makeTex(f), back: makeTex(b), prev: prevTex, logo, logoDark: logoDark || null, qr, bgImage }); setBusy(''); }
        })().catch(e => { if (alive) { setBusy(''); notify && notify(String(e && e.message || e)); } });
        return () => { alive = false; };
    }, [hiddenKey, prevRank]);

    const txtLang = ['fa', 'en', 'ar', 'tr'].includes(lang) ? lang : 'en'; const orgT = (P.texts && P.texts[txtLang]) || {}; const TT = { ...(TEXTS[txtLang] || TEXTS.en), ...orgT };
    const pm = P.material && P.material !== 'auto' ? P.material : null; const material = pm || materialFor(rankOptions.indexOf(rankValue), rankOptions.length);
    const dateTxt = issuedAt ? toNum(formatDate(issuedAt)) : '';
    // متغیرهای قالب‌ها: {name} {rank} {prev} {date} {org} و {شناسه‌ی هر فیلد کارت}؛ فیلدهای مخفی خالی می‌شوند
    const fieldText = (f) => { if (adminHidden.has(f.id)) return ''; const v = cardData[f.id]; if (v == null || v === '') return ''; if (f.type === 'select') return trOpt(String(v)); if (f.type === 'date') { try { return toNum(formatDate(String(v))); } catch (e) { return String(v); } } return toNum(String(v)); };
    const vars = useMemo(() => { const m = { name: ownerName, rank: rankValue ? trOpt(rankValue) : '', prev: prevRank ? trOpt(prevRank) : '', date: dateTxt, org: orgName }; (tenant.fields || []).forEach(f => { if (!['photo', 'barcode', 'qrcode'].includes(f.type)) m[f.id] = fieldText(f); }); return m; }, [ownerName, rankValue, prevRank, dateTxt, orgName]);
    const fillTpl = (tpl) => String(tpl || '').replace(/\{([^{}\s]+)\}/g, (_, k) => (k in vars ? vars[k] : '')).replace(/\s*[·|\-–—:،]\s*(?=$)/g, '').replace(/\s+/g, ' ').trim();
    const nameTxt = P.showName === false ? '' : fillTpl(P.title || '{name}'); const lineTxt = (Array.isArray(P.lines) ? P.lines : []).map(fillTpl).filter(Boolean);
    const input = useMemo(() => assets && ({ front: assets.front, back: assets.back, prev: assets.prev, logo: assets.logo, logoDark: assets.logoDark, qr: P.showQr === false ? null : assets.qr, lang: txtLang, scene, material,
        bg: { mode: (P.bg && P.bg.mode) || 'auto', c1: P.bg && P.bg.c1, c2: P.bg && P.bg.c2, theme: tenant.theme, image: assets.bgImage || null, override: (P.byRank && P.byRank[rankValue]) || null },
        labels: { promoted: orgT.promoted, newCard: orgT.newCard, scan: orgT.scan }, texts: { name: nameTxt, rankNew: rankValue ? trOpt(rankValue) : '', rankOld: mode === 'story' && prevRank ? trOpt(prevRank) : '', date: dateTxt, orgName, lines: lineTxt } }), [assets, scene, material, mode, txtLang, nameTxt, rankValue, prevRank, dateTxt, orgName, lineTxt.join('\u0001')]);
    const sz = mode === 'story' ? SIZES.story : SIZES[size]; const kind = mode === 'story' ? 'story' : 'poster';
    useEffect(() => { // پیش‌نمایش ثابت
        if (!input || playing || !cv.current) return; const pw = 560; const spec = prepare({ ...input, kind, size: { w: pw, h: Math.round(pw * sz.h / sz.w) } }); renderFrame(cv.current, spec, { t: STILL[scene] ?? 0.4, ui: 1, fx: kind === 'story' ? 0.3 : -1 });
    }, [input, kind, size, playing]);
    useEffect(() => { // پیش‌نمایش متحرک (همان زمان‌بندی ویدیو)
        if (!playing || !input || !cv.current) return; const pw = 480; const spec = prepare({ ...input, kind: 'story', size: { w: pw, h: Math.round(pw * 16 / 9) } }); let raf = 0; const t0 = performance.now();
        const loop = (now) => { const t = ((now - t0) / 1000 % VIDEO_SECONDS) / VIDEO_SECONDS; renderFrame(cv.current, spec, frameState(Math.round(t * 1000), 1000)); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
    }, [playing, input]);
    useEffect(() => { // تصویرک سبک‌ها (فقط اگر چند سبک تعریف شده)
        if (!input || allowed.length < 2) return; allowed.forEach(sc => { const c = thumbRefs.current[sc]; if (!c) return; const w = 150; const spec = prepare({ ...input, scene: sc, kind: 'story', size: { w, h: Math.round(w * 16 / 9) } }); renderFrame(c, spec, { t: STILL[sc], ui: 1, fx: -1 }); });
    }, [input]);

    const renderFinal = () => { const c = document.createElement('canvas'); renderFrame(c, prepare({ ...input, kind, size: { w: sz.w, h: sz.h } }), { t: STILL[scene] ?? 0.4, ui: 1, fx: kind === 'story' ? 0.3 : -1 }); return c; };
    const fileBase = `${(ownerName || 'card').replace(/[\\/:*?"<>|\s]+/g, '_')}-${mode}-${scene}`;
    const imageBlob = async () => canvasToBlob(renderFinal(), 'image/jpeg', 0.93);
    const download = async () => { setBusy('img'); try { downloadBlob(await imageBlob(), `${fileBase}.jpg`); } catch (e) { notify(S.videoErr); } setBusy(''); };
    const downloadPdf = () => { try { downloadBlob(canvasesToPdf([renderFinal()], { printW: 210, printH: 297 }), `${fileBase}.pdf`); } catch (e) { notify(S.videoErr); } };
    const share = async (blob, name, type) => { try { const file = new File([blob], name, { type }); if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: orgName || '' }); else notify(S.shareFail, 'warning'); } catch (e) { if (e && e.name !== 'AbortError') notify(S.shareFail, 'warning'); } };
    const shareImage = async () => { setBusy('img'); try { await share(await imageBlob(), `${fileBase}.jpg`, 'image/jpeg'); } catch (e) { } setBusy(''); };
    const music = P.musicDefault || (tracks.length ? 'org:0' : 'celebration');
    const makeVideo = async () => {
        if (vid && vid.url) URL.revokeObjectURL(vid.url); setPlaying(false); const ac = new AbortController(); abortRef.current = ac; setVid({ busy: true, p: 0 });
        try {
            let audio = null; if (music.startsWith('org:') && tracks[+music.slice(4)]) { const r = await fetch(tracks[+music.slice(4)].url); if (!r.ok) throw new Error('music'); audio = await fitUserAudio(await r.blob()); } else if (MOODS.includes(music)) audio = await synthMusic(music);
            const res = await exportVideo(input, { quality: COARSE ? 'sd' : 'hd', audio, signal: ac.signal, onProgress: (p) => setVid(v => (v && v.busy ? { ...v, p } : v)) });
            setVid({ done: true, url: URL.createObjectURL(res.blob), res });
        } catch (e) { setVid(null); if (!(e && e.name === 'AbortError')) notify(`${S.videoErr} ${e && e.message ? e.message : ''}`); }
    };
    const caption = useMemo(() => {
        const tags = String(P.hashtags || '').split(/\s+/).filter(Boolean).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' '); const n = ownerName, r = rankValue ? trOpt(rankValue) : ''; const tpl = r ? orgT.captionPromo : orgT.captionNew; const fill = (x) => fillTpl(x);
        const line = { fa: r ? `${n} به رده‌ی «${r}» ارتقا یافت! 🎉` : `کارت جدید ${n} صادر شد 🎉`, en: r ? `${n} has been promoted to ${r}! 🎉` : `${n}'s new card is ready 🎉`, ar: r ? `تمت ترقية ${n} إلى «${r}» 🎉` : `تم إصدار بطاقة ${n} 🎉`, tr: r ? `${n}, ${r} rütbesine terfi etti! 🎉` : `${n} için yeni kart hazır 🎉` }[txtLang];
        return [tpl ? fill(tpl) : line, orgName, tags].filter(Boolean).join('\n');
    }, [ownerName, rankValue, orgName, txtLang]);
    const copy = () => { try { navigator.clipboard.writeText(caption).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); } catch (e) { } };
    const chip = (on) => `px-3 py-1.5 rounded-lg text-sm font-bold border transition ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-indigo-50'}`;
    const label = 'text-xs font-bold text-slate-600 block mb-1.5';
    const btn = 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50';
    const canShare = typeof navigator !== 'undefined' && navigator.canShare;

    return (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" dir={rtl ? 'rtl' : 'ltr'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={S.title} className="glass-strong sm:rounded-3xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/60 shrink-0">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 me-auto"><Icon name="Film" className="w-5 h-5 text-indigo-600" /> {S.title}</h2>
                    {allowPoster && <div role="tablist" className="view-toggle inline-flex bg-slate-100/80 rounded-xl p-1">{[['story', S.story], ['poster', S.poster]].map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setPlaying(false); }} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600">{l}</button>)}</div>}
                    <button onClick={onClose} aria-label={S.close} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full"><Icon name="X" className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto grid md:grid-cols-[minmax(0,340px)_1fr] gap-5 p-4 sm:p-5">
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative w-full max-w-[340px] rounded-2xl overflow-hidden shadow-2xl bg-slate-200" style={{ aspectRatio: `${sz.w} / ${sz.h}` }}>
                            <canvas ref={cv} aria-label={S.title} className="w-full h-full block" />
                            {busy === 'load' && <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-slate-700 font-bold animate-pulse">{S.loading}</div>}
                        </div>
                        {mode === 'story' && allowVideo && <button type="button" onClick={() => setPlaying(p => !p)} disabled={!input} className={`${btn} bg-white border border-indigo-200 text-indigo-700`}><Icon name={playing ? 'Pause' : 'Play'} className="w-4 h-4" /> {playing ? S.pause : S.play}</button>}
                    </div>
                    <div className="space-y-5 min-w-0">
                        {allowed.length > 1 && <div><span className={label}>{S.scene}</span><div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={S.scene}>{allowed.map(sc => (
                            <button key={sc} type="button" role="radio" aria-checked={scene === sc} onClick={() => setScene(sc)} className={`rounded-xl p-1.5 border-2 transition ${scene === sc ? 'border-indigo-600 bg-indigo-50' : 'border-transparent bg-white/60 hover:bg-white'}`}>
                                <canvas ref={el => { thumbRefs.current[sc] = el; }} className="w-full rounded-lg block" style={{ aspectRatio: '9 / 16' }} /><span className="block text-[11px] font-bold text-slate-700 mt-1 truncate">{S.scenes[sc]}</span></button>))}</div></div>}
                        {mode === 'poster' && <div><span className={label}>{S.size}</span><div className="flex flex-wrap gap-2">{['story', 'feed', 'square', 'a4'].map(k => <button key={k} type="button" onClick={() => setSize(k)} aria-pressed={size === k} className={chip(size === k)}>{S.sizes[k]}</button>)}</div></div>}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={download} disabled={!input || busy} className={`${btn} btn-grad`}><Icon name="Download" className="w-4 h-4" /> {S.download}</button>
                            {canShare && <button type="button" onClick={shareImage} disabled={!input || busy} className={`${btn} bg-white border border-indigo-200 text-indigo-700`}><Icon name="Share2" className="w-4 h-4" /> {S.share}</button>}
                            {mode === 'poster' && size === 'a4' && <button type="button" onClick={downloadPdf} disabled={!input} className={`${btn} bg-white border border-indigo-200 text-indigo-700`}><Icon name="FileText" className="w-4 h-4" /> {S.pdf}</button>}
                        </div>
                        {mode === 'story' && allowVideo && (
                            <div className="bg-white/50 border rounded-2xl p-4 space-y-3">
                                {(!vid || (!vid.busy && !vid.done)) && <button type="button" onClick={makeVideo} disabled={!input} className={`${btn} btn-grad`}><Icon name="Film" className="w-4 h-4" /> {S.makeVideo}</button>}
                                {vid && vid.busy && (<div role="status" className="space-y-2"><div className="flex items-center gap-2 text-sm font-bold text-slate-700">{S.making} <span className="latin-digits ms-auto">{Math.round((vid.p || 0) * 100)}%</span></div><div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round((vid.p || 0) * 100)}%` }} /></div><button type="button" onClick={() => abortRef.current && abortRef.current.abort()} className="text-sm text-slate-600 underline">{S.cancel}</button></div>)}
                                {vid && vid.done && (<div className="space-y-3"><p className="text-sm font-bold text-emerald-700 flex items-center gap-1.5"><Icon name="Check" className="w-4 h-4" /> {S.videoReady} <span className="text-xs font-normal text-slate-500 latin-digits">({(vid.res.blob.size / 1048576).toFixed(1)} MB · {vid.res.ext.toUpperCase()})</span></p>
                                    <video src={vid.url} controls playsInline loop className="w-full max-w-[220px] rounded-xl bg-black" aria-label={S.videoReady} />
                                    {vid.res.ext === 'webm' && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{S.webm}</p>}
                                    {vid.res.method.endsWith('opus') && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{S.opus}</p>}
                                    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => downloadBlob(vid.res.blob, `${fileBase}.${vid.res.ext}`)} className={`${btn} btn-grad`}><Icon name="Download" className="w-4 h-4" /> {S.dlVideo}</button>
                                        {canShare && <button type="button" onClick={() => share(vid.res.blob, `${fileBase}.${vid.res.ext}`, vid.res.mime)} className={`${btn} bg-white border border-indigo-200 text-indigo-700`}><Icon name="Share2" className="w-4 h-4" /> {S.share}</button>}
                                        <button type="button" onClick={() => { URL.revokeObjectURL(vid.url); setVid(null); }} className={`${btn} text-slate-600 hover:bg-white/70`}>{S.again}</button></div></div>)}
                            </div>
                        )}
                        <div><span className={label}>{S.caption}</span><p id="ps-cap" className="whitespace-pre-line text-sm bg-white/70 border rounded-xl px-3 py-2" dir="auto">{caption}</p><button type="button" onClick={copy} className={`${btn} bg-white border border-slate-200 text-slate-700 mt-1.5`}><Icon name={copied ? 'Check' : 'Copy'} className="w-4 h-4" /> {copied ? S.copied : S.copy}</button></div>
                        <p className="text-[11px] text-slate-500">{S.noPrevNote}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
export default Studio;
