import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'error', onClose, duration }: ToastProps) {
  useEffect(() => {
    // Error messages are persistent by default - don't auto-dismiss unless duration is explicitly provided
    if (type === 'error' && duration === undefined) {
      return;
    }

    // Success and info messages auto-dismiss after duration (default 3000ms)
    const autoDismissDuration = duration !== undefined ? duration : (type === 'success' ? 3000 : 5000);

    const timer = setTimeout(() => {
      onClose();
    }, autoDismissDuration);

    return () => clearTimeout(timer);
  }, [type, duration, onClose]);

  const styles = {
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: <AlertCircle className="w-5 h-5 text-red-600" />,
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: <Info className="w-5 h-5 text-blue-600" />,
    },
  };

  const style = styles[type];

  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-md animate-slide-in`}>
      <div className={`${style.bg} ${style.border} border-2 rounded-xl shadow-xl p-4 flex items-start gap-3 hover:shadow-2xl transition-shadow duration-200`}>
        {style.icon}
        <p className={`flex-1 ${style.text} text-sm font-medium`}>{message}</p>
        <button
          onClick={onClose}
          className={`${style.text} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
