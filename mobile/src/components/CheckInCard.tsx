import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';

import { fmtTime, LocationError, openSettings, readPosition } from '@/components/staff/util';
import { FadeIn, Icon, IconBadge, IconName, ToneChip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, Tone, toneColors, useAppTheme } from '@/lib/theme';
import type { MyStaffAttendance, StaffRecord } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const STAFF_ROLES = ['teacher', 'vice_principal', 'coordinator'];

/** Today's GPS check-in / check-out for staff (F22). Renders nothing for other roles or without the module. */
export function CheckInCard({ onChange }: { onChange?: () => void } = {}) {
  const { user } = useAuth();
  const enabled = useModule('staff_attendance') && !!user && STAFF_ROLES.includes(user.role);
  if (!enabled) return null;
  return <CheckInBody onChange={onChange} />;
}

function CheckInBody({ onChange }: { onChange?: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const { data, error, reload } = useLoad(() => api<MyStaffAttendance>('/staff-attendance/me'));
  const [busy, setBusy] = useState<null | 'in' | 'out'>(null);
  const [problem, setProblem] = useState<{ text: string; settings?: boolean } | null>(null);
  const [justDone, setJustDone] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  const rec: StaffRecord | null = data?.today.record ?? null;
  const state: 'loading' | 'off' | 'leave' | 'unset' | 'in' | 'out' | 'done' = !data
    ? 'loading'
    : !data.today.is_school_day ? 'off'
    : data.today.on_leave && !rec?.check_in_at ? 'leave'
    : !data.settings.configured ? 'unset'
    : !rec?.check_in_at ? 'in'
    : !rec.check_out_at ? 'out'
    : 'done';
  const actionable = state === 'in' || state === 'out';

  useEffect(() => {
    if (!actionable) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [actionable, glow]);

  async function act(kind: 'in' | 'out') {
    if (school && !school.can_write) {
      toast('Read-only mode — subscription expired', { error: true });
      return;
    }
    setBusy(kind);
    setProblem(null);
    try {
      const pos = await readPosition();
      await api<StaffRecord>(`/staff-attendance/check-${kind}`, { body: pos });
      haptic.success();
      setJustDone(true);
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
      setTimeout(() => setJustDone(false), 1800);
      toast(kind === 'in' ? 'Checked in ✓ Have a great day!' : 'Checked out ✓ See you tomorrow');
      reload();
      onChange?.();
    } catch (e) {
      const msg = (e as Error).message;
      setProblem({ text: msg, settings: e instanceof LocationError && e.canOpenSettings });
      toast(msg, { error: true });
      if (e instanceof ApiError && e.status === 409) reload();
    } finally {
      setBusy(null);
    }
  }

  const info: Record<typeof state, { icon: IconName; tone: Tone; title: string; text: string }> = {
    loading: { icon: 'map-marker-radius-outline', tone: 'primary', title: 'Staff attendance', text: 'Loading today…' },
    off: { icon: 'beach', tone: 'neutral', title: 'No school today', text: data?.today.reason || 'Enjoy your day off' },
    leave: { icon: 'airplane-takeoff', tone: 'primary', title: "You're on leave today", text: 'No check-in needed' },
    unset: { icon: 'map-marker-off-outline', tone: 'warning', title: 'Check-in not ready', text: "The principal hasn't set the school location yet" },
    in: { icon: 'map-marker-radius-outline', tone: 'primary', title: 'Good morning! Check in at school', text: `Works within ${data?.settings.radius_m ?? 150} m of the school gate` },
    out: { icon: 'clock-check-outline', tone: 'success', title: `Checked in ${fmtTime(rec?.check_in_at)}`, text: 'Remember to check out before you leave' },
    done: { icon: 'check-decagram', tone: 'success', title: 'Done for today', text: `${fmtTime(rec?.check_in_at)} – ${fmtTime(rec?.check_out_at)}` },
  };
  const s = info[state];
  const tc = toneColors(t, s.tone);
  const shadow = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });

  return (
    <FadeIn>
      <View style={{ backgroundColor: t.colors.elevation.level1, borderRadius: radius.xl, padding: space.lg, marginBottom: space.md,
        borderWidth: 1, borderColor: actionable ? t.colors.primaryContainer : 'transparent',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
        <Pressable onPress={() => { haptic.tap(); router.push('/more/staff-attendance' as never); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {justDone ? (
            <Animated.View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.custom.success, alignItems: 'center', justifyContent: 'center',
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
              <Icon name="check-bold" size={24} color="#fff" />
            </Animated.View>
          ) : <IconBadge icon={s.icon} tone={s.tone} />}
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>{s.title}</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{s.text}</Text>
          </View>
          {rec?.late ? <ToneChip text="Late" tone="warning" icon="clock-alert-outline" /> : null}
          {state === 'loading' ? <ActivityIndicator size="small" /> : <Icon name="chevron-right" size={20} color={t.colors.outline} />}
        </Pressable>

        {error && !data ? (
          <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: space.sm }}>{error}</Text>
        ) : null}

        {actionable ? (
          <Animated.View style={{ marginTop: space.md, borderRadius: radius.lg, shadowColor: t.colors.primary, shadowOpacity: shadow,
            shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <Button mode="contained" icon={state === 'in' ? 'map-marker-check' : 'logout-variant'} loading={!!busy} disabled={!!busy}
              onPress={() => act(state === 'in' ? 'in' : 'out')} contentStyle={{ paddingVertical: 10 }} labelStyle={{ fontSize: 16, fontWeight: '800' }}
              buttonColor={state === 'out' ? t.custom.success : undefined}>
              {busy ? 'Getting your location…' : state === 'in' ? 'Check in' : 'Check out'}
            </Button>
          </Animated.View>
        ) : null}

        {problem ? (
          <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: tcDanger(t).bg,
            flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="map-marker-alert-outline" size={20} color={tcDanger(t).fg} />
            <Text variant="bodySmall" style={{ flex: 1, color: tcDanger(t).on }}>{problem.text}</Text>
            {problem.settings ? <Button compact onPress={openSettings}>Settings</Button> : null}
          </View>
        ) : null}

        {actionable ? (
          <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.sm, textAlign: 'center' }}>
            📍 Location is read only when you tap — never tracked
          </Text>
        ) : null}
        {state === 'done' && rec?.manual ? (
          <Text variant="labelSmall" style={{ color: tc.fg, marginTop: space.sm }}>Marked by the office{rec.note ? ` · ${rec.note}` : ''}</Text>
        ) : null}
      </View>
    </FadeIn>
  );
}

function tcDanger(t: ReturnType<typeof useAppTheme>) {
  return toneColors(t, 'danger');
}
