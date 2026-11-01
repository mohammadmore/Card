// نمایش سه‌بعدی کارت دورو: کارت با ضخامت واقعی حول محور عمودی خودش می‌چرخد (خودکار + کشیدن با دست)،
// با سایه‌ی نرم، درخشش براق روی سطح و انعکاس روی زمین. فقط transform تغییر می‌کند تا روان و سبک بماند.
const { useState, useEffect, useRef, useMemo } = React;

const AUTO_SPEED = 42;          // درجه بر ثانیه (در نزدیکی رو/پشت کندتر می‌شود)
const HOLD_AFTER_FLIP_MS = 2600; // توقف روی یک رو بعد از دکمه‌ی «روی کارت/پشت کارت»
const HOLD_AFTER_DRAG_MS = 1400;
const TILT_X = -7;               // دوربین کمی از بالا نگاه می‌کند (روی کل صحنه، نه خود کارت)

const norm180 = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };

/** کپی بوم مبدأ در بوم مقصد با حداکثر عرض مشخص (کار می‌کند حتی اگر مبدأ tainted باشد). */
const copyCanvas = (src, dst, maxW) => {
    if (!src || !dst || !src.width || !src.height) return;
    const scale = Math.min(1, maxW / src.width);
    dst.width = Math.max(1, Math.round(src.width * scale)); dst.height = Math.max(1, Math.round(src.height * scale));
    const ctx = dst.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, dst.width, dst.height);
};

/** رنگ میانگین حاشیه‌ی کارت برای لبه/ضخامت؛ اگر خواندن پیکسل ممکن نباشد رنگ خنثی. */
const edgeColorOf = (canvas) => {
    try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24; const ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 24, 24); const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { if (x > 1 && x < 22 && y > 1 && y < 22) continue; const i = (y * 24 + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
    } catch (e) { return '#dfe3ea'; }
};

/**
 * لبه‌ی کارت: نواری پیوسته دور تا دور (خطوط صاف + گوشه‌های گرد با چند قطعه‌ی کوچک)،
 * عمود بر سطح کارت و هم‌ضخامت آن، تا از هر زاویه گوشه‌ها مثل خود کارت گرد دیده شوند.
 */
const edgeSegments = (w, h, r, perCorner = 8) => {
    const segs = [];
    const line = (cx, cy, len, deg) => segs.push({ cx, cy, len, deg });
    line(w / 2, 0, w - 2 * r, 0); line(w, h / 2, h - 2 * r, 90); line(w / 2, h, w - 2 * r, 180); line(0, h / 2, h - 2 * r, 270);
    const corners = [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]];
    const step = 90 / perCorner; const len = 2 * r * Math.sin((step * Math.PI / 180) / 2) * 1.12;
    corners.forEach(([ccx, ccy, a0]) => {
        for (let i = 0; i < perCorner; i++) {
            const phi = (a0 + step * (i + 0.5)) * Math.PI / 180;
            line(ccx + r * Math.cos(phi), ccy + r * Math.sin(phi), len, a0 + step * (i + 0.5) + 90);
        }
    });
    return segs;
};

// گوشی و تبلت (اشاره‌گر لمسی): لبه با قطعه‌های کمتر؛ دستگاه خیلی ضعیف: بدون انعکاس
const COARSE = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const LOW_END = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4 && (navigator.deviceMemory || 8) <= 2;

/**
 * تصویر انعکاس: همان روی کارت با وضوح کمتر، که کم‌رنگی و محو شدن از خط تماس با زمین یک بار در خود تصویر «پخته» می‌شود.
 * (opacity روی صحنه‌ی سه‌بعدی آن را تخت می‌کند و ماسک هر فریم هزینه دارد؛ این روش در حین چرخش هیچ هزینه‌ای ندارد.)
 */
const copyReflection = (src, dst, maxW, strength = 0.34, fadeTo = 0.5) => {
    copyCanvas(src, dst, maxW); if (!dst || !dst.width) return;
    const ctx = dst.getContext('2d'); ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, dst.height, 0, 0); // پایینِ تصویر = لبه‌ی تماس با زمین
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(fadeTo, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, dst.width, dst.height); ctx.globalCompositeOperation = 'source-over';
};

