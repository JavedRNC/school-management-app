import { ReactNode, useEffect, useMemo, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, View } from 'react-native';
import { AnimatedFAB, Button, Dialog, HelperText, Portal, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Sheet, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Role, SchoolClass, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type View_ = 'student' | 'teacher' | 'principal' | 'removed';

export default function People() {
  const t = useAppTheme();
  const toast = useToast();
  const { user: me } = useAuth();
  const [tab, setTab] = useState<View_>('student');
  const [classId, setClassId] = useState<number>(0);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<User | null>(null);
  const [fabExtended, setFabExtended] = useState(true);
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const users = useLoad(
    () => api<User[]>('/users', { params: tab === 'removed' ? { active: 'false' } : { role: tab } }), [tab]);
  const className = (id: number | null) => classes.data?.find((c) => c.id === id)?.name ?? '';

  const list = useMemo(() => (users.data ?? []).filter((u) =>
    (tab !== 'student' || !classId || u.class_id === classId) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))), [users.data, q, classId, tab]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setFabExtended(e.nativeEvent.contentOffset.y <= 10);
  const refreshAll = () => { users.reload(); classes.reload(); };

  async function setActive(u: User, active: boolean) {
    try {
      await (active ? api(`/users/${u.id}`, { method: 'PUT', body: { active: true } }) : api(`/users/${u.id}`, { method: 'DELETE' }));
      setSel(null);
      refreshAll();
      toast(active ? `${u.name} restored` : `${u.name} removed`, {
        action: { label: 'Undo', onPress: async () => {
          await (active ? api(`/users/${u.id}`, { method: 'DELETE' }) : api(`/users/${u.id}`, { method: 'PUT', body: { active: true } }));
          refreshAll();
        } },
      });
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollWrap onScroll={onScroll} onRefresh={users.refresh} refreshing={users.refreshing}>
        <Hero title="People" subtitle={users.data ? `${users.data.length} ${tab === 'removed' ? 'removed' : tab}${tab !== 'removed' && users.data.length !== 1 ? 's' : ''}` : ' '} compact>
          <Searchbar placeholder="Search by name or email" value={q} onChangeText={setQ} elevation={2} style={{ borderRadius: 28 }} />
        </Hero>
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <FilterChips value={tab} onChange={(v) => { setTab(v); setClassId(0); }} options={[
            { label: 'Students', value: 'student', icon: 'account-school-outline' }, { label: 'Teachers', value: 'teacher', icon: 'human-male-board' },
            { label: 'Admin', value: 'principal', icon: 'shield-account-outline' }, { label: 'Removed', value: 'removed', icon: 'account-off-outline' }]} />
          {tab === 'student' && classes.data ? (
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
                      right={tab === 'removed'
                        ? <Button compact mode="contained-tonal" icon="account-reactivate-outline" onPress={() => setActive(u, true)}>Restore</Button>
                        : u.role === 'student' ? <ToneChip text={`${className(u.class_id)} · #${u.roll_no ?? '-'}`} tone="primary" /> : undefined} />
                  ))}
                </Panel>
              </FadeIn>
            ) : <EmptyState icon={tab === 'removed' ? 'account-check-outline' : 'account-search-outline'}
                title={q ? 'No matches' : tab === 'removed' ? 'No removed accounts' : 'No one here yet'}
                text={q ? `Nothing found for “${q}”` : tab === 'removed' ? 'Removed people appear here and can be restored.' : 'Add the first account with the button below.'} />
          ) : null}
        </View>
      </ScrollWrap>

      <AnimatedFAB icon="account-plus" label="Add person" extended={fabExtended} onPress={() => { haptic.tap(); setAdding(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />

      {classes.data ? (
        <AddUser visible={adding} onDismiss={() => setAdding(false)} classes={classes.data} defaultRole={tab === 'teacher' ? 'teacher' : 'student'}
          onAdded={(u) => { setAdding(false); refreshAll(); toast(`${u} can now sign in`); }} />
      ) : null}
      {classes.data ? (
        <EditUser user={sel} onDismiss={() => setSel(null)} classes={classes.data} isMe={sel?.id === me?.id}
          onSaved={() => { setSel(null); refreshAll(); }} onRemove={(u) => setActive(u, false)} onRestore={(u) => setActive(u, true)} />
      ) : null}
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

const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e.trim());

function EditUser({ user, onDismiss, classes, isMe, onSaved, onRemove, onRestore }: {
  user: User | null; onDismiss: () => void; classes: SchoolClass[]; isMe: boolean; onSaved: () => void;
  onRemove: (u: User) => void; onRestore: (u: User) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [classId, setClassId] = useState(0);
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name); setEmail(user.email); setClassId(user.class_id ?? 0);
      setRoll(user.roll_no != null ? String(user.roll_no) : ''); setPassword('');
    }
  }, [user]);

  if (!user) return null;
  const active = user.active !== false;
  const student = user.role === 'student';
  const valid = name.trim() && emailOk(email) && (!password || password.length >= 6);

  async function save() {
    if (!user || !valid) return haptic.error();
    setBusy(true);
    try {
      await api(`/users/${user.id}`, {
        method: 'PUT',
        body: {
          name: name.trim(), email: email.trim(),
          ...(student ? { class_id: classId, roll_no: roll ? Number(roll) : null } : {}),
          ...(password ? { password } : {}),
        },
      });
      toast(password ? 'Saved · new password set' : 'Changes saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet visible={!!user} onDismiss={onDismiss}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
          <UserAvatar name={user.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }}>{user.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <ToneChip text={user.role} tone="primary" />
              {!active ? <ToneChip text="Removed" tone="danger" /> : null}
              {isMe ? <ToneChip text="You" tone="success" /> : null}
            </View>
          </View>
        </View>

        <TextInput mode="outlined" label="Full name" value={name} onChangeText={setName} left={<TextInput.Icon icon="account-outline" />} error={!name.trim()} />
        <HelperText type="error" visible={!name.trim()}>Name is required</HelperText>
        <TextInput mode="outlined" label="Email (sign-in)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
          left={<TextInput.Icon icon="email-outline" />} error={!emailOk(email)} />
        <HelperText type="error" visible={!emailOk(email)}>Enter a valid email</HelperText>
        {student ? (
          <>
            <FilterChips label="Class" options={classes.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={setClassId} />
            <TextInput mode="outlined" label="Roll no." value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))} keyboardType="number-pad"
              left={<TextInput.Icon icon="pound" />} style={{ marginBottom: space.md }} />
          </>
        ) : null}
        <TextInput mode="outlined" label="Reset password (optional)" value={password} onChangeText={setPassword} placeholder="Leave empty to keep current"
          left={<TextInput.Icon icon="lock-reset" />} error={!!password && password.length < 6} />
        <HelperText type={password && password.length < 6 ? 'error' : 'info'} visible>
          {password ? (password.length < 6 ? 'Min 6 characters' : 'They will sign in with this new password') : 'Only fill this to set a new password'}
        </HelperText>

        <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>
          Save changes
        </Button>
        {!isMe ? (
          active ? (
            <Button mode="outlined" icon="account-remove-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error, marginTop: space.sm }}
              onPress={() => setConfirm(true)}>Remove account</Button>
          ) : (
            <Button mode="contained-tonal" icon="account-reactivate-outline" style={{ marginTop: space.sm }} onPress={() => onRestore(user)}>Restore account</Button>
          )
        ) : null}
      </Sheet>
      <Portal>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)}>
          <Dialog.Icon icon="account-remove-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Remove {user.name}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              They won't be able to sign in. Their {student ? 'attendance and marks' : 'posts and records'} are kept, and you can restore them any time from the Removed tab.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => { setConfirm(false); onRemove(user); }}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
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

  useEffect(() => { if (visible) setRole(defaultRole); }, [visible, defaultRole]);

  async function save() {
    setTouched(true);
    if (!name.trim() || !emailOk(email) || password.length < 6) return haptic.error();
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
        left={<TextInput.Icon icon="email-outline" />} error={touched && !emailOk(email)} />
      <HelperText type="error" visible={touched && !emailOk(email)}>Enter a valid email</HelperText>
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
