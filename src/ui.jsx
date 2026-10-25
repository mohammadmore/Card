// اعلان‌ها و پنجره‌های تأیید/ورودی درون‌برنامه‌ای (به‌جای alert/confirm/prompt مرورگر که کار را مسدود می‌کنند).
const { useState, useEffect, useRef } = React;

const listeners = new Set();
let seq = 0;
const emit = (evt) => listeners.forEach(l => l(evt));

/** اعلان کوتاه غیرمسدودکننده. type: info | success | error | warning */
export const notify = (message, type = 'error', timeout) => emit({ kind: 'toast', id: ++seq, message: String(message), type, timeout: timeout ?? (type === 'error' ? 6000 : 3500) });
export const notifySuccess = (message) => notify(message, 'success');
export const notifyError = (e, fallback) => notify((e && e.message) || fallback || 'خطای ناشناخته', 'error');

/** پنجره‌ی تأیید درون‌برنامه‌ای؛ Promise<boolean> برمی‌گرداند. */
export const askConfirm = (message, { okText = 'تایید', cancelText = 'انصراف', danger = false, title = '' } = {}) =>
    new Promise(resolve => emit({ kind: 'dialog', id: ++seq, type: 'confirm', message, okText, cancelText, danger, title, resolve }));

/** پنجره‌ی ورودی متن درون‌برنامه‌ای؛ Promise<string|null> برمی‌گرداند (null = انصراف). */
export const askPrompt = (message, defaultValue = '', { okText = 'تایید', cancelText = 'انصراف', title = '', inputType = 'text', dir = 'auto' } = {}) =>
    new Promise(resolve => emit({ kind: 'dialog', id: ++seq, type: 'prompt', message, defaultValue: String(defaultValue ?? ''), okText, cancelText, title, inputType, dir, resolve }));

/** بستن مودال با کلید Escape. */
export const useEscape = (onClose, active = true) => {
    const ref = useRef(onClose); ref.current = onClose;
    useEffect(() => {
        if (!active) return;
        const h = (e) => { if (e.key === 'Escape') ref.current && ref.current(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [active]);
};

const TOAST_STYLE = {
    success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', warning: 'bg-amber-500 text-white', info: 'bg-slate-800 text-white',
};
const TOAST_ICON = { success: '✓', error: '!', warning: '!', info: 'i' };

function DialogView({ dialog, onDone }) {
    const [value, setValue] = useState(dialog.defaultValue || '');
    const okRef = useRef(null); const inputRef = useRef(null); const boxRef = useRef(null);
    const close = (ok) => onDone(dialog.type === 'prompt' ? (ok ? value : null) : ok);
    useEffect(() => { (inputRef.current || okRef.current) && (inputRef.current || okRef.current).focus(); if (inputRef.current) inputRef.current.select(); }, []);
    const onKeyDown = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(false); }
        else if (e.key === 'Enter' && dialog.type === 'prompt') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab' && boxRef.current) {
            // نگه داشتن فوکوس داخل پنجره
            const els = boxRef.current.querySelectorAll('button, input'); if (!els.length) return;
            const first = els[0]; const last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    const titleId = `dlg-title-${dialog.id}`; const msgId = `dlg-msg-${dialog.id}`;
    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onKeyDown={onKeyDown} onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
            <div ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby={dialog.title ? titleId : undefined} aria-describedby={msgId} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-right">
                {dialog.title && <h2 id={titleId} className="font-bold text-lg text-slate-800 mb-2">{dialog.title}</h2>}
                <p id={msgId} className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{dialog.message}</p>
                {dialog.type === 'prompt' && <input ref={inputRef} type={dialog.inputType} value={value} onChange={e => setValue(e.target.value)} dir={dialog.dir} aria-label={dialog.title || dialog.message} className="w-full mt-4 border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />}
                <div className="flex gap-3 mt-6">
                    <button type="button" onClick={() => close(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl">{dialog.cancelText}</button>
                    <button type="button" ref={okRef} onClick={() => close(true)} className={`flex-1 py-2.5 text-white font-bold rounded-xl ${dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{dialog.okText}</button>
                </div>
            </div>
        </div>
    );
}

/** میزبان اعلان‌ها و پنجره‌ها؛ یک بار در ریشه‌ی برنامه رندر می‌شود. */
export function UIHost() {
    const [toasts, setToasts] = useState([]); const [dialogs, setDialogs] = useState([]);
    useEffect(() => {
        const l = (evt) => {
            if (evt.kind === 'toast') {
                setToasts(p => [...p.slice(-4), evt]);
                setTimeout(() => setToasts(p => p.filter(x => x.id !== evt.id)), evt.timeout);
            } else setDialogs(p => [...p, evt]);
        };
        listeners.add(l); return () => listeners.delete(l);
    }, []);
    const current = dialogs[0];
    return (
        <>
            <div className="fixed bottom-4 inset-x-0 z-[210] flex flex-col items-center gap-2 px-4 pointer-events-none print:hidden" role="status" aria-live="polite">
                {toasts.map(tst => (
                    <div key={tst.id} className={`pointer-events-auto max-w-lg w-full sm:w-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm ${TOAST_STYLE[tst.type] || TOAST_STYLE.info}`}>
                        <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">{TOAST_ICON[tst.type] || 'i'}</span>
                        <span className="flex-1 whitespace-pre-line leading-relaxed">{tst.message}</span>
                        <button type="button" aria-label="بستن اعلان" onClick={() => setToasts(p => p.filter(x => x.id !== tst.id))} className="opacity-70 hover:opacity-100 shrink-0">✕</button>
                    </div>
                ))}
            </div>
            {current && <DialogView key={current.id} dialog={current} onDone={(result) => { current.resolve(result); setDialogs(p => p.slice(1)); }} />}
        </>
    );
}
