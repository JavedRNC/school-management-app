import { useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveRing } from '@/components/charts';
import { EmptyState, ErrorState, Hero, Icon, IconName, LoadingCards, Panel, Screen, ToneChip } from '@/components/ui';
import { SelectField } from '@/components/SelectField';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, prefersReducedMotion, useToast } from '@/lib/feedback';
import { cardEdge, initials, radius, space, useAppTheme } from '@/lib/theme';
import type { AttendanceRow, AttendanceSheet as Sheet, Holiday, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AttendanceScreen() {
  const params = useLocalSearchParams<{ class_id?: string }>();
  const t = useAppTheme();
  const { user, school } = useAuth();
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const holidays = useLoad(() => api<Holiday[]>('/holidays', { params: { start: isoDay(6), end: isoDay(0) } }).catch(() => [] as Holiday[]));
  const [classId, setClassId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const day = isoDay(offset);
  const working = school?.working_days?.length ? school.working_days : [0, 1, 2, 3, 4, 5];
  const offReason = (iso: string): string | null => {
    const h = (holidays.data ?? []).find((x) => x.is_off && x.start_date <= iso && x.end_date >= iso);
    if (h) return h.name;
    const wd = (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
    return working.includes(wd) ? null : 'Weekly off';
  };

  useEffect(() => {
    if (classes.data && classId == null) {
      const wanted = params.class_id ? classes.data.find((c) => c.id === Number(params.class_id)) : undefined;
      const own = wanted ?? classes.data.find((c) => c.class_teacher_id === user?.id) ?? classes.data[0];
      if (own) setClassId(own.id);
    }
  }, [classes.data, classId, user, params.class_id]);

  const dayOpts = [0, 1, 2, 3, 4, 5, 6].map((o) => {
    const iso = isoDay(o);
    return { label: o === 0 ? 'Today' : o === 1 ? 'Yesterday' : new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' }), value: o };
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {classes.error ? <Screen><ErrorState message={classes.error} onRetry={classes.reload} /></Screen>
        : !classes.data ? <Screen header={<Hero title="Attendance" compact />}><LoadingCards /></Screen>
        : !classes.data.length ? <Screen header={<Hero title="Attendance" compact />}><EmptyState icon="google-classroom" title="No classes assigned" text="Ask the principal to assign you a class." /></Screen>
        : classId ? (
          <AttendanceSheet key={`${classId}-${day}`} classId={classId} day={day}
            classTeacherId={classes.data.find((c) => c.id === classId)?.class_teacher_id ?? null}
            header={(summary) => (
              <Hero title="Attendance" compact>
                <DayStepper offset={offset} setOffset={setOffset} label={dayOpts[offset].label} date={day} off={offReason(day)} />
                <SelectField label="Class" options={classes.data!.map((c) => ({ label: c.name, value: c.id, icon: 'google-classroom' as const, sub: c.student_count != null ? `${c.student_count} students` : undefined }))}
                  value={classId} onChange={setClassId} />
                {summary}
              </Hero>
            )} />
        ) : null}
    </View>
  );
}

function AttendanceSheet({ classId, day, header, classTeacherId }: {
  classId: number; day: string; header: (summary: ReactNode) => ReactNode; classTeacherId: number | null;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const { user, school } = useAuth();
  const { data: sheet, error, reload, refresh, refreshing } = useLoad(() => api<Sheet>('/attendance', { params: { class_id: classId, day } }), [classId, day]);
  const data = sheet?.rows;
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(false);
  const manager = !!user && ['principal', 'vice_principal', 'coordinator'].includes(user.role);
  const readOnlySchool = school?.can_write === false;

  useEffect(() => {
    if (data) setMarks(Object.fromEntries(data.map((r) => [r.student_id, r.present ?? true])));
  }, [data]);

  const rows = data ?? [];
  const total = rows.length;
  const present = Object.values(marks).filter(Boolean).length;
  const already = rows.some((r) => r.present !== null);
  const changed = rows.some((r) => r.present !== null && r.present !== marks[r.student_id]);
  const offDay = !!sheet && !sheet.is_school_day;
  const canEdit = !!sheet && sheet.can_edit && !readOnlySchool && (!offDay || (manager && override));
  const isClassTeacher = !!user && classTeacherId === user.id;
  const [view, setView] = useViewPref(t.shape.defaultView);
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const tileW = Math.floor((Math.min(screenW, 640) - space.lg * 2 - GRID_GAP * 2) / 3);
  const toggle = (id: number) => setMarks((m) => ({ ...m, [id]: !(m[id] ?? true) }));

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
      await api('/attendance', { body: { class_id: classId, date: day, override,
        records: rows.map((r) => ({ student_id: r.student_id, present: marks[r.student_id] ?? true })) } });
      toast(`Saved · ${present} present, ${total - present} absent`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const absent = total - present;
  const summary = sheet ? (
    <View style={[{ backgroundColor: t.colors.elevation.level1, borderRadius: t.shape.card, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.lg }, cardEdge(t)]}
      accessible accessibilityLabel={`${present} present, ${absent} absent out of ${total}. ${already ? (changed ? 'Edited, not saved yet' : 'Saved') : 'Not saved yet'}`}>
      <LiveRing value={total ? present / total : 0} color={t.custom.present} track={t.custom.dangerContainer}>
        <Text variant="headlineSmall" style={{ color: t.colors.onSurface, lineHeight: 26 }}>{present}</Text>
        <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: -2 }}>of {total}</Text>
      </LiveRing>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="headlineMedium" style={{ color: t.custom.present }}>{present}</Text>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurfaceVariant }}>present</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="headlineSmall" style={{ color: absent ? t.custom.danger : t.colors.outline }}>{absent}</Text>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurfaceVariant }}>absent</Text>
        </View>
      </View>
      {already ? <ToneChip text={changed ? 'Edited' : 'Saved'} tone={changed ? 'warning' : 'success'} icon={changed ? 'pencil' : 'check'} /> : <ToneChip text="Not saved" tone="warning" />}
    </View>
  ) : <View style={{ height: 40 }} />;

  return (
    <>
      <Screen header={header(summary)} onRefresh={refresh} refreshing={refreshing} footerSpace={canEdit && rows.length ? 110 + insets.bottom : 40}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {sheet && offDay ? (
          <Panel tone="primary" icon="beach" title={`No school: ${sheet.reason || 'holiday'}`}
            subtitle={already ? 'Attendance was recorded for this day anyway.' : "Attendance isn't needed on this day."}>
            {manager && sheet.can_edit ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onPrimaryContainer }}>Mark anyway (school opened)</Text>
                <Switch value={override} onValueChange={(v) => { haptic.tap(); setOverride(v); }} />
              </View>
            ) : null}
          </Panel>
        ) : null}
        {sheet && !sheet.can_edit && sheet.lock_reason ? (
          <Panel tone="warning" icon="lock-outline" title="Read only" subtitle={sheet.lock_reason} />
        ) : null}
        {readOnlySchool ? <Panel tone="danger" icon="lock-alert-outline" title="Subscription expired" subtitle="Attendance can't be changed until it's renewed." /> : null}
        {sheet && isClassTeacher && sheet.is_school_day && !already && sheet.can_edit ? (
          <View style={{ marginBottom: space.md }}>
            <ToneChip text="You're the class teacher — attendance is required today" tone="warning" icon="alert-circle-outline" compact={false} />
          </View>
        ) : null}
        {sheet?.marked_by ? (
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>Marked by {sheet.marked_by}</Text>
        ) : null}
        {!sheet ? <LoadingCards count={5} /> : !rows.length ? <EmptyState icon="account-off-outline" title="No students in this class" /> : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: space.sm }}>
              <ViewToggle value={view ?? t.shape.defaultView} onChange={setView} />
              <View style={{ flex: 1 }} />
              {canEdit ? (
                <>
                  <Button compact icon="check-all" onPress={() => setAll(true)} labelStyle={{ fontWeight: '700' }}>All present</Button>
                  <Button compact textColor={t.custom.danger} onPress={() => setAll(false)}>All absent</Button>
                </>
              ) : null}
            </View>
            {canEdit && view ? (
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
                {view === 'grid' ? 'Everyone starts present. Tap a student to mark absent.' : t.shape.attendanceRow === 'register' ? 'Tap P or A for each student.' : 'Tap a student to switch between present and absent.'}
              </Text>
            ) : null}
            {view == null ? null : view === 'grid' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
                {rows.map((r) => (
                  <StudentTile key={r.student_id} row={r} width={tileW} present={marks[r.student_id] ?? true} disabled={!canEdit} onToggle={() => toggle(r.student_id)} />
                ))}
              </View>
            ) : rows.map((r) => (
              t.shape.attendanceRow === 'register'
                ? <RegisterRow key={r.student_id} row={r} present={marks[r.student_id] ?? true} disabled={!canEdit}
                    onSet={(v) => setMarks((m) => ({ ...m, [r.student_id]: v }))} />
                : <StudentRow key={r.student_id} row={r} present={marks[r.student_id] ?? true} disabled={!canEdit} onToggle={() => toggle(r.student_id)} />
            ))}
          </>
        )}
      </Screen>
      {rows.length && canEdit ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md + insets.bottom,
          backgroundColor: t.colors.background, borderTopWidth: 1, borderTopColor: t.custom.cardBorder }}>
          <Button mode="contained" onPress={save} loading={busy} disabled={busy} icon={already ? 'content-save-edit-outline' : 'content-save-check-outline'}
            style={{ borderRadius: 16 }} contentStyle={{ height: 54 }} labelStyle={{ fontSize: 17, lineHeight: 24, fontWeight: '700' }}>
            {busy ? 'Saving…' : already ? 'Update attendance' : 'Save attendance'}
          </Button>
        </View>
      ) : null}
    </>
  );
}

