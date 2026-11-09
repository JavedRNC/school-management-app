import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, Button, Switch, Text, TextInput } from 'react-native-paper';

import { rupees, useModules } from '@/components/admin/common';
import { EmptyState, ErrorState, FadeIn, Hero, LoadingCards, Panel, Screen, Sheet, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Plan } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Plans() {
  const t = useAppTheme();
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<Plan[]>('/admin/plans'));
  const modules = useModules();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const label = (k: string) => modules.data?.[k]?.split(' (')[0] ?? k;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing}
        header={<Hero title="Plans" subtitle="Bundles and prices (₹ per student per month)" compact />}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {loading && !data ? <LoadingCards /> : null}
        {data ? (data.length ? data.map((p, i) => (
          <FadeIn key={p.id} index={i}>
            <Panel title={p.name} icon="tag-outline" onPress={() => { haptic.tap(); setEditing(p); }}
              subtitle={`${p.modules.length} modules`}
              right={<View style={{ alignItems: 'flex-end' }}>
                <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.primary }}>{rupees(p.price_per_student)}</Text>
                <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>per student / month</Text>
              </View>}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {p.modules.map((m) => <ToneChip key={m} text={label(m)} tone={m === 'core' ? 'primary' : 'neutral'} />)}
              </View>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
                Minimum {rupees(p.min_monthly)} / month per school
              </Text>
            </Panel>
          </FadeIn>
        )) : <EmptyState icon="tag-off-outline" title="No plans yet" />) : null}
        <Text variant="bodySmall" style={{ color: t.colors.outline, textAlign: 'center' }}>
          Price changes apply to schools on that plan from the next bill. Per-school prices can be overridden in each school.
        </Text>
      </Screen>
      <AnimatedFAB icon="plus" label="New plan" extended onPress={() => { haptic.tap(); setEditing('new'); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      <PlanEditor plan={editing} modules={modules.data ?? {}} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </View>
  );
}

function PlanEditor({ plan, modules, onClose, onSaved }: {
  plan: Plan | 'new' | null; modules: Record<string, string>; onClose: () => void; onSaved: () => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [mods, setMods] = useState<string[]>(['core']);
  const [price, setPrice] = useState('0');
  const [min, setMin] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (plan && plan !== 'new') {
      setName(plan.name); setMods(plan.modules); setPrice(String(plan.price_per_student)); setMin(String(plan.min_monthly));
    } else if (plan === 'new') {
      setName(''); setMods(['core']); setPrice('0'); setMin('0');
    }
  }, [plan]);

  const valid = name.trim() && !Number.isNaN(Number(price)) && !Number.isNaN(Number(min));

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const body = { name: name.trim(), modules: mods, price_per_student: Number(price) || 0, min_monthly: Number(min) || 0 };
      if (plan === 'new') await api('/admin/plans', { body });
      else if (plan) await api(`/admin/plans/${plan.id}`, { method: 'PUT', body });
      toast(plan === 'new' ? 'Plan created' : 'Plan saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!plan} onDismiss={onClose} title={plan === 'new' ? 'New plan' : 'Edit plan'}>
      <TextInput mode="outlined" label="Plan name" value={name} onChangeText={setName} style={{ marginBottom: space.md }} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <TextInput mode="outlined" label="₹ / student / month" value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad" style={{ flex: 1 }} />
        <TextInput mode="outlined" label="Minimum ₹ / month" value={min} onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad" style={{ flex: 1 }} />
      </View>
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.xs }}>Modules</Text>
      {Object.entries(modules).map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onSurface }}>{v}</Text>
          <Switch value={k === 'core' || mods.includes(k)} disabled={k === 'core'}
            onValueChange={(on) => { haptic.tap(); setMods((m) => (on ? [...m, k] : m.filter((x) => x !== k))); }} />
        </View>
      ))}
      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!valid} style={{ marginTop: space.md }}
        contentStyle={{ paddingVertical: 6 }}>Save plan</Button>
    </Sheet>
  );
}
