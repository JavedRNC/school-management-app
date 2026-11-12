import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { ErrorState, FadeIn, Hero, LoadingCards, Panel, Row, Screen, ToneChip, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { REQ_STATUS_LABEL, REQ_STATUS_TONE, type RequestDetail, when } from '@/lib/onboarding';
import { space, useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Action = { status: string; label: string; needs?: string; danger?: boolean };
const ACTIONS: Record<string, Action> = {
  UNDER_REVIEW: { status: 'UNDER_REVIEW', label: 'Mark under review' },
  ADDITIONAL_INFORMATION_REQUIRED: { status: 'ADDITIONAL_INFORMATION_REQUIRED', label: 'Ask for more information', needs: 'What do you need? (the school sees this)' },
  APPROVED: { status: 'APPROVED', label: 'Approve' },
  REJECTED: { status: 'REJECTED', label: 'Reject', needs: 'Reason (the school sees this)', danger: true },
};

export default function AdminRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useAppTheme();
  const toast = useToast();
  const { data: r, error, loading, reload, refresh, refreshing, setData } = useLoad(() => api<RequestDetail>(`/admin/onboarding/${id}`), [id]);
  const [act, setAct] = useState<Action | null>(null);
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const [code, setCode] = useState('');
  const [cred, setCred] = useState<{ school_code: string; login_id: string; password: string } | null>(null);

  async function run(fn: () => Promise<RequestDetail>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      setData(await fn());
      haptic.success();
      toast(ok);
      return true;
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    try {
      const res = await api<{ request: RequestDetail; credentials: { school_code: string; login_id: string; password: string } }>(
        `/admin/onboarding/${id}/onboard`, { body: { code: code.trim() } });
      setData(res.request);
      setCred(res.credentials);
      setOnboard(false);
      haptic.success();
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  const line = (label: string, value?: string | number | null) => (value !== null && value !== undefined && value !== '' ? (
    <View style={{ marginBottom: space.sm }}>
      <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="bodyLarge" selectable>{String(value)}</Text>
    </View>
  ) : null);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title={r?.school_name ?? 'Request'} subtitle={r ? `${r.reference} · ${when(r.created_at)}` : undefined} compact />}>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !r ? <LoadingCards /> : null}
      {r ? (
        <>
          <FadeIn>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md, flexWrap: 'wrap' }}>
              <ToneChip text={REQ_STATUS_LABEL[r.status] ?? r.status} tone={REQ_STATUS_TONE[r.status] ?? 'neutral'} compact={false} />
              <ToneChip text={r.source === 'app' ? 'From the app' : 'From the website'} tone="neutral" compact={false} />
            </View>
          </FadeIn>
          {cred ? (
            <Panel title="School created" subtitle="Give these to the principal. Shown only now." icon="key-variant" tone="success">
              <Text variant="titleMedium" selectable style={{ fontWeight: '700' }}>School code: {cred.school_code}</Text>
              <Text variant="titleMedium" selectable style={{ fontWeight: '700' }}>Login ID: {cred.login_id}</Text>
              <Text variant="titleMedium" selectable style={{ fontWeight: '700', marginBottom: space.md }}>Temporary password: {cred.password}</Text>
              <Button mode="contained" icon="share-variant" onPress={() => Share.share({ message: `Prangan sign-in\nSchool code: ${cred.school_code}\nLogin ID: ${cred.login_id}\nTemporary password: ${cred.password}\nYou will be asked to set your own password.` })}>Share with the principal</Button>
              <Button onPress={() => setCred(null)} style={{ marginTop: space.xs }}>I've noted it — hide</Button>
            </Panel>
          ) : null}
          {r.possible_duplicate ? (
            <Panel tone="warning" icon="alert-outline" title="Looks like an existing school"
              subtitle={`${r.possible_duplicate.name} (${r.possible_duplicate.code}) is already on Prangan. A second one won't be created.`} />
          ) : null}

          <Panel title="Next step" icon="arrow-decision-outline">
            {r.status === 'ONBOARDED' && r.school ? <Text variant="bodyMedium">On Prangan as {r.school.name} ({r.school.code}).</Text> : null}
            {r.status === 'APPROVED' ? (
              <Button mode="contained" icon="domain-plus" disabled={!r.can_onboard || busy} onPress={() => { setCode(''); setOnboard(true); }} style={{ marginBottom: space.sm }}>Create the school</Button>
            ) : null}
            {r.allowed_next.filter((s) => ACTIONS[s]).map((s) => (
              <Button key={s} mode={s === 'APPROVED' ? 'contained' : 'contained-tonal'} disabled={busy} style={{ marginBottom: space.sm }}
                textColor={ACTIONS[s].danger ? t.colors.error : undefined} onPress={() => { setRemarks(''); setAct(ACTIONS[s]); }}>{ACTIONS[s].label}</Button>
            ))}
            <Button icon="phone" onPress={() => Linking.openURL(`tel:${r.mobile}`)}>Call {r.contact_name}</Button>
          </Panel>

          <Panel title="School" icon="domain">
            {line('Registration no.', r.reg_no)}{line('Board', r.board)}{line('Category', r.category)}
            {line('Address', `${r.address}, ${r.city}, ${r.district}, ${r.state} ${r.pin}`)}
            {line('Students / teachers', `${r.students ?? '—'} / ${r.teachers ?? '—'}`)}{line('Current software', r.current_software)}{line('Message', r.message)}
          </Panel>
          <Panel title="Contact" icon="account-outline">
            {line('Contact person', `${r.contact_name}${r.designation ? `, ${r.designation}` : ''}`)}{line('Principal', r.principal_name)}
            {line('Mobile', r.mobile)}{line('Alternate', r.alt_phone)}{line('Email', r.email)}{line('Prefers', r.contact_method)}
          </Panel>
          <Panel title="History" icon="history" style={{ paddingBottom: space.md }}>
            <View style={{ marginHorizontal: -space.lg }}>
              {r.events.map((e, i) => (
                <Row key={e.id} divider={i < r.events.length - 1}
                  title={e.kind === 'status' ? `${e.from_status ? `${REQ_STATUS_LABEL[e.from_status]} → ` : ''}${REQ_STATUS_LABEL[e.to_status] ?? e.to_status}` : e.kind === 'note' ? 'Internal note' : e.kind === 'created' ? 'Request received' : 'Assignment'}
                  subtitle={`${e.remarks ? `${e.remarks}\n` : ''}${e.actor_name} · ${when(e.at)}`} />
              ))}
            </View>
            <TextInput mode="outlined" label="Add an internal note" value={note} onChangeText={setNote} multiline maxLength={1000} style={{ marginTop: space.md }} />
            <Button mode="contained-tonal" disabled={!note.trim() || busy} style={{ marginTop: space.sm }}
              onPress={async () => { if (await run(() => api<RequestDetail>(`/admin/onboarding/${id}/notes`, { body: { note } }), 'Note added')) setNote(''); }}>Add note</Button>
          </Panel>
          <Button onPress={() => router.back()}>Back</Button>
        </>
      ) : null}

      <TopLayer visible={!!act} onDismiss={() => setAct(null)}>
        <Dialog visible={!!act} onDismiss={() => setAct(null)}>
          <Dialog.Title>{act?.label}</Dialog.Title>
          <Dialog.Content>
            <TextInput mode="outlined" label={act?.needs ?? 'Remarks (optional)'} value={remarks} onChangeText={setRemarks} multiline maxLength={1000} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAct(null)}>Cancel</Button>
            <Button loading={busy} disabled={busy || (!!act?.needs && remarks.trim().length < 5)}
              onPress={async () => { if (act && await run(() => api<RequestDetail>(`/admin/onboarding/${id}/status`, { body: { status: act.status, remarks } }), 'Updated')) setAct(null); }}>{act?.label}</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
      <TopLayer visible={onboard} onDismiss={() => setOnboard(false)}>
        <Dialog visible={onboard} onDismiss={() => setOnboard(false)}>
          <Dialog.Title>Create the school</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: space.md }}>Creates {r?.school_name} with a 30-day trial and a principal login.</Text>
            <TextInput mode="outlined" label="School code (3–20 letters, digits, hyphen)" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOnboard(false)}>Cancel</Button>
            <Button loading={busy} disabled={busy || !/^[A-Za-z0-9-]{3,20}$/.test(code.trim())} onPress={create}>Create school</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
