import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Searchbar, Switch, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, IconName, LoadingCards, Panel, Screen, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { AuditEntry } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const utc = (s: string) => new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');

function useCountdown(until: string | null | undefined): string | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  const ms = utc(until).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h} h ${m} min left` : `${m} min left`;
}

const SEES: [IconName, string, boolean][] = [
  ['account-outline', 'Names, login IDs, roles and classes (to manage accounts)', true],
  ['chart-box-outline', 'School totals: student count, attendance %, plan usage', true],
  ['phone-outline', 'Phone numbers & email — masked (98XXXXX210)', false],
  ['home-outline', 'Addresses & dates of birth — hidden', false],
];

type Filter = 'all' | 'admin' | 'people' | 'attendance' | 'marks' | 'classes' | 'notices' | 'fees' | 'settings';
const FILTERS: { label: string; value: Filter; icon: IconName }[] = [
  { label: 'All', value: 'all', icon: 'format-list-bulleted' },
  { label: 'People & sign-ins', value: 'people', icon: 'account-multiple-outline' },
  { label: 'Attendance', value: 'attendance', icon: 'clipboard-check-outline' },
  { label: 'Marks & exams', value: 'marks', icon: 'pencil-box-multiple-outline' },
  { label: 'Classes & timetable', value: 'classes', icon: 'google-classroom' },
  { label: 'Notices & calendar', value: 'notices', icon: 'bullhorn-outline' },
  { label: 'Fees & payroll', value: 'fees', icon: 'cash-multiple' },
  { label: 'Settings & data', value: 'settings', icon: 'cog-outline' },
  { label: 'Support access', value: 'admin', icon: 'shield-account-outline' },
];

/** Privacy controls + audit log (F25). */
export default function PrivacyScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { user, school, refreshSchool } = useAuth();
  const isPrincipal = user?.role === 'principal';
  const canWrite = school?.can_write !== false;
  const [filter, setFilter] = useState<Filter>('all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const id = setTimeout(() => setQ(typed.trim()), 350); return () => clearTimeout(id); }, [typed]);
  const params = { admin_only_: filter === 'admin' ? 'true' : undefined, group: filter !== 'all' && filter !== 'admin' ? filter : undefined, q: q || undefined, limit: '50' };
  const log = useLoad(() => api<AuditEntry[]>('/school/audit', { params }), [filter, q]);
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { setOlder([]); setMore(true); }, [filter, q, log.data]);
  const rows = [...(log.data ?? []), ...older];
  async function loadOlder() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const next = await api<AuditEntry[]>('/school/audit', { params: { ...params, before_id: String(last.id) } });
      setOlder((o) => [...o, ...next]);
      setMore(next.length === 50);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setLoadingMore(false);
    }
  }
  const [busy, setBusy] = useState(false);
  const left = useCountdown(school?.support_access_until);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      await refreshSchool();
      toast(msg);
      log.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!school) return <Screen header={<Hero title="Privacy & audit" compact />}><LoadingCards /></Screen>;
  const full = school.share_contact_with_admin || !!left;

  return (
    <Screen onRefresh={log.refresh} refreshing={log.refreshing}
      header={<Hero title="Privacy & audit" subtitle="Your school owns its data" compact />}>
      <FadeIn>
        <Panel title="What platform support can see" icon="shield-account-outline"
          right={<ToneChip text={full ? 'Full details' : 'Limited'} tone={full ? 'warning' : 'success'} />}>
          {SEES.map(([icon, text, always]) => (
            <View key={icon} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', marginBottom: space.sm }}>
              <Icon name={icon} size={20} color={always || full ? t.colors.primary : t.colors.outline} />
              <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onSurface }}>
                {!always && full ? text.replace(/ — .*/, ' — visible') : text}
              </Text>
            </View>
          ))}
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Every time support views or changes your school's data, it's recorded in the log below.</Text>
        </Panel>
      </FadeIn>

      {isPrincipal ? (
        <FadeIn index={1}>
          <Panel title="Sharing" icon="account-lock-outline">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Share contact details with support</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Always show phones and addresses to platform support</Text>
              </View>
              <Switch value={school.share_contact_with_admin} disabled={busy || !canWrite}
                onValueChange={(v) => { haptic.tap(); run(() => api('/school/settings', { method: 'PUT', body: { share_contact_with_admin: v } }),
                  v ? 'Contact details shared with support' : 'Contact details hidden from support'); }} />
            </View>
            <View style={{ height: 1, backgroundColor: t.colors.outlineVariant, marginBottom: space.md }} />
            <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Temporary support access</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
              {left ? `Support can see full details · ${left}` : 'Give support full access for 24 hours to solve a problem. It ends automatically.'}
            </Text>
            {left ? (
              <Button mode="outlined" icon="lock-outline" loading={busy} disabled={!canWrite}
                onPress={() => run(() => api('/school/support-access', { method: 'DELETE' }), 'Support access revoked')}>Revoke now</Button>
            ) : (
              <Button mode="contained-tonal" icon="lock-open-variant-outline" loading={busy} disabled={!canWrite}
                onPress={() => run(() => api('/school/support-access', { method: 'POST', params: { hours: 24 } }), 'Support access granted for 24 hours')}>
                Grant for 24 hours
              </Button>
            )}
          </Panel>
        </FadeIn>
      ) : null}

      <FadeIn index={2}>
        <Panel title="Activity log" icon="history">
          <Searchbar placeholder="Search person, student or change" value={typed} onChangeText={setTyped} style={{ marginBottom: space.md }} />
          <FilterChips value={filter} onChange={setFilter} options={FILTERS} />
          {log.error ? <ErrorState message={log.error} onRetry={log.reload} /> : null}
          {!log.data ? <LoadingCards count={2} /> : !rows.length ? (
            <EmptyState icon="history" title={filter === 'admin' ? 'Support hasn’t accessed your data' : q || filter !== 'all' ? 'Nothing matches' : 'No activity yet'} />
          ) : rows.map((a, i) => (
            <View key={a.id} style={{ flexDirection: 'row', gap: space.md, paddingVertical: 10,
              borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: t.colors.outlineVariant }}>
              <Icon name={a.actor_role === 'admin' ? 'shield-account' : a.action === 'login.failed' ? 'lock-alert-outline' : 'account-circle-outline'} size={22}
                color={a.actor_role === 'admin' || a.action === 'login.failed' ? t.custom.warning : t.colors.onSurfaceVariant} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: '500' }}>{a.action.replace(/[._]/g, ' ')}</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                  {`${a.actor_name}${a.actor_role ? ` (${a.actor_role.replace('_', ' ')})` : ''} · ${utc(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
                </Text>
                {a.detail ? <Text variant="bodySmall" style={{ color: t.colors.onSurface, marginTop: 2 }} numberOfLines={6}>{a.detail}</Text> : null}
              </View>
            </View>
          ))}
          {log.data && rows.length >= 50 && more ? (
            <Button mode="text" icon="chevron-down" onPress={loadOlder} loading={loadingMore} style={{ marginTop: space.sm }}>Show older</Button>
          ) : null}
        </Panel>
      </FadeIn>
    </Screen>
  );
}
