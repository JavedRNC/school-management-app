import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, IconName, LoadingCards, Panel, Row, Screen, ToneChip } from '@/components/ui';
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

/** Privacy controls + audit log (F25). */
export default function PrivacyScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { user, school, refreshSchool } = useAuth();
  const isPrincipal = user?.role === 'principal';
  const canWrite = school?.can_write !== false;
  const [filter, setFilter] = useState<'all' | 'admin'>('all');
  const log = useLoad(() => api<AuditEntry[]>('/school/audit', { params: { admin_only_: filter === 'admin' ? 'true' : undefined } }), [filter]);
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
          <FilterChips value={filter} onChange={setFilter} options={[
            { label: 'All activity', value: 'all', icon: 'format-list-bulleted' },
            { label: 'Support access only', value: 'admin', icon: 'shield-account-outline' },
          ]} />
          {log.error ? <ErrorState message={log.error} onRetry={log.reload} /> : null}
          {!log.data ? <LoadingCards count={2} /> : !log.data.length ? (
            <EmptyState icon="history" title={filter === 'admin' ? 'Support hasn’t accessed your data' : 'No activity yet'} />
          ) : log.data.map((a, i) => (
            <Row key={a.id} divider={i < log.data!.length - 1}
              title={a.action.replace(/[._]/g, ' ')}
              subtitle={`${a.actor_name}${a.actor_role ? ` (${a.actor_role.replace('_', ' ')})` : ''} · ${utc(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${a.detail ? `\n${a.detail}` : ''}`}
              left={<Icon name={a.actor_role === 'admin' ? 'shield-account' : 'account-circle-outline'} size={22}
                color={a.actor_role === 'admin' ? t.custom.warning : t.colors.onSurfaceVariant} />} />
          ))}
        </Panel>
      </FadeIn>
    </Screen>
  );
}
