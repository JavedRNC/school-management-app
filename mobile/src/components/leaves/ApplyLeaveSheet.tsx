import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Button, HelperText, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';

import { FilterChips, Icon, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { LeaveRequest, User } from '@/lib/types';

import { addDays, daysLabel, estimateDays, isISO, STAFF_TYPES, STUDENT_TYPES, TYPE_ICON, TYPE_LABEL } from './common';

/** Apply for leave: staff (own) or parent (for a child). */
export function ApplyLeaveSheet({ visible, onDismiss, child, onDone }: {
  visible: boolean; onDismiss: () => void; child?: Pick<User, 'id' | 'name'> | null; onDone: (lr: LeaveRequest) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const isParent = !!child;
  const types = isParent ? STUDENT_TYPES : STAFF_TYPES;
  const today = new Date();
  const [type, setType] = useState<string>(isParent ? 'sick' : 'casual');
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [start, setStart] = useState(addDays(today, 0));
  const [end, setEnd] = useState(addDays(today, 1));
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setType(isParent ? 'sick' : 'casual'); setMode('single'); setStart(addDays(new Date(), 0)); setEnd(addDays(new Date(), 1));
      setHalf(false); setReason(''); setError(null); setDone(false); pop.setValue(0);
    }
  }, [visible, isParent, pop]);

  const endDate = mode === 'single' ? start : end;
  const validDates = isISO(start) && isISO(endDate) && endDate >= start;
  const days = estimateDays(start, endDate, school?.working_days, half && mode === 'single');
  const readOnly = school ? !school.can_write : false;
  const quick = [0, 1, 2, 3, 7].map((n) => ({ label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `+${n} days`, value: addDays(today, n) }));

  async function submit() {
    if (!validDates) return haptic.error();
    setBusy(true);
    setError(null);
    try {
      const lr = await api<LeaveRequest>('/leaves', {
        body: { leave_type: type, start_date: start, end_date: endDate, half_day: mode === 'single' && half, reason: reason.trim(),
          ...(child ? { student_id: child.id } : {}) },
      });
      setDone(true);
      haptic.success();
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 12 }).start();
      toast(isParent ? `Leave request sent for ${child?.name.split(' ')[0]}` : 'Leave request sent');
      setTimeout(() => onDone(lr), 900);
    } catch (e) {
      setError((e as Error).message);
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet visible={visible} onDismiss={onDismiss}>
        <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
          <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }], opacity: pop,
            width: 88, height: 88, borderRadius: 44, backgroundColor: t.custom.successContainer, alignItems: 'center', justifyContent: 'center',
            shadowColor: t.custom.success, shadowOpacity: 0.5, shadowRadius: 18, elevation: 6 }}>
            <Icon name="check-bold" size={48} color={t.custom.success} />
          </Animated.View>
          <Text variant="titleLarge" style={{ fontWeight: '800', marginTop: space.lg, color: t.colors.onSurface }}>Request sent</Text>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center' }}>
            {isParent ? "The class teacher will review it. You'll see the decision here." : "You'll see the decision here once it's reviewed."}
          </Text>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={isParent ? `Leave for ${child?.name.split(' ')[0]}` : 'Apply for leave'}>
      <FilterChips label="Type" value={type} onChange={setType}
        options={types.map((k) => ({ label: TYPE_LABEL[k], value: k, icon: TYPE_ICON[k] }))} />
      <SegmentedButtons value={mode} onValueChange={(v) => { haptic.tap(); setMode(v as 'single' | 'range'); if (v === 'range') setHalf(false); }}
        style={{ marginBottom: space.md }}
        buttons={[{ value: 'single', label: 'One day', icon: 'calendar-today' }, { value: 'range', label: 'Several days', icon: 'calendar-range' }]} />
      <FilterChips label={mode === 'single' ? 'Date' : 'From'} value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} options={quick} />
      <TextInput mode="outlined" label={mode === 'single' ? 'Date (YYYY-MM-DD)' : 'From (YYYY-MM-DD)'} value={start} onChangeText={setStart}
        left={<TextInput.Icon icon="calendar" />} error={!isISO(start)} style={{ marginBottom: space.md }} />
      {mode === 'range' ? (
        <>
          <FilterChips label="To" value={end} onChange={setEnd}
            options={[1, 2, 3, 5, 7].map((n) => ({ label: `${n + 1} days`, value: addDays(new Date(start + 'T00:00:00'), n) })).filter((o) => isISO(start))} />
          <TextInput mode="outlined" label="To (YYYY-MM-DD)" value={end} onChangeText={setEnd} left={<TextInput.Icon icon="calendar-end" />}
            error={!isISO(end) || end < start} style={{ marginBottom: space.md }} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Half day</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Morning or afternoon only</Text>
          </View>
          <Switch value={half} onValueChange={(v) => { haptic.tap(); setHalf(v); }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.colors.primaryContainer, borderRadius: radius.lg,
        padding: space.md, marginBottom: space.md }}>
        <Icon name="calendar-check" size={22} color={t.colors.onPrimaryContainer} />
        <Text variant="bodyMedium" style={{ color: t.colors.onPrimaryContainer, flex: 1 }}>
          {validDates ? `${daysLabel(days)} of school${days === 0 ? ' — these are off days' : ''}` : 'Check the dates'}
        </Text>
      </View>
      <TextInput mode="outlined" label="Reason" value={reason} onChangeText={setReason} multiline numberOfLines={3} style={{ minHeight: 84 }}
        placeholder={isParent ? 'e.g. Fever, doctor advised rest' : 'e.g. Family function'} />
      <HelperText type="error" visible={!!error}>{error}</HelperText>
      <Button mode="contained" icon="send" onPress={submit} loading={busy} disabled={!validDates || busy || readOnly}
        contentStyle={{ paddingVertical: 6 }}>
        {readOnly ? 'Read-only — subscription expired' : 'Send request'}
      </Button>
    </Sheet>
  );
}
