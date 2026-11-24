import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Searchbar, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { RoleGuard } from '@/components/RoleGuard';
import { BLOOD, isDate, RELATIONS } from '@/components/people/constants';
import { CredentialsDialog, type Credentials } from '@/components/people/CredentialsDialog';
import { SelectField } from '@/components/SelectField';
import {
  EmptyState, ErrorState, Fab, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Screen, Sheet, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import type { EditableParent, EditableStudent, MyStudents, MyStudentsClass, NewAccountCredentials } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const emailOk = (e: string) => !e.trim() || /^\S+@\S+\.\S+$/.test(e.trim());

/** Edit one student's (or one parent's) contact and profile details. Login ID, class and password stay with the principal. */
function EditSheet({ student, parent, onDismiss, onSaved }: {
  student: EditableStudent | null; parent: EditableParent | null; onDismiss: () => void; onSaved: (msg: string) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const who = parent ?? student;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [blood, setBlood] = useState('');
  const [roll, setRoll] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!who) return;
    setName(who.name); setPhone(who.phone ?? ''); setEmail(who.email ?? ''); setAddress(who.address ?? '');
    if (!parent && student) { setDob(student.dob ?? ''); setBlood(student.blood_group ?? ''); setRoll(student.roll_no != null ? String(student.roll_no) : ''); }
    setBusy(false);
  }, [who, parent, student]);

  const valid = name.trim() && emailOk(email) && (parent || isDate(dob));

  async function save() {
    if (!who || !valid) return haptic.error();
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() };
      if (parent) {
        await api(`/my-students/parents/${parent.id}`, { method: 'PUT', body });
      } else {
        await api(`/my-students/${who.id}`, { method: 'PUT', body: { ...body, dob: dob || null, blood_group: blood, roll_no: roll ? Number(roll) : null } });
      }
      haptic.success();
      onSaved(`${name.trim()} saved`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!who} onDismiss={onDismiss} title={parent ? 'Edit parent details' : 'Edit student details'}>
      {who ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <UserAvatar name={who.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ color: t.colors.onSurface }}>{who.name}</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
              Login ID {who.login_id}{parent ? ` · ${parent.relation}` : student ? ` · ${student.class_name}` : ''}
            </Text>
          </View>
        </View>
      ) : null}
      <TextInput mode="outlined" label="Full name" accessibilityLabel="Full name" value={name} onChangeText={setName} left={<TextInput.Icon icon="account-outline" />} error={!name.trim()} />
      <HelperText type="error" visible={!name.trim()}>Name is required</HelperText>
      {!parent ? (
        <TextInput mode="outlined" label="Roll no." accessibilityLabel="Roll no." value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))} keyboardType="number-pad"
          left={<TextInput.Icon icon="pound" />} style={{ marginBottom: space.md }} />
      ) : null}
      <TextInput mode="outlined" label="Mobile number" accessibilityLabel="Mobile number" value={phone} onChangeText={(v) => setPhone(v.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad"
        left={<TextInput.Icon icon="phone-outline" />} style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Email (optional)" accessibilityLabel="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
        left={<TextInput.Icon icon="email-outline" />} error={!emailOk(email)} />
      <HelperText type="error" visible={!emailOk(email)}>Enter a valid email or leave empty</HelperText>
      <TextInput mode="outlined" label="Address" accessibilityLabel="Address" value={address} onChangeText={setAddress} multiline
        left={<TextInput.Icon icon="map-marker-outline" />} style={{ marginBottom: space.md }} />
      {!parent ? (
        <>
          <TextInput mode="outlined" label="Date of birth (YYYY-MM-DD)" accessibilityLabel="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="2012-05-14"
            left={<TextInput.Icon icon="cake-variant-outline" />} error={!isDate(dob)} />
          <HelperText type="error" visible={!isDate(dob)}>Use the format YYYY-MM-DD</HelperText>
          <FilterChips label="Blood group" options={BLOOD.map((b) => ({ label: b, value: b }))} value={blood} onChange={(b) => setBlood(b === blood ? '' : b)} />
        </>
      ) : null}
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
        Login ID, class and password can be changed only by the principal. Your changes are recorded in the school's activity log.
      </Text>
      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }}>Save changes</Button>
    </Sheet>
  );
}

