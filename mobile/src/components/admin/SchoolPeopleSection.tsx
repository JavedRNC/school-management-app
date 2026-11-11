import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, Dialog, HelperText, Searchbar, Text, TextInput } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, FilterChips, Icon, LoadingCards, Panel, Row, Sheet, ToneChip, UserAvatar, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { fieldOutline, space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail, Role, SchoolClass, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { fmtTime, ROLE_TONE } from './common';

type Tab = Exclude<Role, 'admin'> | 'removed';
const TABS: { label: string; value: Tab }[] = [
  { label: 'Principal', value: 'principal' }, { label: 'Vice Principal', value: 'vice_principal' },
  { label: 'Coordinator', value: 'coordinator' }, { label: 'Teachers', value: 'teacher' }, { label: 'Students', value: 'student' },
  { label: 'Parents', value: 'parent' }, { label: 'Removed', value: 'removed' },
];

export function SchoolPeopleSection({ d }: { d: AdminSchoolDetail }) {
  const t = useAppTheme();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('principal');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<User | 'new' | null>(null);
  const full = d.privacy.full_access;
  const classes = useLoad(() => api<SchoolClass[]>(`/admin/schools/${d.id}/classes`), [d.id]);
  const users = useLoad(() => api<User[]>(`/admin/schools/${d.id}/users`,
    { params: tab === 'removed' ? { active: 'false' } : { role: tab } }), [d.id, tab]);
  const className = (id: number | null) => classes.data?.find((c) => c.id === id)?.name;

  const list = useMemo(() => (users.data ?? []).filter((u) =>
    !q || `${u.name} ${u.login_id}`.toLowerCase().includes(q.toLowerCase())), [users.data, q]);

  async function setActive(u: User, active: boolean) {
    try {
      await api(`/admin/schools/${d.id}/users/${u.id}`, { method: 'PUT', body: { active } });
      toast(active ? `${u.name} restored` : `${u.name} removed`);
      setSel(null);
      users.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View>
      <FadeIn>
        <Panel tone={full ? 'success' : 'warning'} icon={full ? 'shield-check-outline' : 'shield-lock-outline'}
          title={full ? 'Full details visible' : 'Contact details are protected'}
          subtitle={full
            ? d.privacy.support_access_until
              ? `The school granted temporary support access until ${fmtTime(d.privacy.support_access_until)}.`
              : 'The school chose to share contact details with you.'
            : "Phone numbers, addresses and birth dates are masked. The school can share them in its privacy settings, or grant temporary support access. Every view you make is logged and visible to the principal."} />
      </FadeIn>
      <FilterChips value={tab} onChange={(v) => { setTab(v); setQ(''); }} options={TABS} />
      <Searchbar placeholder="Search name or login ID" value={q} onChangeText={setQ} style={{ marginBottom: space.md, borderRadius: 28 }} elevation={1} />
      {users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : null}
      {users.loading && !users.data ? <LoadingCards /> : null}
      {users.data ? (
        list.length ? (
          <FadeIn>
            <Panel>
              {list.map((u, i) => (
                <Row key={u.id} title={u.name} divider={i < list.length - 1} onPress={() => setSel(u)}
                  subtitle={[u.login_id, u.phone].filter(Boolean).join(' · ')}
                  left={<UserAvatar name={u.name} size={40} />}
                  right={<View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <ToneChip text={u.role === 'student' && className(u.class_id) ? `Class ${className(u.class_id)}` : ROLE_LABEL[u.role]}
                      tone={ROLE_TONE[u.role] ?? 'neutral'} />
                    {u.must_change_password ? <ToneChip text="Temp password" tone="warning" /> : null}
                  </View>} />
              ))}
            </Panel>
          </FadeIn>
        ) : <EmptyState icon="account-search-outline" title={q ? 'No matches' : 'No one here'} />
      ) : null}
      {tab !== 'removed' ? (
        <Button mode="contained" icon="account-plus" onPress={() => { haptic.tap(); setSel('new'); }} contentStyle={{ paddingVertical: 6 }}>
          Add person
        </Button>
      ) : null}
      <PersonSheet target={sel} d={d} full={full} classes={classes.data ?? []} defaultRole={tab === 'removed' ? 'teacher' : tab}
        onClose={() => setSel(null)} onSaved={() => { setSel(null); users.reload(); }} onSetActive={setActive} />
    </View>
  );
}

const ROLES: Exclude<Role, 'admin'>[] = ['principal', 'vice_principal', 'coordinator', 'teacher', 'student', 'parent'];

function PersonSheet({ target, d, full, classes, defaultRole, onClose, onSaved, onSetActive }: {
  target: User | 'new' | null; d: AdminSchoolDetail; full: boolean; classes: SchoolClass[]; defaultRole: Exclude<Role, 'admin'>;
  onClose: () => void; onSaved: () => void; onSetActive: (u: User, active: boolean) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const isNew = target === 'new';
  const u = target && target !== 'new' ? target : null;
  const [role, setRole] = useState<Exclude<Role, 'admin'>>(defaultRole);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [classId, setClassId] = useState(0);
  const [roll, setRoll] = useState('');
  const [kids, setKids] = useState<number[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const students = useLoad(async () => (role === 'parent' && target
    ? api<User[]>(`/admin/schools/${d.id}/users`, { params: { role: 'student' } }) : Promise.resolve([] as User[])), [role, !!target, d.id]);

  useEffect(() => {
    if (!target) return;
    if (u) {
      setRole(u.role as Exclude<Role, 'admin'>); setName(u.name); setLoginId(u.login_id); setPhone(u.phone); setAddress(u.address);
      setClassId(u.class_id ?? 0); setRoll(u.roll_no != null ? String(u.roll_no) : ''); setKids(u.children_ids ?? []);
    } else {
      setRole(defaultRole); setName(''); setLoginId(''); setPhone(''); setAddress(''); setClassId(classes[0]?.id ?? 0); setRoll(''); setKids([]);
    }
    setPassword('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const active = u ? u.active !== false : true;
  const pwOk = isNew ? password.length >= 6 && password.toLowerCase() !== loginId.toLowerCase() : !password || password.length >= 6;
  const valid = name.trim() && loginId.trim() && pwOk && (role !== 'student' || classId);
  const showContact = full || isNew;

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      if (isNew) {
        await api(`/admin/schools/${d.id}/users`, {
          body: { name: name.trim(), login_id: loginId.trim(), password, role, phone, address,
            class_id: role === 'student' ? classId : null, roll_no: role === 'student' && roll ? Number(roll) : null,
            children_ids: role === 'parent' ? kids : null },
        });
        toast(`${name.trim()} added · temporary password set`);
      } else if (u) {
        const body: Record<string, unknown> = { name: name.trim(), login_id: loginId.trim() };
        if (full) { body.phone = phone; body.address = address; }
        if (u.role === 'student') { body.class_id = classId; body.roll_no = roll ? Number(roll) : null; }
        if (u.role === 'parent') body.children_ids = kids;
        if (password) body.password = password;
        await api(`/admin/schools/${d.id}/users/${u.id}`, { method: 'PUT', body });
        toast(password ? 'Saved · they must set a new password at next sign-in' : 'Changes saved');
      }
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet visible={!!target} onDismiss={onClose} title={isNew ? 'Add person' : undefined}>
        {u ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
            <UserAvatar name={u.name} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700', color: t.colors.onSurface }}>{u.name}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <ToneChip text={ROLE_LABEL[u.role]} tone={ROLE_TONE[u.role] ?? 'neutral'} />
                {!active ? <ToneChip text="Removed" tone="danger" /> : null}
              </View>
            </View>
          </View>
        ) : (
          <FilterChips label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ label: ROLE_LABEL[r], value: r }))} />
        )}
        <TextInput mode="outlined" outlineStyle={fieldOutline} label="Full name" value={name} onChangeText={setName} left={<TextInput.Icon icon="account-outline" />} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" outlineStyle={fieldOutline} label={role === 'parent' ? 'Login ID (mobile number)' : role === 'student' ? 'Login ID (admission no.)' : 'Login ID'}
          value={loginId} onChangeText={setLoginId} autoCapitalize="none" left={<TextInput.Icon icon="card-account-details-outline" />} style={{ marginBottom: space.md }} />
        {showContact ? (
          <>
            <TextInput mode="outlined" outlineStyle={fieldOutline} label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ marginBottom: space.md }} />
            <TextInput mode="outlined" outlineStyle={fieldOutline} label="Address" value={address} onChangeText={setAddress} style={{ marginBottom: space.md }} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginBottom: space.md }}>
            <Icon name="shield-lock-outline" size={18} color={t.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>
              Phone {u?.phone ? `(${u.phone})` : ''} and address are protected — only the school can edit them.
            </Text>
          </View>
        )}
        {role === 'student' ? (
          <>
            <FilterChips label="Class" value={classId} onChange={setClassId} options={classes.map((c) => ({ label: c.name, value: c.id }))} />
            <TextInput mode="outlined" outlineStyle={fieldOutline} label="Roll no." value={roll} onChangeText={(v) => setRoll(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ marginBottom: space.md }} />
          </>
        ) : null}
        {role === 'parent' ? (
          <Panel title="Children" icon="human-male-female-child" subtitle={`${kids.length} selected`}>
            {(students.data ?? []).map((s) => (
              <Checkbox.Item key={s.id} label={`${s.name} · ${classes.find((c) => c.id === s.class_id)?.name ?? ''}`} position="leading"
                status={kids.includes(s.id) ? 'checked' : 'unchecked'} labelStyle={{ textAlign: 'left' }} style={{ paddingHorizontal: 0, paddingVertical: 0 }}
                onPress={() => setKids((k) => (k.includes(s.id) ? k.filter((x) => x !== s.id) : [...k, s.id]))} />
            ))}
            {students.data && !students.data.length ? <Text variant="bodySmall">No students yet.</Text> : null}
          </Panel>
        ) : null}
        <TextInput mode="outlined" outlineStyle={fieldOutline} label={isNew ? 'Temporary password' : 'Reset password (optional)'} value={password} onChangeText={setPassword}
          placeholder={isNew ? undefined : 'Leave empty to keep current'} left={<TextInput.Icon icon="lock-reset" />} error={!pwOk && !!password} />
        <HelperText type={!pwOk && (isNew || !!password) ? 'error' : 'info'} visible>
          Min 6 characters, not the same as the login ID. They'll be asked to set their own at next sign-in.
        </HelperText>
        <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>
          {isNew ? 'Create account' : 'Save changes'}
        </Button>
        {u ? (
          active ? (
            <Button mode="outlined" icon="account-remove-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error, marginTop: space.sm }}
              onPress={() => setConfirm(true)}>Remove account</Button>
          ) : (
            <Button mode="contained-tonal" icon="account-reactivate-outline" style={{ marginTop: space.sm }} onPress={() => onSetActive(u, true)}>Restore account</Button>
          )
        ) : null}
      </Sheet>
      <TopLayer visible={confirm} onDismiss={() => setConfirm(false)}>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)}>
          <Dialog.Icon icon="account-remove-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Remove {u?.name}?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">They won't be able to sign in. All their records are kept and you can restore them any time.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => { setConfirm(false); if (u) onSetActive(u, false); }}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </>
  );
}
