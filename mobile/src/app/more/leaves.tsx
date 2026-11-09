import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, Button, Dialog, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { ApplyLeaveSheet } from '@/components/leaves/ApplyLeaveSheet';
import { fmtDay, STAFF_ROLES, TYPE_ICON, TYPE_LABEL } from '@/components/leaves/common';
import { LeaveCard } from '@/components/leaves/LeaveCard';
import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Screen, Sheet, StatTile, ToneChip, UserAvatar,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { LeaveBalance, LeaveRequest, LeaveStatus, OnLeaveToday, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Tab = 'approvals' | 'mine' | 'children';

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

export default function Leaves() {
  const t = useAppTheme();
  const { user, school } = useAuth();
  const enabled = useModule('leaves');
  const canSettings = useCan('settings', 'edit');
  const canQuota = user?.role === 'principal' || canSettings;
  const params = useLocalSearchParams<{ apply?: string }>();
  const role = user?.role ?? 'student';
  const isStaff = STAFF_ROLES.includes(role);
  const isParent = role === 'parent';
  const readOnly = school ? !school.can_write : false;

  const { data, error, loading, refreshing, refresh, reload } = useLoad(async () => {
    if (!enabled) return null;
    const [inbox, today, mine, balance, kids] = await Promise.all([
      isParent ? Promise.resolve(null) : orNull(api<LeaveRequest[]>('/leaves', { params: { scope: 'inbox' } })),
      isParent ? Promise.resolve(null) : orNull(api<OnLeaveToday>('/leaves/today')),
      isStaff || isParent ? api<LeaveRequest[]>('/leaves', { params: { scope: 'mine' } }) : Promise.resolve([] as LeaveRequest[]),
      isStaff ? orNull(api<LeaveBalance>('/leaves/balance')) : Promise.resolve(null),
      isParent ? api<User[]>('/me/children') : Promise.resolve([] as User[]),
    ]);
    return { inbox, today, mine, balance, kids };
  }, [enabled, role]);

  const tabs = useMemo(() => {
    const out: { value: Tab; label: string; icon: string }[] = [];
    if (data?.inbox && (role !== 'teacher' || data.inbox.length > 0)) {
      const n = data.inbox.filter((x) => x.status === 'pending' && x.can_decide).length;
      out.push({ value: 'approvals', label: n ? `Approvals · ${n}` : 'Approvals', icon: 'inbox-arrow-down' });
    }
    if (isStaff) out.push({ value: 'mine', label: 'My leaves', icon: 'account-clock' });
    if (isParent) out.push({ value: 'children', label: 'Children', icon: 'human-male-child' });
    return out;
  }, [data, isStaff, isParent]);

  const [tab, setTab] = useState<Tab | null>(null);
  const current: Tab | null = tab && tabs.some((x) => x.value === tab) ? tab : tabs[0]?.value ?? null;
  const [applyOpen, setApplyOpen] = useState(false);
  const [childId, setChildId] = useState<number | null>(null);
  const child = data?.kids.find((k) => k.id === (childId ?? data?.kids[0]?.id)) ?? null;

  // deep link from the parent home card: /more/leaves?apply=1
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (params.apply === '1' && !autoOpened && data && (isStaff || (isParent && data.kids.length))) {
      setAutoOpened(true);
      setApplyOpen(true);
    }
  }, [params.apply, autoOpened, data, isStaff, isParent]);

  if (!enabled) {
    return (
      <Screen header={<Hero title="Leaves" compact />}>
        <EmptyState icon="lock-outline" title="Leaves aren't part of your school's plan" text="Ask your principal to enable the Leaves module." />
      </Screen>
    );
  }

  const fabLabel = isParent ? (child ? `Apply leave for ${child.name.split(' ')[0]}` : 'Apply leave') : 'Apply for leave';
  const showFab = !readOnly && ((current === 'mine' && isStaff) || (current === 'children' && isParent && !!child));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} footerSpace={120}
        header={<Hero title="Leaves" compact subtitle={isParent ? "Your children's leave requests" : current === 'approvals' ? 'Review and approve requests' : 'Apply and track your leave'} />}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingCards count={4} /> : null}
        {data ? (
          <>
            {tabs.length > 1 ? (
              <SegmentedButtons value={current ?? ''} onValueChange={(v) => { haptic.tap(); setTab(v as Tab); }} style={{ marginBottom: space.md }}
                buttons={tabs.map((x) => ({ value: x.value, label: x.label, icon: x.icon }))} />
            ) : null}
            {!tabs.length ? <EmptyState icon="calendar-remove" title="Nothing here for you" text="Leave requests appear here for staff, parents and approvers." /> : null}
            {current === 'approvals' && data.inbox ? (
              <Approvals inbox={data.inbox} today={data.today} onChanged={reload} readOnly={readOnly} />
            ) : null}
            {current === 'mine' ? (
              <MyLeaves mine={data.mine} balance={data.balance} onChanged={reload} readOnly={readOnly} />
            ) : null}
            {current === 'children' ? (
              <ChildrenLeaves kids={data.kids} mine={data.mine} child={child} onPick={setChildId} onChanged={reload} readOnly={readOnly} />
            ) : null}
            {canQuota && (current === 'approvals' || current === 'mine') ? <QuotaPanel readOnly={readOnly} /> : null}
          </>
        ) : null}
      </Screen>
      {showFab ? (
        <AnimatedFAB icon="calendar-plus" label={fabLabel} extended onPress={() => { haptic.tap(); setApplyOpen(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
      <ApplyLeaveSheet visible={applyOpen} onDismiss={() => setApplyOpen(false)} child={isParent ? child : null}
        onDone={() => { setApplyOpen(false); reload(); }} />
    </View>
  );
}

// ---------------------------------------------------------------- approvals
function Approvals({ inbox, today, onChanged, readOnly }: {
  inbox: LeaveRequest[]; today: OnLeaveToday | null; onChanged: () => void; readOnly: boolean;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveStatus | 'all'>('pending');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [comment, setComment] = useState('');
  const list = inbox.filter((x) => status === 'all' || x.status === status);
  const count = (s: LeaveStatus) => inbox.filter((x) => x.status === s).length;
  const onLeave = [...(today?.staff ?? []).map((x) => ({ ...x, kind: 'Staff' })), ...(today?.students ?? []).map((x) => ({ ...x, kind: 'Student' }))];

  async function decide(lr: LeaveRequest, approve: boolean, note = '') {
    setBusyId(lr.id);
    try {
      await api(`/leaves/${lr.id}/decide`, { body: { approve, comment: note.trim() } });
      toast(approve ? `Approved ${lr.user_name.split(' ')[0]}'s leave ✓` : `Rejected ${lr.user_name.split(' ')[0]}'s leave`);
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {onLeave.length ? (
        <FadeIn>
          <Panel title="On leave today" subtitle={`${onLeave.length} ${onLeave.length === 1 ? 'person' : 'people'}`} icon="account-clock-outline" tone="warning">
            {onLeave.map((p, i) => (
              <Row key={`${p.kind}-${p.user_id}`} title={p.name} divider={i < onLeave.length - 1}
                subtitle={`${p.kind}${p.class_name ? ` · Class ${p.class_name}` : ''} · ${TYPE_LABEL[p.leave_type] ?? p.leave_type}${p.half_day ? ' · half day' : ''} · until ${fmtDay(p.until)}`}
                left={<UserAvatar name={p.name} size={36} />} />
            ))}
          </Panel>
        </FadeIn>
      ) : null}
      <FilterChips value={status} onChange={setStatus} options={[
        { label: `Pending · ${count('pending')}`, value: 'pending', icon: 'clock-outline' },
        { label: `Approved · ${count('approved')}`, value: 'approved', icon: 'check-circle-outline' },
        { label: `Rejected · ${count('rejected')}`, value: 'rejected', icon: 'close-circle-outline' },
        { label: 'All', value: 'all', icon: 'view-list-outline' }]} />
      {list.length ? list.map((lr, i) => (
        <LeaveCard key={lr.id} lr={lr} index={i} showPerson busy={busyId === lr.id} disabled={readOnly}
          onApprove={lr.can_decide ? () => decide(lr, true) : undefined}
          onReject={lr.can_decide ? () => { setComment(''); setRejecting(lr); } : undefined} />
      )) : (
        <EmptyState icon={status === 'pending' ? 'check-all' : 'inbox-outline'}
          title={status === 'pending' ? 'All caught up 🎉' : 'No requests'} text={status === 'pending' ? 'No leave requests are waiting for you.' : undefined} />
      )}
      <Sheet visible={!!rejecting} onDismiss={() => setRejecting(null)} title="Reject leave request">
        {rejecting ? (
          <View>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              {rejecting.user_name} · {TYPE_LABEL[rejecting.leave_type]} · {fmtDay(rejecting.start_date)}
              {rejecting.end_date !== rejecting.start_date ? ` – ${fmtDay(rejecting.end_date)}` : ''}
            </Text>
            <TextInput mode="outlined" label="Reason (shared with them)" value={comment} onChangeText={setComment} multiline numberOfLines={3}
              style={{ minHeight: 84, marginBottom: space.md }} placeholder="e.g. Exams that week — please choose other dates" />
            <Button mode="contained" icon="close" buttonColor={t.custom.danger} loading={busyId === rejecting.id}
              onPress={() => { const lr = rejecting; setRejecting(null); decide(lr, false, comment); }}>Reject request</Button>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- my leaves (staff)
function MyLeaves({ mine, balance, onChanged, readOnly }: {
  mine: LeaveRequest[]; balance: LeaveBalance | null; onChanged: () => void; readOnly: boolean;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = balance ? `${new Date(balance.year_start + 'T00:00:00').getFullYear()}–${String(new Date(balance.year_end + 'T00:00:00').getFullYear()).slice(2)}` : '';

  async function cancel(lr: LeaveRequest) {
    setCancelling(null);
    try {
      await api(`/leaves/${lr.id}/cancel`, { method: 'POST' });
      toast('Request cancelled');
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <>
      {balance ? (
        <FadeIn>
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>Leave balance · {year} (Apr–Mar)</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            {balance.types.map((b) => (
              <StatTile key={b.type} icon={TYPE_ICON[b.type] ?? 'calendar'} label={`${TYPE_LABEL[b.type] ?? b.type} left`} value={b.left}
                hint={`${b.used % 1 ? b.used.toFixed(1) : b.used} of ${b.quota} used`}
                tone={b.quota && b.left / b.quota < 0.25 ? 'danger' : b.quota && b.left / b.quota < 0.5 ? 'warning' : 'success'} />
            ))}
          </View>
          {balance.other_used ? <ToneChip text={`Other leave used: ${balance.other_used} day(s)`} /> : null}
        </FadeIn>
      ) : null}
      <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onBackground, marginVertical: space.sm }}>My requests</Text>
      {mine.length ? mine.map((lr, i) => {
        const cancellable = lr.status === 'pending' || (lr.status === 'approved' && lr.start_date > todayIso);
        return <LeaveCard key={lr.id} lr={lr} index={i} disabled={readOnly} onCancel={cancellable ? () => setCancelling(lr) : undefined} />;
      }) : <EmptyState icon="beach" title="No leave requests yet" text="Tap “Apply for leave” to send one to the principal." />}
      <Portal>
        <Dialog visible={!!cancelling} onDismiss={() => setCancelling(null)}>
          <Dialog.Icon icon="cancel" />
          <Dialog.Title style={{ textAlign: 'center' }}>Cancel this request?</Dialog.Title>
          <Dialog.Actions>
            <Button onPress={() => setCancelling(null)}>Keep</Button>
            <Button textColor={t.colors.error} onPress={() => cancelling && cancel(cancelling)}>Cancel request</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

// ---------------------------------------------------------------- parent
function ChildrenLeaves({ kids, mine, child, onPick, onChanged, readOnly }: {
  kids: User[]; mine: LeaveRequest[]; child: User | null; onPick: (id: number) => void; onChanged: () => void; readOnly: boolean;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  if (!kids.length) return <EmptyState icon="account-child-outline" title="No children linked yet" text="Ask the school to link your child to your account." />;
  const list = mine.filter((x) => !child || x.user_id === child.id);
  const todayIso = new Date().toISOString().slice(0, 10);

  async function cancel(lr: LeaveRequest) {
    setCancelling(null);
    try {
      await api(`/leaves/${lr.id}/cancel`, { method: 'POST' });
      toast('Request cancelled');
      onChanged();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <>
      {kids.length > 1 ? (
        <FilterChips value={child?.id ?? kids[0].id} onChange={onPick}
          options={kids.map((k) => ({ label: k.name.split(' ')[0], value: k.id, icon: 'account-school-outline' as const }))} />
      ) : null}
      <FadeIn>
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <UserAvatar name={child?.name ?? '?'} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{child?.name}</Text>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                {list.filter((x) => x.status === 'approved').length} approved · {list.filter((x) => x.status === 'pending').length} pending
              </Text>
            </View>
          </View>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
            Approved leave days show as “Leave” and don't lower attendance %.
          </Text>
        </Panel>
      </FadeIn>
      {list.length ? list.map((lr, i) => {
        const cancellable = lr.status === 'pending' || (lr.status === 'approved' && lr.start_date > todayIso);
        return <LeaveCard key={lr.id} lr={lr} index={i} disabled={readOnly} onCancel={cancellable ? () => setCancelling(lr) : undefined} />;
      }) : <EmptyState icon="calendar-blank-outline" title="No leave requests" text={`Apply leave when ${child?.name.split(' ')[0]} can't come to school.`} />}
      <Portal>
        <Dialog visible={!!cancelling} onDismiss={() => setCancelling(null)}>
          <Dialog.Icon icon="cancel" />
          <Dialog.Title style={{ textAlign: 'center' }}>Cancel this request?</Dialog.Title>
          <Dialog.Actions>
            <Button onPress={() => setCancelling(null)}>Keep</Button>
            <Button textColor={t.colors.error} onPress={() => cancelling && cancel(cancelling)}>Cancel request</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

// ---------------------------------------------------------------- quotas
function QuotaPanel({ readOnly }: { readOnly: boolean }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api<Record<string, number>>('/school/leave-quotas'));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setVals(Object.fromEntries(['casual', 'sick', 'earned'].map((k) => [k, String(data[k] ?? 0)])));
  }, [data]);
  if (!data) return null;
  const dirty = ['casual', 'sick', 'earned'].some((k) => String(data[k] ?? 0) !== (vals[k] ?? ''));

  async function save() {
    setBusy(true);
    try {
      await api('/school/leave-quotas', { method: 'PUT', body: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v) || 0])) });
      toast('Leave quotas updated');
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FadeIn>
      <Panel title="Yearly staff leave quota" subtitle="Days per academic year (April–March)" icon="tune-variant" style={{ marginTop: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          {['casual', 'sick', 'earned'].map((k) => (
            <TextInput key={k} mode="outlined" label={TYPE_LABEL[k]} value={vals[k] ?? ''} keyboardType="number-pad" style={{ flex: 1 }}
              onChangeText={(v) => setVals((s) => ({ ...s, [k]: v.replace(/[^0-9]/g, '') }))} />
          ))}
        </View>
        <Button mode="contained-tonal" icon="content-save-outline" onPress={save} loading={busy} disabled={!dirty || busy || readOnly}>Save quotas</Button>
      </Panel>
    </FadeIn>
  );
}
