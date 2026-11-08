import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Snackbar } from 'react-native-paper';

/** Haptic helpers — no-ops where unsupported. */
export const haptic = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

type ToastOpts = { action?: { label: string; onPress: () => void }; error?: boolean };
const ToastCtx = createContext<(msg: string, opts?: ToastOpts) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ msg: string; opts?: ToastOpts; key: number } | null>(null);
  const show = useCallback((msg: string, opts?: ToastOpts) => {
    (opts?.error ? haptic.error : haptic.success)();
    setState({ msg, opts, key: Date.now() });
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <Snackbar
        key={state?.key}
        visible={!!state}
        onDismiss={() => setState(null)}
        duration={state?.opts?.action ? 5000 : 2500}
        action={state?.opts?.action}
        style={{ marginBottom: 90 }}
      >
        {state?.msg ?? ''}
      </Snackbar>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
