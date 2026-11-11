import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { StatusBanner } from '@/components/StatusBanner';
import { FadeIn, Hero, LoadingCards, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { DAY_NAMES, DAYS, space, useAppTheme } from '@/lib/theme';

/** School profile + working days (F4). */
export default function SettingsScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school, refreshSchool } = useAuth();
  const canEdit = useCan('settings', 'edit') && school?.can_write !== false;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [board, setBoard] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState<'profile' | 'days' | null>(null);

  useEffect(() => {
    if (school) {
      setName(school.name); setAddress(school.address); setPhone(school.phone); setBoard(school.board);
      setDays(school.working_days ?? []);
    }
  }, [school]);

  if (!school) return <Screen header={<Hero title="School settings" compact />}><LoadingCards /></Screen>;

  const offDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !days.includes(d));
  const summary = days.length === 0 ? 'Choose at least one day'
    : `${days.length} working day${days.length === 1 ? '' : 's'}${offDays.length ? ` · ${offDays.map((d) => DAY_NAMES[d]).join(' & ')} off` : ' · no weekly off'}`;
  const daysChanged = [...days].sort().join() !== [...(school.working_days ?? [])].sort().join();
  const profileChanged = name !== school.name || address !== school.address || phone !== school.phone || board !== school.board;

  async function save(kind: 'profile' | 'days') {
    if (kind === 'days' && !days.length) return haptic.error();
    if (kind === 'profile' && !name.trim()) return haptic.error();
    setBusy(kind);
    try {
      await api('/school/settings', {
        method: 'PUT',
        body: kind === 'days' ? { working_days: days } : { name: name.trim(), address: address.trim(), phone: phone.trim(), board: board.trim() },
      });
      await refreshSchool();
      toast(kind === 'days' ? `Working days saved · ${summary}` : 'School profile saved');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen header={<Hero title="School settings" subtitle={`School code ${school.code}`} compact />}>
      <StatusBanner />
      <FadeIn>
        <Panel title="Working days" subtitle={summary} icon="calendar-week">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
            {DAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <Chip key={d} selected={on} showSelectedCheck mode={on ? 'flat' : 'outlined'} disabled={!canEdit}
                  style={on ? { backgroundColor: t.colors.secondaryContainer } : undefined}
                  onPress={() => { haptic.tap(); setDays((cur) => (on ? cur.filter((x) => x !== i) : [...cur, i].sort())); }}>
                  {d}
                </Chip>
              );
            })}
          </View>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
            Off days don't need attendance and are skipped in attendance % and the timetable. Add festivals and vacations in the School calendar.
          </Text>
          {canEdit ? (
            <Button mode="contained" icon="content-save-outline" onPress={() => save('days')} loading={busy === 'days'} disabled={!daysChanged || !days.length}>
              Save working days
            </Button>
          ) : null}
        </Panel>
      </FadeIn>
      <FadeIn index={1}>
        <Panel title="School profile" subtitle="Shown on the app, receipts and ID cards" icon="domain">
          <TextInput mode="outlined" label="School name" value={name} onChangeText={setName} editable={canEdit} error={!name.trim()} />
          <HelperText type="error" visible={!name.trim()}>Name is required</HelperText>
          <TextInput mode="outlined" label="Address" value={address} onChangeText={setAddress} editable={canEdit} multiline style={{ marginBottom: space.md }} />
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} editable={canEdit} keyboardType="phone-pad" style={{ flex: 1 }} />
            <TextInput mode="outlined" label="Board" value={board} onChangeText={setBoard} editable={canEdit} placeholder="CBSE" style={{ flex: 1 }} />
          </View>
          {canEdit ? (
            <Button mode="contained" icon="content-save-outline" onPress={() => save('profile')} loading={busy === 'profile'} disabled={!profileChanged || !name.trim()}>
              Save profile
            </Button>
          ) : (
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>View only.</Text>
          )}
        </Panel>
      </FadeIn>
    </Screen>
  );
}