function CardBody({ w, h, faceRefs, edge, glossRefs, reflection = false }) {
    const t = Math.max(3, Math.round(w * 0.009)); const r = Math.round(Math.min(w, h) * 0.045);
    const face = (side) => (
        <div className={`sc-face${reflection ? ' sc-face-refl' : ''}`} style={{ width: w, height: h, borderRadius: r, transform: side === 'front' ? `translateZ(${t / 2}px)` : `rotateY(180deg) translateZ(${t / 2}px)` }}>
            <canvas ref={faceRefs[side]} className="sc-canvas" />
            {glossRefs && <div ref={glossRefs[side + 'Shade']} className="sc-shade" />}
        </div>
    );
    // درخشش: نواری که فقط با transform جابه‌جا می‌شود، روی صفحه‌ای شفاف جلوی هر رو و بدون هیچ برشی
    // (هر نوع برش، چه گوشه‌گرد چه مستطیلی، در صحنه‌ی سه‌بعدی کروم را به نقاشی مجدد در هر فریم وادار می‌کند).
    // نوار همیشه داخل کارت می‌ماند و لبه‌ی بالا و پایینش محو است تا از گوشه‌های گرد بیرون نزند.
    const glossPlane = (side) => (
        <div className="sc-gloss-plane" style={{ width: w, height: h, transform: side === 'front' ? `translateZ(${t / 2 + 0.3}px)` : `rotateY(180deg) translateZ(${t / 2 + 0.3}px)` }}>
            <div ref={glossRefs[side]} className="sc-gloss-band" style={{ width: w * 0.6, '--fade': `${Math.round(r * 1.2)}px` }} />
        </div>
    );
    const segs = useMemo(() => (reflection ? [] : edgeSegments(w, h, r, COARSE ? 4 : 8)), [w, h, r, reflection]);
    return (
        <>
            {/* در انعکاس لبه رسم نمی‌شود: کروم قطعه‌های لبه‌ی آینه‌شده را جلوی دو روی کارت مرتب می‌کند */}
            {segs.map((sg, i) => {
                // نور از بالا: لبه‌ی بالایی روشن‌تر، لبه‌ی پایینی تیره‌تر
                const light = -Math.sin((sg.deg - 90) * Math.PI / 180); // ۱ = رو به بالا، ۱- = رو به پایین
                const tone = light >= 0 ? `color-mix(in srgb, ${edge} ${Math.round(100 - light * 35)}%, white)` : `color-mix(in srgb, ${edge} ${Math.round(100 + light * 40)}%, black)`;
                return <div key={i} className="sc-edge" style={{ width: sg.len + 0.6, height: t, left: sg.cx - (sg.len + 0.6) / 2, top: sg.cy - t / 2, background: tone, transform: `rotateZ(${sg.deg}deg) rotateX(90deg)` }} />;
            })}
            {face('front')}{face('back')}
            {glossRefs && <>{glossPlane('front')}{glossPlane('back')}</>}
        </>
    );
}

/**
 * صحنه‌ی فیزیکی: کارت روی زمین صاف ایستاده و فقط حول محور عمودی می‌چرخد؛ دوربین کمی از بالا نگاه می‌کند (TILT_X روی کل صحنه).
 * انعکاس همان کارت است که در فضای سه‌بعدی حول صفحه‌ی زمین (لبه‌ی پایین کارت) آینه شده و با همان دوربین دیده می‌شود،
 * پس در هر زاویه لبه‌ی بالای انعکاس دقیقاً به لبه‌ی پایین کارت می‌چسبد. سایه هم روی همان زمین است و با کارت می‌چرخد.
 * @param front, back  بوم‌های رندرشده‌ی دو روی کارت
 * @param version      با هر رندر جدید افزایش می‌یابد تا تصویر کارت به‌روز شود
 */
