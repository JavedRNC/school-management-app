import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, View } from 'react-native';
import { Button, HelperText, Searchbar } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { SchoolRow } from '@/components/admin/common';
import { Fab, EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail, AdminSchoolRow, Plan, SchoolStatus } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Filter = 'all' | SchoolStatus;

export default function Schools() {
  const t = useAppTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [fabExtended, setFabExtended] = useState(true);
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<AdminSchoolRow[]>('/admin/schools'));

  const list = useMemo(() => (data ?? []).filter((s) =>
    (filter === 'all' || s.status === filter) &&
    (!q || `${s.name} ${s.code}`.toLowerCase().includes(q.toLowerCase()))), [data, q, filter]);

  const count = (f: Filter) => (data ?? []).filter((s) => f === 'all' || s.status === f).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setFabExtended(e.nativeEvent.contentOffset.y <= 10)}
        scrollEventThrottle={32} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.colors.primary]} />}>
        <Hero title="Schools" subtitle={data ? `${data.length} on the platform` : ' '} compact>
          <Searchbar placeholder="Search by name or code" value={q} onChangeText={setQ} elevation={2} style={{ borderRadius: 28 }} />
        </Hero>
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <FilterChips value={filter} onChange={setFilter}
            options={(['all', 'active', 'trial', 'free', 'grace', 'expired', 'suspended'] as Filter[]).map((f) => ({
              label: `${f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)} · ${count(f)}`, value: f,
            }))} />
          {error ? <ErrorState message={error} onRetry={reload} /> : null}
          {loading && !data ? <LoadingCards /> : null}
          {data ? (
            list.length ? (
              <FadeIn>
                <Panel>{list.map((s, i) => <SchoolRow key={s.id} s={s} divider={i < list.length - 1} />)}</Panel>
              </FadeIn>
            ) : <EmptyState icon="domain-off" title={q ? 'No matches' : 'No schools here'} text={q ? `Nothing found for “${q}”` : undefined} />
          ) : null}
        </View>
      </ScrollView>
      <Fab icon="domain-plus" label="Add school" extended={fabExtended} onPress={() => { haptic.tap(); setAdding(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      <AddSchool visible={adding} onDismiss={() => setAdding(false)} onAdded={(d) => {
        setAdding(false);
        reload();
        router.push({ pathname: '/admin-school/[id]', params: { id: String(d.id) } });
      }} />
    </View>
  );
}

function AddSchool({ visible, onDismiss, onAdded }: { visible: boolean; onDismiss: () => void; onAdded: (d: AdminSchoolDetail) => void }) {
  const toast = useToast();
  const plans = useLoad(() => api<Plan[]>('/admin/plans'));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [board, setBoard] = useState('');
  const [planId, setPlanId] = useState<number>(0);
  const [pName, setPName] = useState('');
  const [pLogin, setPLogin] = useState('principal');
  const [pPw, setPPw] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const codeOk = /^[A-Z0-9-]{3,20}$/.test(code) && code !== 'ADMIN';
  const valid = codeOk && name.trim() && pName.trim() && pLogin.trim() && pPw.length >= 6 && pPw.toLowerCase() !== pLogin.toLowerCase();

  async function save() {
    setTouched(true);
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const d = await api<AdminSchoolDetail>('/admin/schools', {
        body: { code, name: name.trim(), address, phone, board, plan_id: planId || null, principal_name: pName.trim(),
          principal_login_id: pLogin.trim(), principal_password: pPw, principal_phone: pPhone },
      });
      toast(`${d.name} created · 30-day trial started`);
      setCode(''); setName(''); setAddress(''); setPhone(''); setBoard(''); setPName(''); setPLogin('principal'); setPPw(''); setPPhone('');
      setTouched(false);
      onAdded(d);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Add school">
      <TextInput mode="outlined" label="School code (used to sign in)" value={code} autoCapitalize="characters" autoCorrect={false}
        onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} left={<TextInput.Icon icon="domain" />} error={touched && !codeOk} />
      <HelperText type={touched && !codeOk ? 'error' : 'info'} visible>3–20 letters/numbers, e.g. DPS042</HelperText>
      <TextInput mode="outlined" label="School name" value={name} onChangeText={setName} error={touched && !name.trim()} style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Address" value={address} onChangeText={setAddress} style={{ marginBottom: space.md }} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <TextInput mode="outlined" label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ flex: 1 }} />
        <TextInput mode="outlined" label="Board" value={board} onChangeText={setBoard} placeholder="CBSE" style={{ flex: 1 }} />
      </View>
      {plans.data ? (
        <FilterChips label="Plan" value={planId} onChange={setPlanId}
          options={[{ label: 'No plan', value: 0 }, ...plans.data.map((p) => ({ label: p.name, value: p.id }))]} />
      ) : null}
      <Panel title="Principal account" icon="account-tie" style={{ marginTop: space.sm }}>
        <TextInput mode="outlined" label="Principal name" value={pName} onChangeText={setPName} error={touched && !pName.trim()} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" label="Login ID" value={pLogin} onChangeText={setPLogin} autoCapitalize="none" style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" label="Temporary password" value={pPw} onChangeText={setPPw} left={<TextInput.Icon icon="lock-outline" />}
          error={touched && (pPw.length < 6 || pPw.toLowerCase() === pLogin.toLowerCase())} />
        <HelperText type="info" visible>Min 6 characters. They must change it on first sign-in.</HelperText>
        <TextInput mode="outlined" label="Principal phone" value={pPhone} onChangeText={setPPhone} keyboardType="phone-pad" />
      </Panel>
      <Button mode="contained" icon="check" onPress={save} loading={busy} contentStyle={{ paddingVertical: 6 }}>Create school</Button>
    </Sheet>
  );
}
