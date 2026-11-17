import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { NotInPlan, SlipStatus } from '@/components/payroll/parts';
import { EmptyState, ErrorState, FadeIn, Hero, LoadingCards, Panel, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useModule } from '@/lib/auth';
import { inr } from '@/lib/fees';
import type { Payslip, SlipSchool } from '@/lib/payroll';
import { useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

/** A staff member's own payslips, newest first. Only locked months are shown. */
export default function MyPayslips() {
  const enabled = useModule('payroll');
  if (!enabled) return <NotInPlan title="My payslips" />;
  return <List />;
}

function List() {
  const t = useAppTheme();
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<{ school: SlipSchool; payslips: Payslip[] }>('/payroll/me'), []);
  const latest = data?.payslips[0];
  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="My payslips" subtitle={latest ? `Latest: ${latest.month_label}` : 'Your salary, month by month'} compact />}>
      {loading && !data ? <LoadingCards count={2} /> : null}
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && !data.payslips.length ? <EmptyState icon="cash-clock" title="No payslips yet" text="Your payslip appears here when the principal locks the month's payroll." /> : null}
      {data?.payslips.length ? (
        <FadeIn>
          <Panel style={{ paddingVertical: 0 }}>
            {data.payslips.map((p, i) => (
              <Row key={p.id} title={p.month_label} subtitle={`Net pay ${inr(p.net)}`} divider={i < data.payslips.length - 1}
                onPress={() => router.push(`/more/payroll/slip/${p.id}` as never)}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}><SlipStatus p={p} /><Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{p.slip_no ?? ''}</Text></View>} />
            ))}
          </Panel>
        </FadeIn>
      ) : null}
    </Screen>
  );
}