/** Add a student to a class where the principal allows it. The server makes the temporary password and shows it once. */
function AddStudentSheet({ visible, classes, onDismiss, onAdded }: {
  visible: boolean; classes: MyStudentsClass[]; onDismiss: () => void; onAdded: (c: NewAccountCredentials) => void;
}) {
  const toast = useToast();
  const [classId, setClassId] = useState(0);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [roll, setRoll] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setClassId(classes[0]?.id ?? 0); setName(''); setLoginId(''); setRoll(''); setPhone(''); setDob(''); setTouched(false); setBusy(false);
  }, [visible, classes]);
  const valid = classId && name.trim() && loginId.trim() && isDate(dob);

  async function save() {
    setTouched(true);
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const r = await api<{ credentials: NewAccountCredentials }>('/my-students', {
        body: { class_id: classId, name: name.trim(), login_id: loginId.trim(), roll_no: roll ? Number(roll) : null, phone: phone.trim(), dob: dob || null },
      });
      haptic.success();
      onAdded(r.credentials);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Add student">
      {classes.length > 1 ? (
        <SelectField label="Class" options={classes.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={setClassId} />
      ) : <ToneChip text={`Class ${classes[0]?.name ?? ''}`} tone="primary" />}
      <View style={{ height: space.md }} />
      <TextInput mode="outlined" label="Full name" accessibilityLabel="Full name" value={name} onChangeText={setName}
        left={<TextInput.Icon icon="account-outline" />} error={touched && !name.trim()} />
      <HelperText type="error" visible={touched && !name.trim()}>Name is required</HelperText>
      <TextInput mode="outlined" label="Admission no. (login ID)" accessibilityLabel="Admission no." value={loginId} onChangeText={setLoginId}
        autoCapitalize="characters" autoCorrect={false} left={<TextInput.Icon icon="card-account-details-outline" />} error={touched && !loginId.trim()} />
      <HelperText type={touched && !loginId.trim() ? 'error' : 'info'} visible>
        {touched && !loginId.trim() ? 'Admission no. is required' : 'The student signs in with this and the school code'}
      </HelperText>
      <TextInput mode="outlined" label="Roll no." accessibilityLabel="Roll no." value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))}
        keyboardType="number-pad" left={<TextInput.Icon icon="pound" />} style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Mobile number (optional)" accessibilityLabel="Mobile number" value={phone}
        onChangeText={(v) => setPhone(v.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad" left={<TextInput.Icon icon="phone-outline" />}
        style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Date of birth (YYYY-MM-DD)" accessibilityLabel="Date of birth" value={dob} onChangeText={setDob}
        placeholder="2014-05-14" left={<TextInput.Icon icon="cake-variant-outline" />} error={!isDate(dob)} />
      <HelperText type="error" visible={!isDate(dob)}>Use the format YYYY-MM-DD</HelperText>
      <Button mode="contained" icon="account-plus" onPress={save} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }}>Add student</Button>
    </Sheet>
  );
}

/** Add a parent for one student, or link the parent account that mobile number already has in the school. */
function AddParentSheet({ student, onDismiss, onDone }: {
  student: EditableStudent | null; onDismiss: () => void; onDone: (c: NewAccountCredentials | null, msg: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [relation, setRelation] = useState('Father');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (student) { setName(''); setMobile(''); setRelation('Father'); setTouched(false); setBusy(false); } }, [student]);
  const mobileOk = /^[6-9]\d{9}$/.test(mobile);

  async function save() {
    setTouched(true);
    if (!student || !name.trim() || !mobileOk) return haptic.error();
    setBusy(true);
    try {
      const r = await api<{ linked_existing: boolean; credentials: NewAccountCredentials | null; parent: EditableParent }>(
        `/my-students/${student.id}/parents`, { body: { name: name.trim(), mobile, relation } });
      haptic.success();
      onDone(r.credentials, r.linked_existing ? `${r.parent.name} linked to ${student.name}` : `Parent added for ${student.name}`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!student} onDismiss={onDismiss} title={student ? `Add parent for ${student.name.split(' ')[0]}` : 'Add parent'}>
      <FilterChips label="Relation" options={RELATIONS.map((r) => ({ label: r, value: r }))} value={relation} onChange={setRelation} />
      <TextInput mode="outlined" label="Parent's full name" accessibilityLabel="Parent's full name" value={name} onChangeText={setName}
        left={<TextInput.Icon icon="account-tie-outline" />} error={touched && !name.trim()} />
      <HelperText type="error" visible={touched && !name.trim()}>Name is required</HelperText>
      <TextInput mode="outlined" label="Mobile number (login ID)" accessibilityLabel="Parent's mobile number" value={mobile}
        onChangeText={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" left={<TextInput.Icon icon="phone-outline" />}
        error={touched && !mobileOk} />
      <HelperText type={touched && !mobileOk ? 'error' : 'info'} visible>
        {touched && !mobileOk ? 'Enter a 10-digit mobile number' : 'If this number already has a parent account, the child is added to it'}
      </HelperText>
      <Button mode="contained" icon="account-plus" onPress={save} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }}>Add parent</Button>
    </Sheet>
  );
}

const LEVEL_WORD: Record<string, string> = { none: 'no access', edit: 'edit', add: 'add & edit' };

/** Teacher → My students: the classes the principal lets this teacher work with (by default their own class as class teacher). */
export default function MyStudentsScreenGuarded() {
  return <RoleGuard role="teacher"><MyStudentsScreen /></RoleGuard>;
}

function MyStudentsScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<MyStudents>('/my-students'));
  const [classId, setClassId] = useState(0);
  const [q, setQ] = useState('');
  const [student, setStudent] = useState<EditableStudent | null>(null);
  const [parent, setParent] = useState<EditableParent | null>(null);
  const [parentFor, setParentFor] = useState<EditableStudent | null>(null);
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const level = useMemo(() => Object.fromEntries((data?.classes ?? []).map((c) => [c.id, c])), [data]);
  const addable = useMemo(() => (data?.classes ?? []).filter((c) => c.students === 'add'), [data]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data?.students ?? []).filter((s) => (!classId || s.class_id === classId) &&
      (!k || s.name.toLowerCase().includes(k) || s.login_id.toLowerCase().includes(k) || s.parents.some((p) => p.name.toLowerCase().includes(k))));
  }, [data, q, classId]);

  const saved = (msg: string) => { setStudent(null); setParent(null); toast(msg); reload(); };
  const showCreds = (c: NewAccountCredentials | null, title: string) => {
    if (c) setCreds({ title, name: c.name, schoolCode: c.school_code || school?.code || '', loginId: c.login_id, password: c.password });
  };

  return (
    <>
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title="My students" subtitle={data ? (data.classes.length ? data.classes.map((c) => c.name).join(', ') : 'No classes yet') : ' '} compact />}>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards /> : !data.classes.length ? (
        <EmptyState icon="account-lock-outline" title="You can't work with student details yet"
          text="Class teachers can edit their own class. The principal can give you access to other classes." />
      ) : (
        <>
          <FadeIn>
            <Searchbar placeholder="Search name, admission no. or parent" value={q} onChangeText={setQ} style={{ marginBottom: space.md }} />
            {data.classes.length > 1 ? (
              <FilterChips options={[{ label: 'All classes', value: 0 }, ...data.classes.map((c) => ({ label: c.name, value: c.id }))]} value={classId} onChange={setClassId} />
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
              {data.classes.map((c) => (
                <ToneChip key={c.id} text={`${c.name} · ${c.why} · students: ${LEVEL_WORD[c.students]} · parents: ${LEVEL_WORD[c.parents]}`}
                  tone={c.why === 'class teacher' ? 'primary' : 'neutral'} />
              ))}
            </View>
          </FadeIn>
          <FadeIn index={1}>
            <Panel>
              {!list.length ? <EmptyState icon="account-search-outline" title="No student matches" /> : list.map((s, i) => {
                const lv = level[s.class_id];
                const parents = lv && lv.parents !== 'none';
                return (
                  <View key={s.id}>
                    <Row divider={i < list.length - 1 && open !== s.id}
                      title={`${s.roll_no != null ? `${s.roll_no}. ` : ''}${s.name}`}
                      subtitle={`${s.class_name} · ${s.login_id}${s.phone ? ` · ${s.phone}` : ''}`}
                      left={<UserAvatar name={s.name} size={40} />}
                      onPress={() => (parents ? setOpen(open === s.id ? null : s.id) : setStudent(s))}
                      right={parents ? undefined : <Button compact mode="text" icon="pencil-outline" onPress={() => setStudent(s)} accessibilityLabel={`Edit ${s.name}`}>Edit</Button>} />
                    {parents && open === s.id ? (
                      <View style={{ paddingBottom: space.sm, gap: 6, borderBottomWidth: i < list.length - 1 ? 1 : 0, borderBottomColor: t.colors.outlineVariant }}>
                        <Button mode="contained-tonal" icon="pencil-outline" onPress={() => setStudent(s)} style={{ alignSelf: 'flex-start' }}>Edit {s.name.split(' ')[0]}</Button>
                        {s.parents.length ? s.parents.map((p) => (
                          <Button key={p.id} mode="outlined" icon="account-tie-outline" onPress={() => setParent(p)} style={{ alignSelf: 'flex-start' }}>
                            {`${p.relation}: ${p.name}`}
                          </Button>
                        )) : <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No parent linked</Text>}
                        {lv.parents === 'add' ? (
                          <Button mode="text" icon="account-plus-outline" onPress={() => setParentFor(s)} style={{ alignSelf: 'flex-start' }}
                            accessibilityLabel={`Add parent for ${s.name}`}>Add parent</Button>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Panel>
          </FadeIn>
        </>
      )}
    </Screen>
    {addable.length ? <Fab icon="account-plus" label="Add student" extended onPress={() => { haptic.tap(); setAdding(true); }}
      style={{ position: 'absolute', right: space.lg, bottom: space.lg }} /> : null}
    <EditSheet student={student} parent={parent} onDismiss={() => { setStudent(null); setParent(null); }} onSaved={saved} />
    <AddStudentSheet visible={adding} classes={addable} onDismiss={() => setAdding(false)}
      onAdded={(c) => { setAdding(false); toast(`${c.name} added`); showCreds(c, 'Student added'); reload(); }} />
    <AddParentSheet student={parentFor} onDismiss={() => setParentFor(null)}
      onDone={(c, msg) => { setParentFor(null); toast(msg); showCreds(c, 'Parent added'); reload(); }} />
    <CredentialsDialog creds={creds} onDismiss={() => setCreds(null)} />
    </>
  );
}
