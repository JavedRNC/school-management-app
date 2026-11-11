import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Switch, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { FadeIn, Panel, StatTile, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { DAYS, space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail } from '@/lib/types';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function SchoolDetailsSection({ d, onSaved }: { d: AdminSchoolDetail; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState(d.name);
  const [address, setAddress] = useState(d.address);
  const [phone, setPhone] = useState(d.phone);
  const [board, setBoard] = useState(d.board);
  const [notes, setNotes] = useState(d.admin_notes);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(d.name); setAddress(d.address); setPhone(d.phone); setBoard(d.board); setNotes(d.admin_notes);
  }, [d]);

  async function put(body: object, msg: string) {
    setBusy(true);
    try {
      await api(`/admin/schools/${d.id}`, { method: 'PUT', body });
      toast(msg);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const dirty = name !== d.name || address !== d.address || phone !== d.phone || board !== d.board || notes !== d.admin_notes;
  const workDays = (d.working_days ?? []).map((x) => DAY_NAMES[x] ?? DAYS[x]).join(', ');

  return (
    <>
      <FadeIn>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          <StatTile icon="account-school-outline" label="Students" value={d.students} tone="success" />
          <StatTile icon="human-male-board" label="Teachers" value={d.teachers} tone="warning" />
          <StatTile icon="google-classroom" label="Classes" value={d.classes} />
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Panel title="School information" icon="domain">
          <TextInput mode="outlined" label="School name" value={name} onChangeText={setName} style={{ marginBottom: space.md }} />
          <TextInput mode="outlined" label="Address" value={address} onChangeText={setAddress} multiline style={{ marginBottom: space.md }} />
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ flex: 1 }} />
            <TextInput mode="outlined" label="Board" value={board} onChangeText={setBoard} style={{ flex: 1 }} />
          </View>
          <TextInput mode="outlined" label="Admin notes (only you see these)" value={notes} onChangeText={setNotes} multiline
            style={{ marginBottom: space.md, minHeight: 80 }} />
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
            Working days (set by the principal): {workDays || '—'}
          </Text>
          <Button mode="contained" icon="content-save-outline" disabled={!dirty || !name.trim()} loading={busy}
            onPress={() => put({ name: name.trim(), address, phone, board, admin_notes: notes }, 'School details saved')}
            contentStyle={{ paddingVertical: 6 }}>Save</Button>
        </Panel>
      </FadeIn>
      <FadeIn index={2}>
        <Panel title={d.suspended ? 'School is suspended' : 'Suspend school'} icon="cancel" tone={d.suspended ? 'danger' : undefined}
          subtitle={d.suspended ? 'Nobody in this school can sign in.' : 'Blocks all sign-ins for this school. Data is kept.'}
          right={<Switch value={d.suspended} onValueChange={() => { haptic.tap(); setConfirm(true); }} />} />
      </FadeIn>
      <TopLayer visible={confirm} onDismiss={() => setConfirm(false)}>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)}>
          <Dialog.Icon icon={d.suspended ? 'lock-open-variant-outline' : 'lock-outline'} />
          <Dialog.Title style={{ textAlign: 'center' }}>{d.suspended ? `Reactivate ${d.name}?` : `Suspend ${d.name}?`}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {d.suspended ? 'Everyone in this school will be able to sign in again.'
                : 'Principal, teachers, students and parents will be signed out and unable to sign in until you reactivate it. No data is deleted.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Cancel</Button>
            <Button textColor={d.suspended ? undefined : t.colors.error}
              onPress={() => { setConfirm(false); put({ suspended: !d.suspended }, d.suspended ? 'School reactivated' : 'School suspended'); }}>
              {d.suspended ? 'Reactivate' : 'Suspend'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </>
  );
}
