import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Chips, Empty, ErrorBox, Field, Header, ListRow, Loading, Pill, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Role, SchoolClass, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function People() {
  const [role, setRole] = useState<Role>('teacher');
  const [classId, setClassId] = useState<number>(0);
  const [adding, setAdding] = useState(false);
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const users = useLoad(
    () => api<User[]>('/users', { params: { role, class_id: role === 'student' ? classId || undefined : undefined } }),
    [role, classId],
  );
  const className = (id: number | null) => classes.data?.find((c) => c.id === id)?.name ?? '';

  return (
    <Screen onRefresh={users.refresh} refreshing={users.refreshing}>
      <Header title="People" right={<Button title={adding ? 'Close' : '+ Add'} small variant="secondary" onPress={() => setAdding((a) => !a)} />} />
      {adding && classes.data ? (
        <AddUser classes={classes.data} onAdded={() => { setAdding(false); users.reload(); classes.reload(); }} />
      ) : null}
      <Chips options={[{ label: 'Teachers', value: 'teacher' as Role }, { label: 'Students', value: 'student' as Role }, { label: 'Principal', value: 'principal' as Role }]}
        value={role} onChange={setRole} />
      {role === 'student' && classes.data ? (
        <Chips options={[{ label: 'All classes', value: 0 }, ...classes.data.map((c) => ({ label: c.name, value: c.id }))]}
          value={classId} onChange={setClassId} />
      ) : null}
      {users.error ? <ErrorBox message={users.error} onRetry={users.reload} /> : null}
      {users.loading && !users.data ? <Loading /> : null}
      {users.data ? (
        <Card>
          <Text style={[styles.muted, { marginBottom: 4 }]}>{users.data.length} {role}{users.data.length === 1 ? '' : 's'}</Text>
          {users.data.length ? users.data.map((u) => (
            <ListRow key={u.id} title={u.name} subtitle={u.email}
              right={u.role === 'student' ? <Pill text={`${className(u.class_id)} · #${u.roll_no ?? '-'}`} color={colors.muted} bg={colors.bg} /> : undefined} />
          )) : <Empty text="No one here yet" />}
        </Card>
      ) : null}
    </Screen>
  );
}

function AddUser({ classes, onAdded }: { classes: SchoolClass[]; onAdded: () => void }) {
  const [role, setRole] = useState<Role>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const [roll, setRoll] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim() || !email.trim()) return Alert.alert('Name and email are required');
    if (password.length < 6) return Alert.alert('Password must be at least 6 characters');
    setBusy(true);
    try {
      await api('/users', {
        body: {
          name: name.trim(), email: email.trim(), password, role,
          class_id: role === 'student' ? classId : null, roll_no: role === 'student' && roll ? Number(roll) : null,
        },
      });
      Alert.alert('Account created', `${name} can now sign in with ${email.trim()}`);
      onAdded();
    } catch (e) {
      Alert.alert('Could not create', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New account">
      <Chips options={[{ label: 'Student', value: 'student' as Role }, { label: 'Teacher', value: 'teacher' as Role }]} value={role} onChange={setRole} />
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field label="Email (login)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Starting password" value={password} onChangeText={setPassword} placeholder="min 6 characters" />
      {role === 'student' ? (
        <>
          <Chips label="Class" options={classes.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={setClassId} />
          <Field label="Roll no. (optional)" value={roll} onChangeText={setRoll} keyboardType="number-pad" />
        </>
      ) : null}
      <Button title="Create account" onPress={save} loading={busy} />
    </Card>
  );
}