const GRID_GAP = 10;
const VIEW_KEY = 'attendance_view';
type View_ = 'list' | 'grid';

/** Remembers List / Grid on this phone. Until the teacher picks one, the theme decides (Night opens on the grid). */
function useViewPref(fallback: View_): [View_ | null, (v: View_) => void] {
  const [v, setV] = useState<View_ | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // a tap made before the read finishes wins over the stored value
    AsyncStorage.getItem(VIEW_KEY).then((x) => { if (x === 'grid' || x === 'list') setV((cur) => cur ?? x); }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  // null until the saved choice is read, so a saved List never flashes as the theme's Grid (or the other way round)
  return [loaded ? v ?? fallback : null, (x) => { setV(x); AsyncStorage.setItem(VIEW_KEY, x).catch(() => {}); }];
}

function ViewToggle({ value, onChange }: { value: View_; onChange: (v: View_) => void }) {
  const t = useAppTheme();
  const opts: { v: View_; icon: IconName; label: string }[] = [{ v: 'list', icon: 'format-list-bulleted', label: 'List' }, { v: 'grid', icon: 'view-grid-outline', label: 'Grid' }];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Show students as" style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill,
      backgroundColor: t.colors.surfaceVariant }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <Pressable key={o.v} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={o.label}
            onPress={() => { if (!on) { haptic.tap(); onChange(o.v); } }}
            style={{ height: 44, paddingHorizontal: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: on ? t.colors.elevation.level1 : 'transparent' }}>
            <Icon name={o.icon} size={18} color={on ? t.colors.primary : t.colors.onSurfaceVariant} />
            <Text variant="labelLarge" style={{ color: on ? t.colors.primary : t.colors.onSurfaceVariant }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Previous / next day, up to a week back. */
function DayStepper({ offset, setOffset, label, date, off }: { offset: number; setOffset: (n: number) => void; label: string; date: string; off: string | null }) {
  const t = useAppTheme();
  const btn = (dir: 1 | -1, icon: IconName, a11y: string) => {
    const disabled = dir === 1 ? offset >= 6 : offset <= 0;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} hitSlop={4}
        onPress={() => { haptic.tap(); setOffset(offset + dir); }}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1,
          borderWidth: 1.5, borderColor: t.colors.outlineVariant, backgroundColor: disabled ? 'transparent' : t.colors.elevation.level1 }}>
        <Icon name={icon} size={22} color={t.colors.onSurface} />
      </Pressable>
    );
  };
  const nice = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
      {btn(1, 'chevron-left', 'Previous day')}
      <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${label}, ${nice}${off ? `, no school: ${off}` : ''}`}>
        <Text variant="headlineSmall" style={{ color: t.colors.onBackground }}>{label}</Text>
        <Text variant="bodyMedium" style={{ color: off ? t.custom.warning : t.colors.onSurfaceVariant }} numberOfLines={1}>
          {off ? `${nice} · ${off}` : nice}
        </Text>
      </View>
      {btn(-1, 'chevron-right', 'Next day')}
    </View>
  );
}

function usePress() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (x: number) => Animated.spring(scale, { toValue: x, useNativeDriver: true, speed: 40, bounciness: x === 1 ? 6 : 0 }).start();
  return { scale, onPressIn: () => to(0.97), onPressOut: () => to(1) };
}

function StudentRow({ row, present, onToggle, disabled }: { row: AttendanceRow; present: boolean; onToggle: () => void; disabled?: boolean }) {
  const t = useAppTheme();
  const { scale, onPressIn, onPressOut } = usePress();
  return (
    <Pressable disabled={disabled} onPress={() => { haptic.light(); onToggle(); }} onPressIn={onPressIn} onPressOut={onPressOut}
      accessibilityRole="switch" accessibilityState={{ checked: present, disabled }} aria-checked={present}
      accessibilityLabel={`${row.name}, roll ${row.roll_no ?? 'none'}, ${present ? 'present' : 'absent'}`}
      accessibilityHint={disabled ? undefined : present ? 'Double tap to mark absent' : 'Double tap to mark present'}>
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, paddingLeft: space.sm, paddingRight: space.md,
        marginBottom: space.sm, borderRadius: Math.min(t.shape.card, 18), borderWidth: 1.5, transform: [{ scale }], opacity: disabled ? 0.8 : 1,
        backgroundColor: present ? t.colors.elevation.level1 : t.custom.absentWash, borderColor: present ? t.custom.cardBorder : t.custom.absentEdge }}>
        <Initials name={row.name} present={present} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ color: t.colors.onSurface, fontSize: 17 }} numberOfLines={1}>{row.name}</Text>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Roll {row.roll_no ?? '–'}{row.on_leave ? ' · On leave' : ''}</Text>
        </View>
        <View style={{ minWidth: 84, height: 34, borderRadius: 17, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: present ? t.custom.present : t.custom.danger }}>
          <Text variant="labelLarge" style={{ color: t.dark ? t.colors.background : '#FFFFFF', fontWeight: '700' }}>{present ? 'Present' : 'Absent'}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Register theme: roll number in the margin, then the name, then a P and an A box, like the paper register. */
function RegisterRow({ row, present, onSet, disabled }: { row: AttendanceRow; present: boolean; onSet: (v: boolean) => void; disabled?: boolean }) {
  const t = useAppTheme();
  const box = (v: boolean) => {
    const on = present === v;
    const col = v ? t.custom.present : t.custom.danger;
    return (
      <Pressable disabled={disabled} hitSlop={4} onPress={() => { if (!on) { haptic.light(); onSet(v); } }}
        accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} aria-checked={on}
        accessibilityLabel={`${row.name}, roll ${row.roll_no ?? 'none'}: ${v ? 'present' : 'absent'}`}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
          borderColor: on ? col : t.colors.outlineVariant, backgroundColor: on ? col : t.colors.elevation.level1 }}>
        <Text variant="titleMedium" style={{ color: on ? '#FFFFFF' : t.colors.outline, fontWeight: '700' }}>{v ? 'P' : 'A'}</Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={row.name}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, gap: space.sm, opacity: disabled ? 0.8 : 1,
        borderBottomWidth: 1, borderBottomColor: t.custom.cardBorder, backgroundColor: present ? 'transparent' : t.custom.absentWash,
        marginHorizontal: -space.lg, paddingRight: space.lg }}>
      <View style={{ width: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRightWidth: 2, borderRightColor: t.custom.absentEdge }}>
        <Text variant="titleSmall" style={{ color: t.colors.onSurfaceVariant }}>{row.roll_no ?? '–'}</Text>
      </View>
      <View style={{ flex: 1, paddingLeft: 6 }}>
        <Text variant="bodyLarge" numberOfLines={1} style={{ color: present ? t.colors.onSurface : t.custom.danger, fontWeight: '500' }}>{row.name}</Text>
        {row.on_leave ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>On leave</Text> : null}
      </View>
      {box(true)}
      {box(false)}
    </View>
  );
}

function StudentTile({ row, present, onToggle, disabled, width }: { row: AttendanceRow; present: boolean; onToggle: () => void; disabled?: boolean; width: number }) {
  const t = useAppTheme();
  const { scale, onPressIn, onPressOut } = usePress();
  const sink = useRef(new Animated.Value(present ? 1 : 0.96)).current;
  useEffect(() => {
    if (prefersReducedMotion()) sink.setValue(present ? 1 : 0.96);
    else Animated.spring(sink, { toValue: present ? 1 : 0.96, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  }, [sink, present]);
  const first = row.name.split(/\s+/)[0];
  return (
    <Pressable disabled={disabled} onPress={() => { haptic.light(); onToggle(); }} onPressIn={onPressIn} onPressOut={onPressOut}
      accessibilityRole="switch" accessibilityState={{ checked: present, disabled }} aria-checked={present}
      accessibilityLabel={`${row.name}, roll ${row.roll_no ?? 'none'}, ${present ? 'present' : 'absent'}`}
      accessibilityHint={disabled ? undefined : present ? 'Double tap to mark absent' : 'Double tap to mark present'}>
      <Animated.View style={{ width, minHeight: 118, borderRadius: t.shape.card, borderWidth: 1.5, paddingVertical: space.md, paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.8 : 1, transform: [{ scale: Animated.multiply(scale, sink) }],
        backgroundColor: present ? t.colors.elevation.level1 : t.custom.absentWash, borderColor: present ? t.custom.cardBorder : t.custom.danger }}>
        {row.roll_no != null ? (
          <Text variant="labelSmall" style={{ position: 'absolute', top: 6, left: 10, color: t.colors.onSurfaceVariant }}>{row.roll_no}</Text>
        ) : null}
        <Initials name={row.name} present={present} size={46} />
        <Text variant="titleSmall" numberOfLines={1} style={{ color: t.colors.onSurface, maxWidth: '100%' }}>{first}</Text>
        <Text variant="labelMedium" style={{ color: present ? t.custom.present : t.custom.danger }}>{present ? 'Present' : 'Absent'}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Initials({ name, present, size }: { name: string; present: boolean; size: number }) {
  const t = useAppTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: present ? t.custom.presentContainer : t.custom.danger }}>
      <Text variant="labelLarge" style={{ fontSize: size * 0.34, lineHeight: size * 0.48, fontWeight: '700',
        color: present ? t.custom.onPresentContainer : (t.dark ? t.colors.background : '#FFFFFF') }}>{initials(name)}</Text>
    </View>
  );
}