export function CardShowcase3D({ front, back, version, t, label, Icon }) {
    const stageRef = useRef(null); const cardRef = useRef(null); const reflRef = useRef(null); const shadowRef = useRef(null);
    const faces = { front: useRef(null), back: useRef(null) }; const reflFaces = { front: useRef(null), back: useRef(null) };
    const gloss = { front: useRef(null), back: useRef(null), frontShade: useRef(null), backShade: useRef(null) };
    const [box, setBox] = useState({ w: 0, h: 0 }); const [edge, setEdge] = useState('#dfe3ea');
    const [playing, setPlaying] = useState(true);
    const reduceMotion = useRef(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const withReflection = !LOW_END;
    // وضعیت حرکت در ref نگه داشته می‌شود تا هر فریم باعث رندر React نشود
    const m = useRef({ angle: -28, vel: 0, target: null, holdUntil: 0, drag: null, playing: true, visible: true, applied: null, reflFront: null });
    const loop = useRef({ raf: 0, last: 0, kick: () => { } });

    const ratio = front && front.width ? front.height / front.width : 0.625;

    // اندازه‌ی کارت متناسب با عرض محفظه و ارتفاع صفحه
    useEffect(() => {
        const el = stageRef.current; if (!el) return;
        const fit = () => {
            const cw = el.clientWidth || 600; let w = Math.min(cw * 0.78, 540); let h = w * ratio;
            const maxH = Math.max(220, window.innerHeight * 0.5); if (h > maxH) { h = maxH; w = h / ratio; }
            setBox(b => (Math.abs(b.w - w) < 1 && Math.abs(b.h - h) < 1) ? b : { w: Math.round(w), h: Math.round(h) });
        };
        fit(); const ro = new ResizeObserver(fit); ro.observe(el); window.addEventListener('resize', fit);
        return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
    }, [ratio]);

    // کپی تصویر دو رو در وجه‌های کارت و انعکاس
    useEffect(() => {
        if (!box.w) return;
        const dpr = Math.min(COARSE ? 1.5 : 2, window.devicePixelRatio || 1); const maxW = Math.round(box.w * dpr * 1.25);
        copyCanvas(front, faces.front.current, maxW); copyCanvas(back, faces.back.current, maxW);
        if (withReflection) { copyReflection(front, reflFaces.front.current, maxW / 2); copyReflection(back, reflFaces.back.current, maxW / 2); }
        if (front) setEdge(edgeColorOf(front));
    }, [front, back, version, box.w]);

    // حلقه‌ی انیمیشن: فقط وقتی چیزی در حال حرکت است اجرا می‌شود و وقتی کارت ساکن یا بیرون از صفحه است کاملاً خاموش می‌شود
    useEffect(() => {
        const L = loop.current; const w = box.w;
        const apply = () => {
            const s = m.current; const a = s.angle;
            if (s.applied !== null && Math.abs(s.applied - a) < 0.01) return; // بدون تغییر = بدون نوشتن در DOM
            s.applied = a; const tr = `rotateY(${a}deg)`;
            if (cardRef.current) cardRef.current.style.transform = tr;
            if (reflRef.current) {
                reflRef.current.style.transform = tr;
                // در آینه، مرتب‌سازی عمقِ کروم گاهی وجه اشتباه را جلو می‌آورد؛ پس فقط وجهی که رو به دوربین است نمایش داده می‌شود
                // (فقط هنگام عبور از لبه، دو بار در هر دور، تغییر می‌کند)
                const frontFacing = Math.cos(a * Math.PI / 180) > 0;
                if (s.reflFront !== frontFacing) {
                    s.reflFront = frontFacing;
                    const f = reflFaces.front.current, bk = reflFaces.back.current;
                    if (f) f.parentElement.style.visibility = frontFacing ? 'visible' : 'hidden';
                    if (bk) bk.parentElement.style.visibility = frontFacing ? 'hidden' : 'visible';
                }
            }
            if (shadowRef.current) shadowRef.current.style.transform = `rotateX(90deg) rotateZ(${-a}deg)`;
            ['front', 'back'].forEach(side => {
                const local = norm180(side === 'front' ? a : a - 180); // ۰ = رو به بیننده
                const g = gloss[side].current; const sh = gloss[side + 'Shade'].current;
                if (g) {
                    // نوار (۶۰٪ عرض کارت) همیشه داخل کارت می‌ماند و به جای بیرون رفتن از لبه، محو می‌شود؛ بدون برش، بدون نقاشی مجدد
                    const frac = 0.5 - (local / 90) * 0.55; const c = Math.min(0.7, Math.max(0.3, frac));
                    const edgeFade = Math.max(0, 1 - Math.abs(frac - c) / 0.3);
                    g.style.transform = `translateX(${(c * w - w * 0.3).toFixed(1)}px)`;
                    g.style.opacity = String((0.35 + 0.65 * Math.min(1, Math.abs(local) / 50)) * edgeFade);
                }
                if (sh) sh.style.opacity = String(Math.min(0.55, (1 - Math.abs(Math.cos(local * Math.PI / 180))) * 0.6));
            });
        };
        const tick = (now) => {
            L.raf = 0; const dt = Math.min(0.05, (now - L.last) / 1000); L.last = now; const s = m.current;
            if (!s.visible) return; // بیرون از صفحه: حلقه متوقف می‌شود و با دیده شدن دوباره راه می‌افتد
            let moving = !!s.drag;
            if (!s.drag) {
                if (s.target !== null) {
                    const diff = s.target - s.angle; s.angle += diff * Math.min(1, dt * 5.5); moving = true;
                    if (Math.abs(diff) < 0.15) { s.angle = s.target; s.target = null; s.holdUntil = now + HOLD_AFTER_FLIP_MS; }
                } else if (Math.abs(s.vel) > 6) {
                    s.angle += s.vel * dt; s.vel *= Math.exp(-dt * 2.6); moving = true;
                    if (s.playing && Math.abs(s.vel) < AUTO_SPEED * 0.5) s.vel = 0;
                } else if (s.playing) {
                    moving = true; // در حال توقف کوتاه روی یک رو هم حلقه می‌ماند تا بعدش چرخش ادامه یابد (بدون نوشتن در DOM)
                    if (now > s.holdUntil) { const sin = Math.abs(Math.sin(s.angle * Math.PI / 180)); s.angle += AUTO_SPEED * (0.32 + 0.68 * sin) * dt; }
                }
                if (Math.abs(s.angle) > 3600) { s.angle = norm180(s.angle); s.applied = null; }
            }
            apply();
            if (moving) L.raf = requestAnimationFrame(tick);
        };
        L.kick = () => { if (!L.raf && m.current.visible) { L.last = performance.now(); L.raf = requestAnimationFrame(tick); } };
        m.current.applied = null; m.current.reflFront = null; apply(); L.kick();
        return () => { cancelAnimationFrame(L.raf); L.raf = 0; };
    }, [box.w]);

    useEffect(() => { m.current.playing = playing && !reduceMotion.current; if (playing) m.current.holdUntil = 0; loop.current.kick(); }, [playing]);

    // توقف کامل وقتی کارت در صفحه دیده نمی‌شود
    useEffect(() => {
        const el = stageRef.current; if (!el || !window.IntersectionObserver) return;
        const io = new IntersectionObserver(([e]) => { m.current.visible = e.isIntersecting; if (e.isIntersecting) loop.current.kick(); }); io.observe(el);
        return () => io.disconnect();
    }, []);

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
        const s = m.current; s.drag = { x: e.clientX, angle: s.angle, lastX: e.clientX, lastT: performance.now(), v: 0 }; s.target = null; s.vel = 0;
        loop.current.kick();
    };
    const onPointerMove = (e) => {
        const s = m.current; const d = s.drag; if (!d) return;
        const now = performance.now(); const dx = e.clientX - d.x; s.angle = d.angle + dx * 0.55;
        const dtm = Math.max(1, now - d.lastT); d.v = 0.7 * d.v + 0.3 * ((e.clientX - d.lastX) * 0.55 / dtm * 1000); d.lastX = e.clientX; d.lastT = now;
    };
    const onPointerUp = () => {
        const s = m.current; const d = s.drag; if (!d) return;
        s.vel = Math.max(-900, Math.min(900, d.v)); s.drag = null; s.holdUntil = performance.now() + HOLD_AFTER_DRAG_MS;
        loop.current.kick();
    };
    /** چرخش نرم تا نزدیک‌ترین زاویه‌ای که رو (۰) یا پشت (۱۸۰) کارت را نشان می‌دهد. */
    const showSide = (side) => {
        const s = m.current; const want = side === 'front' ? 0 : 180;
        s.target = s.angle + norm180(want - s.angle); s.vel = 0; loop.current.kick();
    };
    const onKeyDown = (e) => {
        const s = m.current;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); s.target = (s.target ?? s.angle) + (e.key === 'ArrowRight' ? 30 : -30); s.vel = 0; loop.current.kick(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.target = (s.target ?? s.angle) + 180; s.vel = 0; loop.current.kick(); }
    };

    const btn = 'sc-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold';
    const shadowDepth = box.w * 0.55;
    return (
        <div className="sc-wrap w-full flex flex-col items-center print:hidden">
            <div ref={stageRef} className="sc-stage w-full" style={{ height: box.h ? (withReflection ? box.h * 1.28 + 24 : box.h + 44) : 320 }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                tabIndex={0} role="img" aria-roledescription="3D" aria-label={label || t('view_3d')} onKeyDown={onKeyDown}>
                {box.w > 0 && <>
                    {/* سایه با همان دوربین و همان زمین، ولی در لایه‌ی جداگانه زیر صحنه: اگر در همان صحنه باشد،
                        کروم هنگام مرتب‌سازی عمق، انعکاسِ زیر زمین را اصلاً رسم نمی‌کند */}
                    <div className="sc-scene" style={{ width: box.w, height: box.h, top: 12 }} aria-hidden="true">
                        <div className="sc-world" style={{ width: box.w, height: box.h, transform: `rotateX(${TILT_X}deg)` }}>
                            <div ref={shadowRef} className="sc-floor-shadow" style={{ width: box.w * 1.04, height: shadowDepth, left: -box.w * 0.02, top: box.h - shadowDepth / 2 }} />
                        </div>
                    </div>
                    <div className="sc-scene" style={{ width: box.w, height: box.h, top: 12 }}>
                        {/* دوربین کمی از بالا: کج شدن روی کل صحنه (کارت و انعکاس) حول خط زمین */}
                        <div className="sc-world" style={{ width: box.w, height: box.h, transform: `rotateX(${TILT_X}deg)` }}>
                            {withReflection && (
                                <div className="sc-mirror3d" aria-hidden="true" style={{ width: box.w, height: box.h }}>
                                    <div ref={reflRef} className="sc-card" style={{ width: box.w, height: box.h }}>
                                        <CardBody w={box.w} h={box.h} faceRefs={reflFaces} edge={edge} reflection />
                                    </div>
                                </div>
                            )}
                            <div ref={cardRef} className="sc-card" style={{ width: box.w, height: box.h }}>
                                <CardBody w={box.w} h={box.h} faceRefs={faces} edge={edge} glossRefs={gloss} />
                            </div>
                        </div>
                    </div>
                </>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button type="button" className={btn} onClick={() => showSide('front')}><Icon name="CreditCard" className="w-3.5 h-3.5" /> {t('show_front')}</button>
                <button type="button" className={btn} onClick={() => showSide('back')}><Icon name="FlipHorizontal" className="w-3.5 h-3.5" /> {t('show_back')}</button>
                {!reduceMotion.current && <button type="button" className={btn} onClick={() => setPlaying(p => !p)} aria-pressed={!playing}><Icon name={playing ? 'Pause' : 'Play'} className="w-3.5 h-3.5" /> {playing ? t('pause_rotation') : t('play_rotation')}</button>}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{t('showcase_hint')}</p>
        </div>
    );
}
