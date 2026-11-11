import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, HelperText, Text, TextInput } from 'react-native-paper';

import { FilterChips, Sheet, ToneChip, UserAvatar, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Area, Level, SchoolClass, User } from '@/lib/types';

import { ChildrenPicker } from './ChildrenPicker';
import { BLOOD, DEFAULT_PERMS, genPassword, isDate, LOGIN_HINT, PersonRole, RELATIONS } from './constants';
import type { Credentials } from './CredentialsDialog';
import { PermissionEditor } from './PermissionEditor';

const emailOk = (e: string) => !e.trim() || /^\S+@\S+\.\S+$/.test(e.trim());

/** Add (person = null) or view/edit a person. */
export function PersonSheet({
  visible, person, onDismiss, classes, students, defaultRole, canEdit, canManageStaff, onSaved, onRemove, onRestore,
}: {
  visible: boolean; person: User | null; onDismiss: () => void; classes: SchoolClass[]; students: User[];
  defaultRole: PersonRole; canEdit: boolean; canManageStaff: boolean;
  onSaved: (creds: Credentials | null, msg: string) => void; onRemove: (u: User) => void; onRestore: (u: User) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const { user: me, school } = useAuth();
  const adding = !person;

  const [role, setRole] = useState<PersonRole>(defaultRole);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [blood, setBlood] = useState('');
  const [classId, setClassId] = useState(0);
  const [roll, setRoll] = useState('');
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [kids, setKids] = useState<number[]>([]);
  const [relation, setRelation] = useState('Father');
  const [perms, setPerms] = useState<Record<Area, Level>>({ ...DEFAULT_PERMS.vice_principal });
  const [scope, setScope] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTouched(false); setResetting(false); setBusy(false);
    if (person) {
      setRole((['student', 'teacher', 'parent', 'vice_principal', 'coordinator'].includes(person.role) ? person.role : 'teacher') as PersonRole);
      setName(person.name); setLoginId(person.login_id); setPhone(person.phone ?? ''); setEmail(person.email ?? '');
      setAddress(person.address ?? ''); setDob(person.dob ?? ''); setBlood(person.blood_group ?? '');
      setClassId(person.class_id ?? 0); setRoll(person.roll_no != null ? String(person.roll_no) : '');
      setKids(person.children_ids ?? []); setPassword('');
      if (person.role === 'vice_principal' || person.role === 'coordinator') {
        setPerms({ ...DEFAULT_PERMS[person.role], ...(person.permissions ?? {}) } as Record<Area, Level>);
        setScope(person.scope_class_ids ?? []);
      }
    } else {
      setRole(defaultRole); setName(''); setLoginId(''); setPhone(''); setEmail(''); setAddress(''); setDob(''); setBlood('');
      setClassId(classes[0]?.id ?? 0); setRoll(''); setKids([]); setRelation('Father'); setPassword(genPassword()); setScope([]);
      setPerms({ ...DEFAULT_PERMS[defaultRole === 'coordinator' ? 'coordinator' : 'vice_principal'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, person]);

  const isStaffRole = role === 'vice_principal' || role === 'coordinator';
  const viewingPrincipal = person?.role === 'principal';
  const isMe = !!person && person.id === me?.id;
  const readOnly = !canEdit || (isStaffRole && !canManageStaff) || (viewingPrincipal && !isMe);
  const active = person?.active !== false;
  const hint = LOGIN_HINT[viewingPrincipal ? 'principal' : role];
  const needPw = adding || resetting;
  const pwErr = needPw && (password.length < 6 || password.trim().toLowerCase() === loginId.trim().toLowerCase());
  const valid = name.trim() && loginId.trim() && emailOk(email) && isDate(dob) && !pwErr && (role !== 'student' || classId);

  const roleOptions: { label: string; value: PersonRole }[] = [
    { label: 'Student', value: 'student' }, { label: 'Teacher', value: 'teacher' }, { label: 'Parent', value: 'parent' },
    ...(canManageStaff ? [{ label: 'Vice Principal', value: 'vice_principal' as const }, { label: 'Coordinator', value: 'coordinator' as const }] : []),
  ];

  function pickRole(r: PersonRole) {
    setRole(r);
    if (r === 'vice_principal' || r === 'coordinator') setPerms({ ...DEFAULT_PERMS[r] });
  }

  async function save() {
    setTouched(true);
    if (!valid) return haptic.error();
    setBusy(true);
    const body: Record<string, unknown> = {
      name: name.trim(), login_id: loginId.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(),
      dob: dob || null, blood_group: blood,
    };
    if (role === 'student') { body.class_id = classId; body.roll_no = roll ? Number(roll) : null; }
    if (role === 'parent') { body.children_ids = kids; if (adding) body.relation = relation; }
    if (isStaffRole) { body.permissions = perms; if (role === 'coordinator') body.scope_class_ids = scope.length ? scope : null; }
    if (needPw) body.password = password;
    try {
      if (adding) {
        await api<User>('/users', { body: { ...body, role } });
      } else {
        await api<User>(`/users/${person!.id}`, { method: 'PUT', body });
      }
      const creds: Credentials | null = needPw && !isMe ? {
        title: adding ? 'Account created' : 'Password reset', name: name.trim(), schoolCode: school?.code ?? '',
        loginId: loginId.trim(), password,
      } : null;
      onSaved(creds, adding ? `${name.trim()} added` : needPw ? 'Saved · temporary password set' : 'Changes saved');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet visible={visible} onDismiss={onDismiss} title={adding ? 'Add person' : undefined}>
        {person ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
            <UserAvatar name={person.name} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }}>{person.name}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                <ToneChip text={ROLE_LABEL[person.role]} tone="primary" />
                {!active ? <ToneChip text="Removed" tone="danger" /> : null}
                {person.must_change_password ? <ToneChip text="Temp password" tone="warning" icon="key-alert-outline" /> : null}
                {isMe ? <ToneChip text="You" tone="success" /> : null}
                {person.role === 'student' ? <ToneChip text={`${person.parent_ids?.length ?? 0} parent${person.parent_ids?.length === 1 ? '' : 's'} linked`} /> : null}
              </View>
            </View>
          </View>
        ) : (
          <FilterChips label="Role" options={roleOptions} value={role} onChange={pickRole} />
        )}

        {readOnly && person ? (
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
            {viewingPrincipal ? 'The principal account is managed by the platform admin.' : "You can view this profile but can't change it."}
          </Text>
        ) : null}

        <TextInput mode="outlined" label="Full name" value={name} onChangeText={setName} disabled={readOnly}
          left={<TextInput.Icon icon="account-outline" />} error={touched && !name.trim()} />
        <HelperText type="error" visible={touched && !name.trim()}>Name is required</HelperText>
        <TextInput mode="outlined" label={hint.label} placeholder={hint.placeholder} value={loginId} disabled={readOnly}
          onChangeText={(v) => { const x = hint.numeric ? v.replace(/\D/g, '') : v; setLoginId(x); if (role === 'parent' && adding) setPhone(x); }}
          keyboardType={hint.numeric ? 'phone-pad' : 'default'} autoCapitalize="none" autoCorrect={false}
          left={<TextInput.Icon icon="card-account-details-outline" />} error={touched && !loginId.trim()} />
        <HelperText type={touched && !loginId.trim() ? 'error' : 'info'} visible>
          {touched && !loginId.trim() ? 'Login ID is required' : 'Used with the school code to sign in'}
        </HelperText>

        {role === 'student' ? (
          <>
            <FilterChips label="Class" options={classes.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={readOnly ? () => {} : setClassId} />
            <TextInput mode="outlined" label="Roll no." value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))} keyboardType="number-pad"
              disabled={readOnly} left={<TextInput.Icon icon="pound" />} style={{ marginBottom: space.md }} />
          </>
        ) : null}

        <TextInput mode="outlined" label="Mobile number" value={phone} onChangeText={(v) => setPhone(v.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad"
          disabled={readOnly} left={<TextInput.Icon icon="phone-outline" />} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" label="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
          disabled={readOnly} left={<TextInput.Icon icon="email-outline" />} error={!emailOk(email)} />
        <HelperText type="error" visible={!emailOk(email)}>Enter a valid email or leave empty</HelperText>
        <TextInput mode="outlined" label="Address" value={address} onChangeText={setAddress} multiline disabled={readOnly}
          left={<TextInput.Icon icon="map-marker-outline" />} style={{ marginBottom: space.md }} />
        {role === 'student' || role === 'teacher' ? (
          <>
            <TextInput mode="outlined" label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} disabled={readOnly}
              left={<TextInput.Icon icon="cake-variant-outline" />} error={!isDate(dob)} placeholder="2012-05-14" />
            <HelperText type="error" visible={!isDate(dob)}>Use the format YYYY-MM-DD</HelperText>
            <FilterChips label="Blood group" options={BLOOD.map((b) => ({ label: b, value: b }))} value={blood}
              onChange={readOnly ? () => {} : (b) => setBlood(b === blood ? '' : b)} />
          </>
        ) : null}

        {role === 'parent' ? (
          <>
            {adding ? <FilterChips label="Relation" options={RELATIONS.map((r) => ({ label: r, value: r }))} value={relation} onChange={setRelation} /> : null}
            <ChildrenPicker students={students} classes={classes} value={kids} onChange={setKids} disabled={readOnly} />
          </>
        ) : null}

        {isStaffRole ? (
          <>
            <PermissionEditor role={role as 'vice_principal' | 'coordinator'} value={perms} onChange={setPerms} disabled={readOnly} />
            {role === 'coordinator' ? (
              <View style={{ marginBottom: space.md }}>
                <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>
                  Classes {scope.length ? `(${scope.length} selected)` : '(all classes)'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {classes.map((c) => {
                    const on = scope.includes(c.id);
                    return (
                      <Button key={c.id} compact mode={on ? 'contained-tonal' : 'outlined'} icon={on ? 'check' : undefined} disabled={readOnly}
                        onPress={() => { haptic.tap(); setScope(on ? scope.filter((x) => x !== c.id) : [...scope, c.id]); }}>{c.name}</Button>
                    );
                  })}
                </View>
                <HelperText type="info" visible>Leave all unselected to cover every class</HelperText>
              </View>
            ) : null}
          </>
        ) : null}

        {!readOnly ? (
          adding || resetting ? (
            <View style={{ marginBottom: space.sm }}>
              <TextInput mode="outlined" label={adding ? 'Temporary password' : 'New temporary password'} value={password} onChangeText={setPassword}
                autoCapitalize="none" autoCorrect={false} left={<TextInput.Icon icon="key-outline" />} error={touched && pwErr}
                style={{ fontFamily: 'monospace' }}
                right={<TextInput.Icon icon="dice-multiple-outline" onPress={() => { haptic.tap(); setPassword(genPassword()); }} />} />
              <HelperText type={touched && pwErr ? 'error' : 'info'} visible>
                {touched && pwErr ? 'Min 6 characters and different from the login ID' : "Tap 🎲 to generate. They'll set their own at first login."}
              </HelperText>
            </View>
          ) : !isMe ? (
            <Button mode="text" icon="lock-reset" onPress={() => { setResetting(true); setPassword(genPassword()); }} style={{ alignSelf: 'flex-start', marginBottom: space.sm }}>
              Reset password
            </Button>
          ) : null
        ) : null}

        {!readOnly && active ? (
          <Button mode="contained" icon={adding ? 'account-plus' : 'content-save-outline'} onPress={save} loading={busy} contentStyle={{ paddingVertical: 6 }}>
            {adding ? 'Create account' : 'Save changes'}
          </Button>
        ) : null}
        {person && canEdit && !isMe && !viewingPrincipal && !(isStaffRole && !canManageStaff) ? (
          active ? (
            <Button mode="outlined" icon="account-remove-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error, marginTop: space.sm }}
              onPress={() => setConfirm(true)}>Remove account</Button>
          ) : (
            <Button mode="contained-tonal" icon="account-reactivate-outline" style={{ marginTop: space.sm }} onPress={() => onRestore(person)}>Restore account</Button>
          )
        ) : null}
      </Sheet>
      <TopLayer visible={confirm} onDismiss={() => setConfirm(false)}>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)}>
          <Dialog.Icon icon="account-remove-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Remove {person?.name}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              They won't be able to sign in. Their history (attendance, marks, posts) is kept, and you can restore them any time from the Removed tab.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => { setConfirm(false); if (person) onRemove(person); }}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </>
  );
}

