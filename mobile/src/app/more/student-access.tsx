import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Switch, Text } from 'react-native-paper';

import { RoleGuard } from '@/components/RoleGuard';
import { SelectField } from '@/components/SelectField';
import {
  EmptyState, ErrorState, Fab, FadeIn, Hero, Icon, LoadingCards, Panel, Row, Screen, Sheet, TopLayer, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { SchoolClass, StudentAccess, StudentAccessGrant, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Give one teacher access: all classes or chosen ones, with or without parent details. */
function GrantSheet({ visible, grant, teachers, classes, onDismiss, onSaved }: {
  visible: boolean; grant: StudentAccessGrant | null; teachers: User[]; classes: SchoolClass[];
  onDismiss: () => void; onSaved: (a: StudentAccess, msg: string) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [tid, setTid] = useState(0);
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [parents, setParents] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTid(grant?.teacher_id ?? 0);
    setAll(grant?.classes === 'all');
    setPicked(grant && grant.classes !== 'all' ? grant.classes : []);
    setParents(grant?.parents ?? false);
    setBusy(false);
  }, [visible, grant]);

  const ok = tid && (all || picked.length);
  async function save() {
    if (!ok) return haptic.error();
    setBusy(true);
    try {
      const a = await api<StudentAccess>(`/student-access/teachers/${tid}`, { method: 'PUT', body: { classes: all ? 'all' : picked, parents } });
      haptic.success();
      onSaved(a, `Access saved for ${teachers.find((x) => x.id === tid)?.name ?? 'teacher'}`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={grant ? `Access for ${grant.name}` : 'Give a teacher access'}>
      {!grant ? (
        <SelectField label="Teacher" sheetTitle="Choose a teacher" value={tid || null} onChange={setTid}
          options={teachers.map((x) => ({ label: `${x.name} (${x.login_id})`, value: x.id }))} />
      ) : null}
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm, marginBottom: 6 }}>Classes they can edit</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
        <Button compact mode={all ? 'contained-tonal' : 'outlined'} icon={all ? 'check' : undefined} onPress={() => { haptic.tap(); setAll(!all); }}>All classes</Button>
        {!all ? classes.map((c) => {
          const on = picked.includes(c.id);
          return (
            <Button key={c.id} compact mode={on ? 'contained-tonal' : 'outlined'} icon={on ? 'check' : undefined}
              onPress={() => { haptic.tap(); setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id]); }}>{c.name}</Button>
          );
        }) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Parent details too</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Name, mobile, email and address of these students' parents</Text>
        </View>
        <Switch value={parents} onValueChange={(v) => { haptic.tap(); setParents(v); }} accessibilityLabel="Parent details too" />
      </View>
      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!ok || busy} contentStyle={{ paddingVertical: 6 }}>Save access</Button>
    </Sheet>
  );
}

/** Principal → Student data access (F40). */
export default function StudentAccessScreenGuarded() {
  return <RoleGuard role="principal"><StudentAccessScreen /></RoleGuard>;
}

function StudentAccessScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canWrite = school?.can_write !== false;
  const access = useLoad(() => api<StudentAccess>('/student-access'));
  const teachers = useLoad(() => api<User[]>('/users', { params: { role: 'teacher' } }));
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const [data, setData] = useState<StudentAccess | null>(null);
  const [editing, setEditing] = useState<StudentAccessGrant | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<StudentAccessGrant | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (access.data) setData(access.data); }, [access.data]);

  const className = (id: number) => classes.data?.find((c) => c.id === id)?.name ?? '';
  const classTeachers = useMemo(() => (classes.data ?? []).filter((c) => c.class_teacher_id).map((c) => ({
    cls: c.name, who: teachers.data?.find((x) => x.id === c.class_teacher_id)?.name ?? '' })), [classes.data, teachers.data]);
  const free = (teachers.data ?? []).filter((x) => !data?.grants.some((g) => g.teacher_id === x.id));

  async function setPolicy(body: { class_teachers: boolean; class_teachers_parents: boolean }, msg: string) {
    setBusy(true);
    try {
      setData(await api<StudentAccess>('/student-access/policy', { method: 'PUT', body }));
      toast(msg);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  async function remove(g: StudentAccessGrant) {
    setRemoving(null);
    try {
      setData(await api<StudentAccess>(`/student-access/teachers/${g.teacher_id}`, { method: 'DELETE' }));
      toast(`Access removed for ${g.name}`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const err = access.error || teachers.error || classes.error;
  return (
    <>
    <Screen onRefresh={() => { access.reload(); teachers.reload(); classes.reload(); }} refreshing={access.refreshing}
      header={<Hero title="Student data access" subtitle="Which teachers can update student and parent details" compact />}>
      {err ? <ErrorState message={err} onRetry={() => { access.reload(); teachers.reload(); classes.reload(); }} /> : null}
      {!data || !classes.data || !teachers.data ? <LoadingCards /> : (
        <>
          <FadeIn>
            <Panel title="Class teachers" icon="account-star-outline">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Can edit their own class</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Contact and profile details of the students in the class they lead</Text>
                </View>
                <Switch value={data.class_teachers} disabled={busy || !canWrite} accessibilityLabel="Class teachers can edit their own class"
                  onValueChange={(v) => { haptic.tap(); setPolicy({ class_teachers: v, class_teachers_parents: v && data.class_teachers_parents },
                    v ? 'Class teachers can edit their class' : 'Class teachers can no longer edit students'); }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md, opacity: data.class_teachers ? 1 : 0.5 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>… and their parents</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Parent name, mobile, email and address</Text>
                </View>
                <Switch value={data.class_teachers && data.class_teachers_parents} disabled={busy || !canWrite || !data.class_teachers}
                  accessibilityLabel="Class teachers can edit parents"
                  onValueChange={(v) => { haptic.tap(); setPolicy({ class_teachers: true, class_teachers_parents: v },
                    v ? 'Class teachers can edit parent details' : 'Parent details: principal only'); }} />
              </View>
              {classTeachers.length ? classTeachers.map((c, i) => (
                <Row key={c.cls} divider={i < classTeachers.length - 1} title={c.cls} subtitle={c.who || 'No class teacher'}
                  left={<Icon name="google-classroom" size={22} color={t.colors.onSurfaceVariant} />} />
              )) : <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No class has a class teacher yet. Set one in Classes.</Text>}
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
                When you change a class teacher, the old teacher loses access at once.
              </Text>
            </Panel>
          </FadeIn>
          <FadeIn index={1}>
            <Panel title="Other teachers" icon="account-key-outline" subtitle="Access you have given on top of class teachers">
              {!data.grants.length ? (
                <EmptyState icon="account-key-outline" title="No extra access given" text="Tap “Give access” to let any teacher edit chosen classes." />
              ) : data.grants.map((g, i) => (
                <Row key={g.teacher_id} divider={i < data.grants.length - 1} title={g.name}
                  subtitle={`${g.classes === 'all' ? 'All classes' : g.classes.map(className).join(', ')}${g.parents ? ' · parent details too' : ''}`}
                  left={<UserAvatar name={g.name} size={40} />}
                  onPress={canWrite ? () => setEditing(g) : undefined}
                  right={canWrite ? <Button compact mode="text" textColor={t.colors.error} onPress={() => setRemoving(g)} accessibilityLabel={`Remove access for ${g.name}`}>Remove</Button> : undefined} />
              ))}
            </Panel>
          </FadeIn>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
            Teachers can't change login IDs, passwords or classes, or remove students. Every change they make is in the activity log (Me → Privacy & audit).
          </Text>
        </>
      )}
    </Screen>
      {canWrite && data && free.length ? <Fab icon="account-plus-outline" label="Give access" extended onPress={() => { haptic.tap(); setAdding(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} /> : null}
      <GrantSheet visible={adding || !!editing} grant={editing} teachers={adding ? free : teachers.data ?? []} classes={classes.data ?? []}
        onDismiss={() => { setAdding(false); setEditing(null); }}
        onSaved={(a, msg) => { setData(a); setAdding(false); setEditing(null); toast(msg); }} />
      <TopLayer visible={!!removing} onDismiss={() => setRemoving(null)}>
        <Dialog visible={!!removing} onDismiss={() => setRemoving(null)}>
          <Dialog.Title>Remove access for {removing?.name}?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">They will no longer be able to edit these students. If they are a class teacher, they keep their own class.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRemoving(null)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => removing && remove(removing)}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </>
  );
}
