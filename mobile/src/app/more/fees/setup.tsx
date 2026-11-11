import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Divider, HelperText, IconButton, Switch, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { amountText, Bar, academicYear, Glow, KV, MoneyInput, MonthStepper, parseAmount, UPI_RE } from '@/components/fees/setup/common';
import { StatusBanner } from '@/components/StatusBanner';
import { EmptyState, ErrorState, FadeIn, Hero, Icon, IconBadge, LoadingCards, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { fmtDate, inr, monthLabel, shiftMonth } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeConfig, GenerateResult } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Fee setup (F10/F11): tuition per class, transport per route, due day, UPI, receipts, monthly billing. */
export default function FeeSetupScreen() {
  const enabled = useModule('fees');
  const canView = useCan('fees', 'view');
  if (!enabled || !canView) {
    return (
      <Screen header={<Hero title="Fee setup" compact />}>
        <EmptyState icon={enabled ? 'lock-outline' : 'cash-lock'} title={enabled ? 'No access' : "Fees aren't on your plan"}
          text={enabled ? "You don't have permission to view fees." : 'Ask the school to enable the Fees module.'} />
      </Screen>
    );
  }
  return <Setup />;
}

function Setup() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('fees', 'edit') && school?.can_write !== false;
  const cfg = useLoad(() => api<FeeConfig>('/fees/config'));
  const c = cfg.data;

  const [monthly, setMonthly] = useState('');
  const [sameForAll, setSameForAll] = useState(true);
  const [classAmt, setClassAmt] = useState<Record<string, string>>({});
  const [routeAmt, setRouteAmt] = useState<Record<string, string>>({});
  const [dueDay, setDueDay] = useState(10);
  const [startOn, setStartOn] = useState(false);
  const [startMonth, setStartMonth] = useState('');
  const [auto, setAuto] = useState(true);
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  const [loadedFor, setLoadedFor] = useState<FeeConfig | null>(null);

  useEffect(() => {
    if (!c || loadedFor === c) return;
    setLoadedFor(c);
    setMonthly(amountText(c.monthly_amount || null));
    const custom = Object.keys(c.class_amounts ?? {});
    setSameForAll(custom.length === 0);
    setClassAmt(Object.fromEntries(c.classes.map((k) => [String(k.id), k.custom ? amountText(k.amount) : ''])));
    setRouteAmt(Object.fromEntries(c.routes.map((r) => [String(r.id), amountText(r.amount || null)])));
    setDueDay(c.due_day);
    setStartOn(!!c.start_month);
    setStartMonth(c.start_month ?? c.current_period);
    setAuto(c.auto_generate);
    setUpiId(c.upi_id);
    setUpiName(c.upi_name);
    setPrefix(c.receipt_prefix);
    setNote(c.receipt_note);
  }, [c, loadedFor]);

  const def = parseAmount(monthly);
  const defOk = monthly === '' || (!Number.isNaN(def) && def >= 0);
  const upiOk = !upiId.trim() || UPI_RE.test(upiId.trim());

  const amountFor = (classId: number) => {
    if (!sameForAll) {
      const v = parseAmount(classAmt[String(classId)] ?? '');
      if (!Number.isNaN(v)) return v;
    }
    return Number.isNaN(def) ? 0 : def;
  };

  const expected = useMemo(() => {
    if (!c) return 0;
    let sum = 0;
    for (const k of c.classes) sum += amountFor(k.id) * k.students;
    if (c.transport_enabled) for (const r of c.routes) sum += (parseAmount(routeAmt[String(r.id)] ?? '') || 0) * r.riders;
    return Math.round(sum * 100) / 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, monthly, sameForAll, classAmt, routeAmt]);

  async function save() {
    if (!c) return;
    if (!defOk || !upiOk) { haptic.error(); return toast(!upiOk ? 'Fix the UPI ID first' : 'Enter a valid monthly amount', { error: true }); }
    setBusy(true);
    try {
      const class_amounts: Record<string, number> = {};
      if (!sameForAll) {
        for (const [k, s] of Object.entries(classAmt)) {
          const v = parseAmount(s);
          if (!Number.isNaN(v) && v >= 0) class_amounts[k] = v;
        }
      }
      const route_amounts: Record<string, number> = {};
      for (const [k, s] of Object.entries(routeAmt)) {
        const v = parseAmount(s);
        if (!Number.isNaN(v) && v > 0) route_amounts[k] = v;
      }
      const next = await api<FeeConfig>('/fees/config', {
        method: 'PUT',
        body: {
          monthly_amount: Number.isNaN(def) ? 0 : def, class_amounts, route_amounts, due_day: dueDay,
          start_month: startOn ? startMonth : null, auto_generate: auto, upi_id: upiId.trim(), upi_name: upiName.trim(),
          receipt_prefix: prefix.trim(), receipt_note: note.trim(),
        },
      });
      cfg.setData(next);
      setSaved((n) => n + 1);
      toast(`Fee setup saved · expected ${inr(next.expected_monthly)} a month`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  if (cfg.error && !c) {
    return <Screen header={<Hero title="Fee setup" compact />}><ErrorState message={cfg.error} onRetry={cfg.reload} /></Screen>;
  }
  if (!c) return <Screen header={<Hero title="Fee setup" compact />}><LoadingCards count={4} /></Screen>;

  const samplePrefix = (prefix.trim() || school?.code || 'SCH').replace(/[^A-Za-z0-9-]/g, '');
  const payee = upiName.trim() || school?.name || 'School';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={cfg.refresh} refreshing={cfg.refreshing} footerSpace={canEdit ? 140 : 96}
        header={
          <Hero title="Fee setup" subtitle="Monthly fees, transport, UPI and receipts" compact>
            <Glow trigger={saved}>
              <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.lg, flexDirection: 'row',
                alignItems: 'center', gap: space.md, elevation: 3 }}>
                <IconBadge icon="cash-multiple" tone="success" size={44} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Expected every month</Text>
                  <Text variant="headlineSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(expected)}</Text>
                  <Text variant="labelSmall" style={{ color: t.colors.outline }}>
                    {c.classes.reduce((a, k) => a + k.students, 0)} students{c.transport_enabled ? ` · ${c.routes.reduce((a, r) => a + r.riders, 0)} bus riders` : ''}
                  </Text>
                </View>
              </View>
            </Glow>
          </Hero>
        }>
        <View style={{ height: space.lg }} />
        <StatusBanner />
        {!canEdit ? (
          <Panel tone="neutral" icon="eye-outline" title="View only" subtitle="Only the principal (or staff with Fees · Edit) can change fee settings." />
        ) : null}

        {/* 1 · tuition */}
        <FadeIn>
          <Panel title="Monthly tuition fee" subtitle="Charged to every active student each month" icon="school-outline">
            <MoneyInput label="Default monthly fee" value={monthly} onChange={setMonthly} editable={canEdit} error={!defOk} />
            <HelperText type={defOk ? 'info' : 'error'}>{defOk ? 'Leave 0 if you only collect extra fees.' : 'Enter a valid amount'}</HelperText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>Same fee for all classes</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Turn off to set a different fee for some classes</Text>
              </View>
              <Switch value={sameForAll} disabled={!canEdit} onValueChange={(v) => { haptic.tap(); setSameForAll(v); }} />
            </View>
            {!sameForAll ? (
              <View style={{ marginTop: space.md, gap: space.sm }}>
                {c.classes.length ? c.classes.map((k) => {
                  const key = String(k.id);
                  const val = classAmt[key] ?? '';
                  return (
                    <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <View style={{ width: 84 }}>
                        <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{k.name}</Text>
                        <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{k.students} students</Text>
                      </View>
                      <MoneyInput label={val ? 'Class fee' : `Default ${inr(Number.isNaN(def) ? 0 : def)}`} value={val} dense editable={canEdit}
                        onChange={(s) => setClassAmt((cur) => ({ ...cur, [key]: s }))} style={{ flex: 1 }} />
                      <IconButton icon="restore" size={20} disabled={!canEdit || !val} accessibilityLabel="Use default"
                        onPress={() => { haptic.tap(); setClassAmt((cur) => ({ ...cur, [key]: '' })); }} />
                    </View>
                  );
                }) : <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No classes yet — add classes first.</Text>}
              </View>
            ) : null}
          </Panel>
        </FadeIn>

        {/* 2 · transport */}
        {c.transport_enabled ? (
          <FadeIn index={1}>
            <Panel title="Transport fee" subtitle="Monthly, per route — added only for students assigned to a bus" icon="bus-school">
              {c.routes.length ? c.routes.map((r, i) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: i ? space.sm : 0 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={2}>{r.name}</Text>
                    <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{r.riders} rider{r.riders === 1 ? '' : 's'}</Text>
                  </View>
                  <MoneyInput label="Per month" value={routeAmt[String(r.id)] ?? ''} dense editable={canEdit} style={{ width: 140 }}
                    onChange={(s) => setRouteAmt((cur) => ({ ...cur, [String(r.id)]: s }))} />
                </View>
              )) : <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No routes yet. Add routes in Transport.</Text>}
            </Panel>
          </FadeIn>
        ) : null}

        {/* 3 · due day */}
        <FadeIn index={2}>
          <Panel title="Due date & billing" subtitle={`Fees are due on the ${ordinal(dueDay)} of every month`} icon="calendar-clock">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <IconButton mode="contained-tonal" icon="minus" disabled={!canEdit || dueDay <= 1} onPress={() => { haptic.tap(); setDueDay((d) => Math.max(1, d - 1)); }} />
              <View style={{ alignItems: 'center', minWidth: 72 }}>
                <Text variant="headlineMedium" style={{ fontWeight: '700', color: t.colors.primary }}>{dueDay}</Text>
                <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>day of month</Text>
              </View>
              <IconButton mode="contained-tonal" icon="plus" disabled={!canEdit || dueDay >= 28} onPress={() => { haptic.tap(); setDueDay((d) => Math.min(28, d + 1)); }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
              {[5, 7, 10, 15, 20].map((d) => (
                <Chip key={d} compact selected={dueDay === d} disabled={!canEdit} onPress={() => { haptic.tap(); setDueDay(d); }}>{ordinal(d)}</Chip>
              ))}
            </View>
            <Divider style={{ marginBottom: space.md }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>Bill automatically every month</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                  On the 1st, each student's tuition (and bus fee) is added the first time anyone opens Fees. Students added later can be billed with "Bill a month" below.
                </Text>
              </View>
              <Switch value={auto} disabled={!canEdit} onValueChange={(v) => { haptic.tap(); setAuto(v); }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>Start billing from a month</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Automatic billing won't charge months before this</Text>
              </View>
              <Switch value={startOn} disabled={!canEdit} onValueChange={(v) => { haptic.tap(); setStartOn(v); }} />
            </View>
            {startOn ? (
              <View style={{ marginTop: space.sm }}>
                <MonthStepper value={startMonth} onChange={(p) => canEdit && setStartMonth(p)} max={shiftMonth(c.current_period, 1)} />
              </View>
            ) : null}
          </Panel>
        </FadeIn>

        {/* 4 · UPI */}
        <FadeIn index={3}>
          <Panel title="UPI payments" subtitle="Parents pay from any UPI app; you confirm the UTR" icon="qrcode-scan">
            <TextInput mode="outlined" label="School UPI ID" value={upiId} onChangeText={(s) => setUpiId(s.replace(/\s/g, ''))} editable={canEdit}
              autoCapitalize="none" placeholder="schoolname@sbi" error={!upiOk}
              right={upiId && upiOk ? <TextInput.Icon icon="check-circle" color={t.custom.success} /> : undefined} />
            <HelperText type={upiOk ? 'info' : 'error'}>
              {upiOk ? (upiId ? 'Looks good' : 'Leave empty to turn off UPI payments for parents') : 'Should look like name@bank — e.g. greenvalley@sbi'}
            </HelperText>
            <TextInput mode="outlined" label="Payee name (shown in UPI app)" value={upiName} onChangeText={setUpiName} editable={canEdit} />
            {upiId && upiOk ? (
              <View style={{ marginTop: space.md, borderRadius: radius.lg, padding: space.md, backgroundColor: t.colors.surfaceVariant, gap: 4 }}>
                <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Parents will see</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="qrcode" size={32} color={t.colors.onSurface} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>Pay {payee}</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{upiId.trim()} · scan or tap "Pay with UPI app"</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </Panel>
        </FadeIn>

        {/* 5 · receipts */}
        <FadeIn index={4}>
          <Panel title="Receipts" subtitle="Numbered automatically, restarting every April" icon="receipt-text-outline">
            <TextInput mode="outlined" label="Receipt prefix" value={prefix} editable={canEdit} autoCapitalize="characters" maxLength={20}
              onChangeText={(s) => setPrefix(s.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.sm }}>
              <Icon name="pound" size={16} color={t.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Sample:</Text>
              <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.primary, letterSpacing: 0.5 }}>{samplePrefix}/{academicYear()}/0001</Text>
            </View>
            <TextInput mode="outlined" label="Footer note on receipts" value={note} onChangeText={setNote} editable={canEdit} multiline maxLength={500}
              placeholder="Fees once paid are not refundable." />
          </Panel>
        </FadeIn>

        {/* 6 · bill a month */}
        <FadeIn index={5}>
          <BillMonth c={c} canEdit={canEdit} onDone={cfg.reload} />
        </FadeIn>
      </Screen>

      {canEdit ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingTop: space.md,
          backgroundColor: t.colors.elevation.level2, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 8 }}>
          <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={busy || !defOk || !upiOk}
            contentStyle={{ paddingVertical: 6 }}>
            Save fee setup
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function BillMonth({ c, canEdit, onDone }: { c: FeeConfig; canEdit: boolean; onDone: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [period, setPeriod] = useState(c.current_period);
  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'go' | null>(null);
  const [done, setDone] = useState(0);
  const max = shiftMonth(c.current_period, 1);

  async function run(isPreview: boolean) {
    setBusy(isPreview ? 'preview' : 'go');
    try {
      const r = await api<GenerateResult>('/fees/generate', { body: { period, preview: isPreview } });
      if (isPreview) {
        setPreview(r);
        haptic.light();
      } else {
        setPreview(null);
        setDone((n) => n + 1);
        toast(r.new_items ? `${r.label} billed · ${r.new_items} charges · ${inr(r.new_amount)}` : `${r.label} was already billed — nothing new`);
        onDone();
      }
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  const billed = c.generated_months.includes(period);
  return (
    <Glow trigger={done} style={{ marginBottom: space.md }}>
      <Panel title="Bill a month" subtitle="Adds tuition and bus fees for every active student. Safe to run again — no one is charged twice." icon="calendar-plus"
        style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }}>
          <MonthStepper value={period} max={max} onChange={(p) => { setPeriod(p); setPreview(null); }} />
          {billed ? <Chip compact icon="check-circle" style={{ backgroundColor: t.custom.successContainer }} textStyle={{ color: t.custom.onSuccessContainer }}>Billed</Chip> : null}
        </View>
        {preview ? (
          <View style={{ marginTop: space.md, borderRadius: radius.lg, padding: space.md, backgroundColor: t.colors.surfaceVariant }}>
            <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 4, color: t.colors.onSurface }}>{preview.label}</Text>
            {preview.new_items ? (
              <>
                <KV k="New charges" v={String(preview.new_items)} />
                <KV k="Students" v={String(preview.students)} />
                <KV k="Due on" v={fmtDate(preview.due_date)} />
                <KV k="Total to bill" v={inr(preview.new_amount)} strong />
                {c.expected_monthly ? (
                  <View style={{ marginTop: 6 }}>
                    <Bar value={preview.new_amount / c.expected_monthly} />
                    <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 2 }}>
                      {Math.round((preview.new_amount / c.expected_monthly) * 100)}% of a full month
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Everyone is already billed for this month.</Text>
            )}
          </View>
        ) : null}
        {canEdit ? (
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Button mode="outlined" icon="eye-outline" onPress={() => run(true)} loading={busy === 'preview'} disabled={!!busy} style={{ flex: 1 }}>Preview</Button>
            <Button mode="contained" icon="cash-plus" onPress={() => run(false)} loading={busy === 'go'}
              disabled={!!busy || !preview || !preview.new_items} style={{ flex: 1 }}>
              {preview?.new_items ? `Bill ${preview.students}` : 'Bill'}
            </Button>
          </View>
        ) : null}
        {c.generated_months.length ? (
          <View style={{ marginTop: space.md }}>
            <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>Months billed</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[...c.generated_months].reverse().map((p) => (
                <Chip key={p} compact icon="check" onPress={() => { haptic.tap(); setPeriod(p); setPreview(null); }}>{monthLabel(p)}</Chip>
              ))}
            </View>
          </View>
        ) : null}
      </Panel>
    </Glow>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
