import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from 'react-native-paper';

import { printReceipt, saveReceipt, shareReceipt } from '@/components/fees/receiptHtml';
import { ReceiptCard } from '@/components/fees/ReceiptCard';
import { ErrorState, FadeIn, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useToast } from '@/lib/feedback';
import { space } from '@/lib/theme';
import type { FeeReceipt } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<FeeReceipt>(`/fees/receipts/${id}`), [id]);
  const [busy, setBusy] = useState<'share' | 'print' | 'save' | null>(null);

  async function run(kind: 'share' | 'print' | 'save') {
    if (!data) return;
    setBusy(kind);
    try {
      if (kind === 'save') {
        const saved = await saveReceipt(data);
        toast(saved?.folder ? `Receipt saved in ${saved.folder}` : 'Receipt PDF ready');
        return;
      }
      if (kind === 'share') await shareReceipt(data);
      else await printReceipt(data);
      toast(kind === 'share' ? 'Receipt PDF ready to share' : 'Sent to printer');
    } catch (e) {
      toast((e as Error).message || 'Could not create the PDF', { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Receipt" subtitle={data?.receipt_no} compact />}>
      {loading && !data ? <LoadingCards count={2} /> : null}
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <FadeIn><ReceiptCard r={data} /></FadeIn>
          <FadeIn index={1}>
            <Button mode="contained" icon="download" style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }}
              loading={busy === 'save'} disabled={!!busy} onPress={() => run('save')}>Save PDF on phone</Button>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button mode="contained-tonal" icon="share-variant" style={{ flex: 1 }} contentStyle={{ paddingVertical: 6 }}
                loading={busy === 'share'} disabled={!!busy} onPress={() => run('share')}>Share PDF</Button>
              <Button mode="contained-tonal" icon="printer-outline" style={{ flex: 1 }} contentStyle={{ paddingVertical: 6 }}
                loading={busy === 'print'} disabled={!!busy} onPress={() => run('print')}>Print</Button>
            </View>
          </FadeIn>
        </>
      ) : null}
    </Screen>
  );
}
