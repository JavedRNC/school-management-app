import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Searchbar, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { BLOOD, isDate } from '@/components/people/constants';
import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Screen, Sheet, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { EditableParent, EditableStudent, MyStudents } from '@/lib/types';
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

/** Teacher → My students: the classes the principal lets this teacher edit (by default their own class as class teacher). */
export default function MyStudentsScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<MyStudents>('/my-students'));
  const [classId, setClassId] = useState(0);
  const [q, setQ] = useState('');
  const [student, setStudent] = useState<EditableStudent | null>(null);
  const [parent, setParent] = useState<EditableParent | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data?.students ?? []).filter((s) => (!classId || s.class_id === classId) &&
      (!k || s.name.toLowerCase().includes(k) || s.login_id.toLowerCase().includes(k) || s.parents.some((p) => p.name.toLowerCase().includes(k))));
  }, [data, q, classId]);

  const saved = (msg: string) => { setStudent(null); setParent(null); toast(msg); reload(); };

  return (
    <>
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title="My students" subtitle={data ? (data.classes.length ? data.classes.map((c) => c.name).join(', ') : 'No classes yet') : ' '} compact />}>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards /> : !data.classes.length ? (
        <EmptyState icon="account-lock-outline" title="You can't edit student details yet"
          text="Class teachers can edit their own class. The principal can give you access to other classes." />
      ) : (
        <>
          <FadeIn>
            <Searchbar placeholder="Search name, admission no. or parent" value={q} onChangeText={setQ} style={{ marginBottom: space.md }} />
            {data.classes.length > 1 ? (
              <FilterChips options={[{ label: 'All classes', value: 0 }, ...data.classes.map((c) => ({ label: c.name, value: c.id }))]} value={classId} onChange={setClassId} />
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
              {data.classes.map((c) => <ToneChip key={c.id} text={`${c.name} · ${c.why}`} tone={c.why === 'class teacher' ? 'primary' : 'neutral'} />)}
              <ToneChip text={data.can_edit_parents ? 'Parent details: can edit' : 'Parent details: principal only'} tone={data.can_edit_parents ? 'success' : 'neutral'} />
            </View>
          </FadeIn>
          <FadeIn index={1}>
            <Panel>
              {!list.length ? <EmptyState icon="account-search-outline" title="No student matches" /> : list.map((s, i) => (
                <View key={s.id}>
                  <Row divider={i < list.length - 1 && open !== s.id}
                    title={`${s.roll_no != null ? `${s.roll_no}. ` : ''}${s.name}`}
                    subtitle={`${s.class_name} · ${s.login_id}${s.phone ? ` · ${s.phone}` : ''}`}
                    left={<UserAvatar name={s.name} size={40} />}
                    onPress={() => (data.can_edit_parents ? setOpen(open === s.id ? null : s.id) : setStudent(s))}
                    right={data.can_edit_parents ? undefined : <Button compact mode="text" icon="pencil-outline" onPress={() => setStudent(s)} accessibilityLabel={`Edit ${s.name}`}>Edit</Button>} />
                  {data.can_edit_parents && open === s.id ? (
                    <View style={{ paddingBottom: space.sm, gap: 6, borderBottomWidth: i < list.length - 1 ? 1 : 0, borderBottomColor: t.colors.outlineVariant }}>
                      <Button mode="contained-tonal" icon="pencil-outline" onPress={() => setStudent(s)} style={{ alignSelf: 'flex-start' }}>Edit {s.name.split(' ')[0]}</Button>
                      {s.parents.length ? s.parents.map((p) => (
                        <Button key={p.id} mode="outlined" icon="account-tie-outline" onPress={() => setParent(p)} style={{ alignSelf: 'flex-start' }}>
                          {`${p.relation}: ${p.name}`}
                        </Button>
                      )) : <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No parent linked</Text>}
                    </View>
                  ) : null}
                </View>
              ))}
            </Panel>
          </FadeIn>
        </>
      )}
    </Screen>
    <EditSheet student={student} parent={parent} onDismiss={() => { setStudent(null); setParent(null); }} onSaved={saved} />
    </>
  );
}
