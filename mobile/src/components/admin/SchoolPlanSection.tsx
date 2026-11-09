import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';

import { FadeIn, FilterChips, Panel, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail, Plan } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { DateField, dateOk, fmtDay, rupees, StatusChip, useModules } from './common';

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function SchoolPlanSection({ d, onSaved }: { d: AdminSchoolDetail; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const plans = useLoad(() => api<Plan[]>('/admin/plans'));
  const modules = useModules();
  const sub = d.subscription;

  const [planId, setPlanId] = useState<number>(d.subscription.plan_id ?? 0);
  const [custom, setCustom] = useState<boolean>(d.custom_modules !== null);
  const [mods, setMods] = useState<string[]>(d.custom_modules ?? sub.modules);
  const [customPrice, setCustomPrice] = useState(d.custom_price);
  const [price, setPrice] = useState(d.price_override != null ? String(d.price_override) : '');
  const [min, setMin] = useState(d.min_override != null ? String(d.min_override) : '');
  const [discount, setDiscount] = useState(String(d.discount_pct ?? 0));
  const [isFree, setIsFree] = useState(d.is_free);
  const [freeUntil, setFreeUntil] = useState(d.free_until ?? '');
  const [trialUntil, setTrialUntil] = useState(d.trial_until ?? '');
  const [validUntil, setValidUntil] = useState(d.valid_until ?? '');
  const [grace, setGrace] = useState(String(d.grace_days ?? 7));
  const [maxStudents, setMaxStudents] = useState(d.max_students != null ? String(d.max_students) : '');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(d.billing_cycle ?? 'monthly');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPlanId(d.subscription.plan_id ?? 0); setCustom(d.custom_modules !== null); setMods(d.custom_modules ?? d.subscription.modules);
    setCustomPrice(d.custom_price); setPrice(d.price_override != null ? String(d.price_override) : '');
    setMin(d.min_override != null ? String(d.min_override) : ''); setDiscount(String(d.discount_pct ?? 0));
    setIsFree(d.is_free); setFreeUntil(d.free_until ?? ''); setTrialUntil(d.trial_until ?? ''); setValidUntil(d.valid_until ?? '');
    setGrace(String(d.grace_days ?? 7)); setMaxStudents(d.max_students != null ? String(d.max_students) : ''); setCycle(d.billing_cycle ?? 'monthly');
  }, [d]);

  const selectedPlan = plans.data?.find((p) => p.id === planId);
  const shownMods = custom ? mods : (selectedPlan?.modules ?? []);
  const datesOk = [freeUntil, trialUntil, validUntil].every(dateOk);
  const discountOk = Number(discount) >= 0 && Number(discount) <= 100;

  async function save() {
    if (!datesOk || !discountOk) return haptic.error();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        plan_id: planId || null,
        discount_pct: Number(discount) || 0,
        is_free: isFree, free_until: freeUntil || null,
        trial_until: trialUntil || null, valid_until: validUntil || null,
        grace_days: Number(grace) || 0, max_students: num(maxStudents), billing_cycle: cycle,
      };
      if (custom) body.custom_modules = mods;
      else body.use_plan_modules = true;
      if (customPrice) {
        body.price_per_student = num(price) ?? 0;
        body.min_monthly = num(min) ?? 0;
      } else body.clear_custom_price = true;
      await api(`/admin/schools/${d.id}`, { method: 'PUT', body });
      toast('Subscription saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const est = sub.estimate;
  return (
    <>
      <FadeIn>
        <Panel tone={sub.status === 'expired' || sub.status === 'suspended' ? 'danger' : sub.status === 'grace' || sub.status === 'trial' ? 'warning' : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
            <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>Current bill</Text>
            <StatusChip status={sub.status} />
          </View>
          <Text variant="headlineMedium" style={{ fontWeight: '800', color: est.free ? t.custom.success : t.colors.primary }}>
            {est.free ? 'Free' : `${rupees(est.amount)} / month`}
          </Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
            {est.students} students × {rupees(est.price_per_student)} = {rupees(est.students * est.price_per_student)}
            {est.min_monthly ? ` · minimum ${rupees(est.min_monthly)}` : ''}{est.discount_pct ? ` · ${est.discount_pct}% off` : ''}
          </Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>
            Trial until {fmtDay(sub.trial_until)} · Paid until {fmtDay(sub.valid_until)} · {sub.grace_days} grace days
          </Text>
          <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: 4 }}>Figures update after you save.</Text>
        </Panel>
      </FadeIn>

      <FadeIn index={1}>
        <Panel title="Plan & modules" icon="puzzle-outline">
          {plans.data ? (
            <FilterChips value={planId} onChange={setPlanId}
              options={[{ label: 'No plan', value: 0 }, ...plans.data.map((p) => ({ label: `${p.name} · ${rupees(p.price_per_student)}`, value: p.id }))]} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: '600' }}>Custom modules for this school</Text>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Off = use the plan's modules</Text>
            </View>
            <Switch value={custom} onValueChange={(v) => { haptic.tap(); setCustom(v); if (v) setMods(shownMods.length ? shownMods : ['core']); }} />
          </View>
          {Object.entries(modules.data ?? {}).map(([k, v]) => {
            const on = k === 'core' || shownMods.includes(k);
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
                <Text variant="bodyMedium" style={{ flex: 1, color: on ? t.colors.onSurface : t.colors.onSurfaceVariant }}>{v}</Text>
                <Switch value={on} disabled={!custom || k === 'core'}
                  onValueChange={(x) => { haptic.tap(); setMods((m) => (x ? [...m, k] : m.filter((y) => y !== k))); }} />
              </View>
            );
          })}
        </Panel>
      </FadeIn>

      <FadeIn index={2}>
        <Panel title="Pricing" icon="currency-inr">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
            <Text variant="bodyLarge" style={{ flex: 1, color: t.colors.onSurface, fontWeight: '600' }}>Custom price for this school</Text>
            <Switch value={customPrice} onValueChange={(v) => { haptic.tap(); setCustomPrice(v); }} />
          </View>
          {customPrice ? (
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
              <TextInput mode="outlined" label="₹ / student / month" value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad" style={{ flex: 1 }} />
              <TextInput mode="outlined" label="Minimum ₹ / month" value={min} onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
          ) : (
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              Using plan price{selectedPlan ? `: ${rupees(selectedPlan.price_per_student)}/student, minimum ${rupees(selectedPlan.min_monthly)}` : ''}.
            </Text>
          )}
          <TextInput mode="outlined" label="Discount %" value={discount} onChangeText={(v) => setDiscount(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad" error={!discountOk} style={{ marginBottom: space.md }} />
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>Billing cycle</Text>
          <SegmentedButtons value={cycle} onValueChange={(v) => setCycle(v as 'monthly' | 'yearly')}
            buttons={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
        </Panel>
      </FadeIn>

      <FadeIn index={3}>
        <Panel title="Free / sponsored" icon="gift-outline" tone={isFree ? 'success' : undefined}
          subtitle="All enabled modules at no charge"
          right={<Switch value={isFree} onValueChange={(v) => { haptic.tap(); setIsFree(v); }} />}>
          {isFree ? <DateField label="Free until (empty = no end)" value={freeUntil} onChange={setFreeUntil} /> : null}
        </Panel>
      </FadeIn>

      <FadeIn index={4}>
        <Panel title="Validity" icon="calendar-range">
          <DateField label="Trial until" value={trialUntil} onChange={setTrialUntil} />
          <DateField label="Paid until" value={validUntil} onChange={setValidUntil} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <TextInput mode="outlined" label="Grace days" value={grace} onChangeText={(v) => setGrace(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ flex: 1 }} />
            <TextInput mode="outlined" label="Max students (empty = no limit)" value={maxStudents} onChangeText={(v) => setMaxStudents(v.replace(/\D/g, ''))}
              keyboardType="number-pad" style={{ flex: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: space.md, flexWrap: 'wrap' }}>
            <ToneChip text="After paid-until → grace" tone="warning" />
            <ToneChip text="After grace → read-only (no data lost)" tone="danger" />
          </View>
        </Panel>
      </FadeIn>

      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!datesOk || !discountOk}
        contentStyle={{ paddingVertical: 8 }}>Save subscription</Button>
    </>
  );
}
