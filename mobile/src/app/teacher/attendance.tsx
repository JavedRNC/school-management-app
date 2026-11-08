import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { AnimatedFAB, Button, ProgressBar, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FilterChips, Hero, Icon, LoadingCards, Screen, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { AttendanceRow, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Attendance() {
  const t = useAppTheme();
  const { user } = useAuth();
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const [classId, setClassId] = useState<number | null>(null);
  const [offset, setOffset] = useState(new Date().getDay() === 0 ? 1 : 0);
  const day = isoDay(offset);

  useEffect(() => {
    if (classes.data && classId == null) {
      const own = classes.data.find((c) => c.class_teacher_id === user?.id) ?? classes.data[0];
      if (own) setClassId(own.id);
    }
  }, [classes.data, classId, user]);

  const dayOpts = [0, 1, 2, 3, 4, 5, 6].filter((o) => new Date(isoDay(o) + 'T00:00:00').getDay() !== 0).map((o) => ({
    label: o === 0 ? 'Today' : o === 1 ? 'Yesterday' : new Date(isoDay(o) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
    value: o,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {classes.error ? <Screen><ErrorState message={classes.error} onRetry={classes.reload} /></Screen>
        : !classes.data ? <Screen header={<Hero title="Attendance" compact />}><LoadingCards /></Screen>
        : !classes.data.length ? <Screen header={<Hero title="Attendance" compact />}><EmptyState icon="google-classroom" title="No classes assigned" text="Ask the principal to assign you a class." /></Screen>
        : classId ? (
          <AttendanceSheet key={`${classId}-${day}`} classId={classId} day={day}
            header={(summary) => (
              <>
                <Hero title="Attendance" subtitle={new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} compact>
                  {summary}
                </Hero>
                <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
                  <FilterChips options={classes.data!.map((c) => ({ label: c.name, value: c.id, icon: 'google-classroom' as const }))} value={classId} onChange={setClassId} />
                  <FilterChips options={dayOpts} value={offset} onChange={setOffset} />
                </View>
              </>
            )} />
        ) : null}
    </View>
  );
}

function AttendanceSheet({ classId, day, header }: { classId: number; day: string; header: (summary: ReactNode) => ReactNode }) {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<AttendanceRow[]>('/attendance', { params: { class_id: classId, day } }), [classId, day]);
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setMarks(Object.fromEntries(data.map((r) => [r.student_id, r.present ?? true])));
  }, [data]);

  const total = data?.length ?? 0;
  const present = Object.values(marks).filter(Boolean).length;
  const already = !!data?.some((r) => r.present !== null);
  const changed = !!data?.some((r) => r.present !== null && r.present !== marks[r.student_id]);

  function setAll(v: boolean) {
    haptic.light();
    const prev = marks;
    setMarks(Object.fromEntries((data ?? []).map((r) => [r.student_id, v])));
    toast(v ? 'Everyone marked present' : 'Everyone marked absent', { action: { label: 'Undo', onPress: () => setMarks(prev) } });
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await api('/attendance', { body: { class_id: classId, date: day, records: data.map((r) => ({ student_id: r.student_id, present: marks[r.student_id] ?? true })) } });
      toast(`Saved · ${present} present, ${total - present} absent`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const summary = data ? (
    <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.lg, elevation: 3,
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.custom.success }}>{present}</Text>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>present</Text>
          <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.custom.danger, marginLeft: space.md }}>{total - present}</Text>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>absent</Text>
        </View>
        {already ? <ToneChip text={changed ? 'Edited' : 'Saved'} tone={changed ? 'warning' : 'success'} icon={changed ? 'pencil' : 'check'} /> : <ToneChip text="Not saved" tone="warning" />}
      </View>
      <ProgressBar progress={total ? present / total : 0} color={t.custom.success} style={{ height: 8, borderRadius: 4, backgroundColor: t.custom.dangerContainer }} />
    </View>
  ) : <View style={{ height: 40 }} />;

  return (
    <>
      <Screen header={header(summary)} onRefresh={refresh} refreshing={refreshing} footerSpace={140}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards count={5} /> : !data.length ? <EmptyState icon="account-off-outline" title="No students in this class" /> : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, flex: 1 }}>Tap to toggle</Text>
              <Button compact icon="check-all" onPress={() => setAll(true)}>All present</Button>
              <Button compact icon="close" textColor={t.custom.danger} onPress={() => setAll(false)}>All absent</Button>
            </View>
            {data.map((r) => (
              <StudentToggle key={r.student_id} row={r} present={marks[r.student_id] ?? true}
                onToggle={() => setMarks((m) => ({ ...m, [r.student_id]: !(m[r.student_id] ?? true) }))} />
            ))}
          </>
        )}
      </Screen>
      {data?.length ? (
        <AnimatedFAB icon={already ? 'content-save-edit-outline' : 'content-save-check-outline'} label={busy ? 'Saving…' : already ? 'Update attendance' : 'Save attendance'}
          extended onPress={save} disabled={busy} style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
    </>
  );
}

function StudentToggle({ row, present, onToggle }: { row: AttendanceRow; present: boolean; onToggle: () => void }) {
  const t = useAppTheme();
  const anim = useRef(new Animated.Value(present ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: present ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
  }, [present, anim]);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [t.custom.dangerContainer, t.custom.successContainer] });
  const knob = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 30] });
  return (
    <Pressable onPress={() => { haptic.light(); onToggle(); }}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: false, speed: 40 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: false, speed: 40 }).start()}>
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, marginBottom: space.sm, borderRadius: radius.lg,
        backgroundColor: bg, transform: [{ scale }] }}>
        <UserAvatar name={row.name} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ fontWeight: '600', color: t.colors.onSurface }}>{row.name}</Text>
          <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Roll no. {row.roll_no ?? '-'}</Text>
        </View>
        <View style={{ width: 60, height: 32, borderRadius: 16, backgroundColor: present ? t.custom.success : t.custom.danger, justifyContent: 'center' }}>
          <Animated.View style={{ position: 'absolute', left: knob, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={present ? 'check' : 'close'} size={16} color={present ? t.custom.success : t.custom.danger} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
