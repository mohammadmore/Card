// نقطه‌ی ورود بسته‌ی بارگذاری‌شونده‌ی «پوستر و استوری»: window.PosterStudio.open(props)
import Studio from './studio.jsx';
window.PosterStudio = {
    open(props) {
        const host = document.createElement('div'); document.body.appendChild(host); const root = ReactDOM.createRoot(host);
        const close = () => { try { root.unmount(); } catch (e) { } host.remove(); if (props.onClosed) props.onClosed(); };
        root.render(<Studio {...props} onClose={close} />); return close;
    },
};
