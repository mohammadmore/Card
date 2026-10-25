// state با تاریخچه‌ی Undo/Redo. تغییرات پیوسته (کشیدن المان، تایپ) در یک گام ادغام می‌شوند؛
// عملیات مجزا (افزودن، حذف، کپی، ...) با { checkpoint: true } همیشه گام جداگانه می‌سازند.
const { useState, useRef, useCallback } = React;

const MERGE_WINDOW_MS = 700;
const MAX_HISTORY = 100;

export function useUndoableState(initial) {
    const [state, setRaw] = useState(initial);
    const past = useRef([]); const future = useRef([]); const lastPush = useRef(0);

    const setState = useCallback((upd, opts) => {
        const checkpoint = !!(opts && opts.checkpoint);
        setRaw(prev => {
            const next = typeof upd === 'function' ? upd(prev) : upd;
            if (next === prev) return prev;
            const now = Date.now();
            if (checkpoint || now - lastPush.current > MERGE_WINDOW_MS) {
                past.current.push(prev);
                if (past.current.length > MAX_HISTORY) past.current.shift();
            }
            // بعد از یک عملیات مجزا، تغییر بعدی (حتی سریع) گام جدیدی شروع می‌کند
            lastPush.current = checkpoint ? 0 : now; future.current = [];
            return next;
        });
    }, []);
    /** تغییر بدون ثبت در تاریخچه (مثلاً گرفتن شناسه پس از ذخیره یا بازیابی پیش‌نویس). */
    const setSilently = useCallback((upd) => setRaw(prev => (typeof upd === 'function' ? upd(prev) : upd)), []);
    const undo = useCallback(() => {
        if (!past.current.length) return;
        const target = past.current.pop(); lastPush.current = 0;
        setRaw(cur => { future.current.push(cur); return target; });
    }, []);
    const redo = useCallback(() => {
        if (!future.current.length) return;
        const target = future.current.pop(); lastPush.current = 0;
        setRaw(cur => { past.current.push(cur); return target; });
    }, []);
    return [state, setState, { undo, redo, setSilently, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }];
}

/** آیا فوکوس در فیلد متنی است (تا میانبرهای ویرایشگر با تایپ تداخل نکنند). */
export const isTypingTarget = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
