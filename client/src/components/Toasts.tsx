import { useStore } from '../store/useStore';
import { Icon } from './Icon';

const ICONS: Record<string, string> = {
  success: 'check-circle-2',
  error: 'alert-circle',
  info: 'info',
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">
            <Icon name={ICONS[t.tone]} size={16} />
          </span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
