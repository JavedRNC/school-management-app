import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { glow, radius, shadow, space, useAppTheme } from './theme';

/**
 * Haptics map (keep it consistent — a phone that buzzes for everything means nothing):
 *  tap     → selection tick: navigation, chips, rows, tabs
 *  light   → light impact: toggles and things that change state in place (attendance switch, check-in)
 *  success → after a save that reached the server (fired by the success toast)
 *  error   → validation / failed request (fired by the error toast, login shake)
 */
export const haptic = {
  tap: () => Haptics.selectionAsync().catch(() => {}),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

// ---------------------------------------------------------------- reduce motion
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = !!v; }).catch(() => {});
try { AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduceMotion = !!v; }); } catch { /* not supported */ }
/** True when the phone has "Remove animations" on — entrance/count-up animations then jump to their end state. */
export const prefersReducedMotion = () => reduceMotion;

// ---------------------------------------------------------------- toasts
type ToastOpts = { action?: { label: string; onPress: () => void }; error?: boolean };
type ToastState = { msg: string; opts?: ToastOpts; key: number };
const ToastCtx = createContext<(msg: string, opts?: ToastOpts) => void>(() => {});

function ToastCard({ state, onDone }: { state: ToastState; onDone: () => void }) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const error = !!state.opts?.error;
  const action = state.opts?.action;

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(v, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onDone());
  }, [v, onDone]);

  useEffect(() => {
    if (prefersReducedMotion()) { v.setValue(1); pop.setValue(1); }
    else {
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
      Animated.sequence([
        Animated.delay(90),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }),
      ]).start();
    }
    const id = setTimeout(close, action ? 5000 : error ? 3500 : 2600);
    return () => clearTimeout(id);
  }, [v, pop, close, action, error]);

  const bg = t.dark ? t.colors.elevation.level4 : '#15243B';
  const iconBg = error ? '#E5484D' : '#2FA866';
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + 150, alignItems: 'center' }}>
      <Animated.View accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          maxWidth: 480, minHeight: 48, borderRadius: radius.lg, backgroundColor: bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
          t.dark ? shadow(t, 3) : glow(error ? '#B3261E' : '#15243B')]}>
        <Pressable onPress={close} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingLeft: 12, paddingRight: action ? 6 : space.lg }}>
          <Animated.View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            <MaterialCommunityIcons name={error ? 'alert-circle-outline' : 'check-bold'} size={error ? 18 : 16} color="#fff" />
          </Animated.View>
          <Text variant="bodyMedium" style={{ color: '#fff', fontWeight: '500', flexShrink: 1 }}>{state.msg}</Text>
          {action ? (
            <Pressable hitSlop={8} onPress={() => { haptic.tap(); action.onPress(); close(); }}
              style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Text variant="labelLarge" style={{ color: '#FFC766', fontWeight: '700' }}>{action.label}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const show = useCallback((msg: string, opts?: ToastOpts) => {
    (opts?.error ? haptic.error : haptic.success)();
    setState({ msg, opts, key: Date.now() });
  }, []);
  const done = useCallback(() => setState(null), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {state ? <ToastCard key={state.key} state={state} onDone={done} /> : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
