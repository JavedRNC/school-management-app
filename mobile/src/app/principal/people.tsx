import { ReactNode, useMemo, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, View } from 'react-native';
import { AnimatedFAB, Button, HelperText, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Sheet, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Role, SchoolClass, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function People() {
  const t = useAppTheme();
  const toast = useToast();
  const [role, setRole] = useState<Role>('student');
  const [classId, setClassId] = useState<number>(0);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<User | null>(null);
  const [fabExtended, setFabExtended] = useState(true);
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const users = useLoad(() => api<User[]>('/users', { params: { role } }), [role]);
  const className = (id: number | null) => classes.data?.find((c) => c.id === id)?.name ?? '';

  const list = useMemo(() => (users.data ?? []).filter((u) =>
    (role !== 'student' || !classId || u.class_id === classId) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))), [users.data, q, classId, role]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setFabExtended(e.nativeEvent.contentOffset.y <= 10);

  async function deactivate(u: User) {
    try {
      await api(`/users/${u.id}`, { method: 'PUT', body: { active: false } });
      setSel(null);
      users.reload();
      toast(`${u.name} removed`, {
        action: { label: 'Undo', onPress: async () => { await api(`/users/${u.id}`, { method: 'PUT', body: { active: true } }); users.reload(); } },
      });
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollWrap onScroll={onScroll} onRefresh={users.refresh} refreshing={users.refreshing}>
        <Hero title="People" subtitle={users.data ? `${users.data.length} ${role}${users.data.length === 1 ? '' : 's'}` : ' '} compact>
          <Searchbar placeholder="Search by name or email" value={q} onChangeText={setQ} elevation={2} style={{ borderRadius: 28 }} />
        </Hero>
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <SegmentedButtons value={role} onValueChange={(v) => { haptic.tap(); setRole(v as Role); setClassId(0); }} style={{ marginBottom: space.md }}
            buttons={[{ value: 'student', label: 'Students', icon: 'account-school-outline' }, { value: 'teacher', label: 'Teachers', icon: 'human-male-board' },
              { value: 'principal', label: 'Admin', icon: 'shield-account-outline' }]} />
          {role === 'student' && classes.data ? (
            <FilterChips options={[{ label: 'All classes', value: 0 }, ...classes.data.map((c) => ({ label: `${c.name} · ${c.student_count}`, value: c.id }))]}
              value={classId} onChange={setClassId} />
          ) : null}
          {users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : null}
          {users.loading && !users.data ? <LoadingCards /> : null}
          {users.data ? (
            list.length ? (
              <FadeIn>
                <Panel>
                  {list.map((u, i) => (
                    <Row key={u.id} title={u.name} subtitle={u.email} divider={i < list.length - 1} onPress={() => setSel(u)}
                      left={<UserAvatar name={u.name} size={42} />}
                      right={u.role === 'student' ? <ToneChip text={`${className(u.class_id)} · #${u.roll_no ?? '-'}`} tone="primary" /> : undefined} />
                  ))}
                </Panel>
              </FadeIn>
            ) : <EmptyState icon="account-search-outline" title={q ? 'No matches' : 'No one here yet'} text={q ? `Nothing found for “${q}”` : 'Add the first account with the button below.'} />
          ) : null}
        </View>
      </ScrollWrap>

      <AnimatedFAB icon="account-plus" label="Add person" extended={fabExtended} onPress={() => { haptic.tap(); setAdding(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />

      {classes.data ? (
        <AddUser visible={adding} onDismiss={() => setAdding(false)} classes={classes.data} defaultRole={role === 'principal' ? 'teacher' : role}
          onAdded={(u) => { setAdding(false); users.reload(); classes.reload(); toast(`${u} can now sign in`); }} />
      ) : null}

      <Sheet visible={!!sel} onDismiss={() => setSel(null)}>
        {sel ? (
          <View>
            <View style={{ alignItems: 'center', marginBottom: space.lg }}>
              <UserAvatar name={sel.name} size={72} />
              <Text variant="titleLarge" style={{ fontWeight: '800', marginTop: space.sm, color: t.colors.onSurface }}>{sel.name}</Text>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{sel.email}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                <ToneChip text={sel.role} tone="primary" compact={false} />
                {sel.role === 'student' ? <ToneChip text={`Class ${className(sel.class_id)} · Roll ${sel.roll_no ?? '-'}`} compact={false} /> : null}
              </View>
            </View>
            {sel.role !== 'principal' ? (
              <Button mode="outlined" icon="account-remove-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error }} onPress={() => deactivate(sel)}>
                Remove account
              </Button>
            ) : null}
            <Button onPress={() => setSel(null)} style={{ marginTop: space.sm }}>Close</Button>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function ScrollWrap({ children, onScroll, onRefresh, refreshing }: {
  children: ReactNode; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void; onRefresh: () => void; refreshing: boolean;
}) {
  const t = useAppTheme();
  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.colors.primary]} />}>
      {children}
    </ScrollView>
  );
}

function AddUser({ visible, onDismiss, classes, defaultRole, onAdded }: {
  visible: boolean; onDismiss: () => void; classes: SchoolClass[]; defaultRole: Role; onAdded: (name: string) => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(defaultRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const [roll, setRoll] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  async function save() {
    setTouched(true);
    if (!name.trim() || !emailOk || password.length < 6) return haptic.error();
    setBusy(true);
    try {
      await api('/users', {
        body: { name: name.trim(), email: email.trim(), password, role, class_id: role === 'student' ? classId : null,
          roll_no: role === 'student' && roll ? Number(roll) : null },
      });
      const n = name.trim();
      setName(''); setEmail(''); setPassword(''); setRoll(''); setTouched(false);
      onAdded(n);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="New account">
      <SegmentedButtons value={role} onValueChange={(v) => setRole(v as Role)} style={{ marginBottom: space.md }}
        buttons={[{ value: 'student', label: 'Student', icon: 'account-school-outline' }, { value: 'teacher', label: 'Teacher', icon: 'human-male-board' }]} />
      <TextInput mode="outlined" label="Full name" value={name} onChangeText={setName} left={<TextInput.Icon icon="account-outline" />} error={touched && !name.trim()} />
      <HelperText type="error" visible={touched && !name.trim()}>Name is required</HelperText>
      <TextInput mode="outlined" label="Email (used to sign in)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
        left={<TextInput.Icon icon="email-outline" />} error={touched && !emailOk} />
      <HelperText type="error" visible={touched && !emailOk}>Enter a valid email</HelperText>
      <TextInput mode="outlined" label="Starting password" value={password} onChangeText={setPassword} left={<TextInput.Icon icon="lock-outline" />}
        error={touched && password.length < 6} />
      <HelperText type={touched && password.length < 6 ? 'error' : 'info'} visible>Min 6 characters — share it with them privately</HelperText>
      {role === 'student' ? (
        <>
          <FilterChips label="Class" options={classes.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={setClassId} />
          <TextInput mode="outlined" label="Roll no. (optional)" value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))} keyboardType="number-pad"
            left={<TextInput.Icon icon="pound" />} style={{ marginBottom: space.md }} />
        </>
      ) : null}
      <Button mode="contained" icon="check" onPress={save} loading={busy} contentStyle={{ paddingVertical: 6 }}>Create account</Button>
    </Sheet>
  );
}
