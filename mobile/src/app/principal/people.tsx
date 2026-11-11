import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, View } from 'react-native';
import { Button, Searchbar, Text } from 'react-native-paper';

import { PersonRole } from '@/components/people/constants';
import { CredentialsDialog, Credentials } from '@/components/people/CredentialsDialog';
import { PersonSheet } from '@/components/people/PersonSheet';
import { Fab,
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, IconName, LoadingCards, Panel, Row, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { SchoolClass, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Tab = 'student' | 'teacher' | 'parent' | 'staff' | 'principal' | 'removed';

const TAB_ROLE: Record<Tab, PersonRole> = {
  student: 'student', teacher: 'teacher', parent: 'parent', staff: 'vice_principal', principal: 'teacher', removed: 'student',
};

export default function People() {
  const t = useAppTheme();
  const toast = useToast();
  const { user: me } = useAuth();
  const canEdit = useCan('people', 'edit');
  const extraRoles = useModule('extra_roles');
  const canManageStaff = me?.role === 'principal' && extraRoles;

  const [tab, setTab] = useState<Tab>('student');
  const [classId, setClassId] = useState(0);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<User | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [fabExtended, setFabExtended] = useState(true);

  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const all = useLoad(() => api<User[]>('/users'));
  const removed = useLoad(() => (tab === 'removed' ? api<User[]>('/users', { params: { active: 'false' } }) : Promise.resolve([] as User[])), [tab]);

  const className = (id: number | null) => classes.data?.find((c) => c.id === id)?.name ?? '';
  const students = useMemo(() => (all.data ?? []).filter((u) => u.role === 'student'), [all.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of all.data ?? []) {
      const k = u.role === 'vice_principal' || u.role === 'coordinator' ? 'staff' : u.role;
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [all.data]);

  const list = useMemo(() => {
    const src = tab === 'removed' ? removed.data ?? [] : (all.data ?? []).filter((u) =>
      tab === 'staff' ? u.role === 'vice_principal' || u.role === 'coordinator' : u.role === tab);
    const k = q.trim().toLowerCase();
    return src.filter((u) => (tab !== 'student' || !classId || u.class_id === classId) &&
      (!k || u.name.toLowerCase().includes(k) || u.login_id.toLowerCase().includes(k) || (u.phone ?? '').includes(k)));
  }, [tab, all.data, removed.data, q, classId]);

  const loading = tab === 'removed' ? removed.loading && !removed.data : all.loading && !all.data;
  const error = tab === 'removed' ? removed.error : all.error;
  const refreshAll = () => { all.reload(); classes.reload(); if (tab === 'removed') removed.reload(); };

  async function setActive(u: User, active: boolean) {
    try {
      await (active ? api(`/users/${u.id}`, { method: 'PUT', body: { active: true } }) : api(`/users/${u.id}`, { method: 'DELETE' }));
      setSel(null);
      refreshAll();
      toast(active ? `${u.name} restored` : `${u.name} removed`, {
        action: {
          label: 'Undo',
          onPress: async () => {
            try {
              await (active ? api(`/users/${u.id}`, { method: 'DELETE' }) : api(`/users/${u.id}`, { method: 'PUT', body: { active: true } }));
              refreshAll();
            } catch (e) {
              toast((e as Error).message, { error: true });
            }
          },
        },
      });
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setFabExtended(e.nativeEvent.contentOffset.y <= 10);
  const tabOptions: { label: string; value: Tab; icon: IconName }[] = [
    { label: `Students${counts.student ? ` · ${counts.student}` : ''}`, value: 'student', icon: 'account-school-outline' },
    { label: `Teachers${counts.teacher ? ` · ${counts.teacher}` : ''}`, value: 'teacher', icon: 'human-male-board' },
    { label: `Parents${counts.parent ? ` · ${counts.parent}` : ''}`, value: 'parent', icon: 'human-male-female-child' },
    { label: `Staff${counts.staff ? ` · ${counts.staff}` : ''}`, value: 'staff', icon: 'account-tie-outline' },
    { label: 'Principal', value: 'principal', icon: 'shield-account-outline' },
    { label: 'Removed', value: 'removed', icon: 'account-off-outline' },
  ];

  function rowRight(u: User) {
    if (tab === 'removed') {
      return canEdit && u.role !== 'principal'
        ? <Button compact mode="contained-tonal" icon="account-reactivate-outline" onPress={() => setActive(u, true)}>Restore</Button>
        : undefined;
    }
    return (
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {u.role === 'student' ? <ToneChip text={`${className(u.class_id)} · #${u.roll_no ?? '-'}`} tone="primary" /> : null}
        {u.role === 'parent' ? (
          <ToneChip text={`${u.children_ids.length} child${u.children_ids.length === 1 ? '' : 'ren'}`} tone={u.children_ids.length ? 'primary' : 'warning'} />
        ) : null}
        {u.role === 'vice_principal' || u.role === 'coordinator' ? <ToneChip text={ROLE_LABEL[u.role]} tone="primary" /> : null}
        {u.must_change_password ? <ToneChip text="Temp password" tone="warning" icon="key-alert-outline" /> : null}
      </View>
    );
  }

  const showFab = canEdit && tab !== 'principal' && tab !== 'removed' && (tab !== 'staff' || canManageStaff);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={all.refreshing || removed.refreshing} onRefresh={() => { all.refresh(); if (tab === 'removed') removed.refresh(); }} colors={[t.colors.primary]} />}>
        <Hero title="People" subtitle={canEdit ? 'Accounts, profiles and sign-in details' : 'View only'} compact>
          <Searchbar placeholder="Search name, login ID or phone" value={q} onChangeText={setQ} elevation={2} style={{ borderRadius: 28 }} />
        </Hero>
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <FilterChips value={tab} onChange={(v) => { setTab(v); setClassId(0); }} options={tabOptions} />
          {showFab ? (
            <Button mode="contained-tonal" icon="account-multiple-plus-outline" compact style={{ alignSelf: 'flex-start', marginBottom: space.sm }}
              onPress={() => { haptic.tap(); router.push(`/more/add-many?role=${TAB_ROLE[tab] === 'vice_principal' && !canManageStaff ? 'teacher' : TAB_ROLE[tab]}`); }}>
              Add many {tab === 'staff' ? 'staff' : tab === 'parent' ? 'parents' : tab === 'teacher' ? 'teachers' : 'students'}
            </Button>
          ) : null}
          {tab === 'student' && classes.data ? (
            <FilterChips options={[{ label: 'All classes', value: 0 }, ...classes.data.map((c) => ({ label: `${c.name} · ${c.student_count}`, value: c.id }))]}
              value={classId} onChange={setClassId} />
          ) : null}

          {tab === 'staff' && !extraRoles ? (
            <FadeIn>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.colors.surfaceVariant, borderRadius: radius.xl,
                padding: space.lg, marginBottom: space.md }}>
                <Icon name="lock-outline" size={24} color={t.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>
                  Vice Principal & Coordinator roles are available on higher plans.
                </Text>
              </View>
            </FadeIn>
          ) : null}
          {tab === 'staff' && extraRoles && me?.role !== 'principal' ? (
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
              Only the principal can add or change Vice Principals and Coordinators.
            </Text>
          ) : null}

          {error ? <ErrorState message={error} onRetry={refreshAll} /> : null}
          {loading ? <LoadingCards /> : null}
          {!loading && !error ? (
            list.length ? (
              <FadeIn>
                <Panel>
                  {list.map((u, i) => (
                    <Row key={u.id} title={u.name} subtitle={`ID ${u.login_id}${u.phone ? ` · ${u.phone}` : ''}${tab === 'removed' ? ` · ${ROLE_LABEL[u.role]}` : ''}`}
                      divider={i < list.length - 1} onPress={() => setSel(u)} left={<UserAvatar name={u.name} size={42} />} right={rowRight(u)} />
                  ))}
                </Panel>
              </FadeIn>
            ) : (
              <EmptyState icon={tab === 'removed' ? 'account-check-outline' : 'account-search-outline'}
                title={q ? 'No matches' : tab === 'removed' ? 'No removed accounts' : 'No one here yet'}
                text={q ? `Nothing found for “${q}”` : tab === 'removed' ? 'Removed people appear here and can be restored.'
                  : showFab ? 'Add the first account with the button below.' : undefined} />
            )
          ) : null}
        </View>
      </ScrollView>

      {showFab ? (
        <Fab icon="account-plus" label="Add person" extended={fabExtended} onPress={() => { haptic.tap(); setAdding(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}

      {classes.data ? (
        <PersonSheet visible={adding || !!sel} person={adding ? null : sel} onDismiss={() => { setAdding(false); setSel(null); }}
          classes={classes.data} students={students} defaultRole={TAB_ROLE[tab] === 'vice_principal' && !canManageStaff ? 'teacher' : TAB_ROLE[tab]}
          canEdit={canEdit} canManageStaff={canManageStaff}
          onSaved={(c, msg) => { setAdding(false); setSel(null); refreshAll(); toast(msg); if (c) setCreds(c); }}
          onRemove={(u) => setActive(u, false)} onRestore={(u) => setActive(u, true)} />
      ) : null}
      <CredentialsDialog creds={creds} onDismiss={() => setCreds(null)} />
    </View>
  );
}
