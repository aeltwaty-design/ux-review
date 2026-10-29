import { createContext, useCallback, useContext, useRef, useState } from 'react';

export const ToastContext = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function useToastState() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3200);
  }, []);
  return { message, toast };
}
