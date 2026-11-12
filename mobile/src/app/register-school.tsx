import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Share, View } from 'react-native';
import { Button, Checkbox, HelperText, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { FadeIn, Hero, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';

const BLANK = { school_name: '', reg_no: '', board: '', address: '', city: '', district: '', state: '', pin: '', contact_name: '', designation: '',
  mobile: '', email: '', principal_name: '', students: '', teachers: '', message: '' };
type Form = typeof BLANK;

function problems(f: Form, ok1: boolean, ok2: boolean): Partial<Record<keyof Form | 'consent', string>> {
  const e: Partial<Record<keyof Form | 'consent', string>> = {};
  if (f.school_name.trim().length < 3) e.school_name = 'Enter the school name';
  if (f.address.trim().length < 5) e.address = 'Enter the school address';
  if (f.city.trim().length < 2) e.city = 'Enter the city or town';
  if (f.district.trim().length < 2) e.district = 'Enter the district';
  if (f.state.trim().length < 2) e.state = 'Enter the state';
  if (!/^[1-9]\d{5}$/.test(f.pin)) e.pin = 'Enter the 6-digit PIN code';
  if (f.contact_name.trim().length < 2) e.contact_name = 'Enter your name';
  if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))) e.mobile = 'Enter a 10-digit mobile number';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (!ok1 || !ok2) e.consent = 'Please tick both boxes to send the request';
  return e;
}

/** Public (no login): a school asks to join Prangan. Same endpoint and rules as the website form. */
export default function RegisterSchool() {
  const t = useAppTheme();
  const toast = useToast();
  const [f, setF] = useState<Form>(BLANK);
  const [privacy, setPrivacy] = useState(false);
  const [contact, setContact] = useState(false);
  const [errs, setErrs] = useState<ReturnType<typeof problems>>({});
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const up = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function send() {
    const e = problems(f, privacy, contact);
    setErrs(e);
    if (Object.keys(e).length) {
      haptic.error();
      return toast('Some details are missing — they are marked in red', { error: true });
    }
    setBusy(true);
    try {
      const res = await api<{ reference: string }>('/public/onboarding', {
        body: { ...f, students: f.students ? Number(f.students) : null, teachers: f.teachers ? Number(f.teachers) : null,
          consent_privacy: privacy, consent_contact: contact, source: 'app' },
      });
      haptic.success();
      setRef(res.reference);
    } catch (err) {
      haptic.error();
      toast((err as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof Form, label: string, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ marginBottom: errs[k] ? 0 : space.md }}>
      <TextInput mode="outlined" label={label} value={f[k]} onChangeText={up(k)} error={!!errs[k]} {...extra} />
      {errs[k] ? <HelperText type="error" visible>{errs[k]}</HelperText> : null}
    </View>
  );

  if (ref) {
    return (
      <Screen header={<Hero title="Request received" subtitle="The Prangan team will contact you" compact />}>
        <FadeIn>
          <Panel>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Your reference number</Text>
            <Text variant="headlineMedium" selectable style={{ fontWeight: '700', color: t.colors.primary, marginVertical: space.sm }}>{ref}</Text>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.lg }}>
              Keep it safe. We will call {f.contact_name} on {f.mobile} after reviewing the request.
            </Text>
            <Button mode="contained-tonal" icon="share-variant" onPress={() => Share.share({ message: `Prangan school registration reference: ${ref}` })} style={{ marginBottom: space.sm }}>Share reference</Button>
            <Button mode="contained" onPress={() => router.replace('/login')}>Back to sign in</Button>
          </Panel>
        </FadeIn>
      </Screen>
    );
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Hero title="Register your school" subtitle="Tell us about your school. We'll call you back." compact />}>
        <FadeIn>
          <Panel title="School" icon="domain">
            {field('school_name', 'School name', { maxLength: 160 })}
            {field('reg_no', 'Registration / affiliation / UDISE no. (if any)', { maxLength: 60, autoCapitalize: 'characters' })}
            {field('board', 'Board (optional)', { maxLength: 40 })}
            {field('address', 'Address', { maxLength: 500, multiline: true })}
            {field('city', 'City / town', { maxLength: 80 })}
            {field('district', 'District', { maxLength: 60 })}
            {field('state', 'State', { maxLength: 60 })}
            {field('pin', 'PIN code', { keyboardType: 'number-pad', maxLength: 6 })}
          </Panel>
        </FadeIn>
        <FadeIn index={1}>
          <Panel title="Contact" icon="account-outline">
            {field('contact_name', 'Your name', { maxLength: 120 })}
            {field('designation', 'Your role at the school (optional)', { maxLength: 60 })}
            {field('mobile', 'Mobile number', { keyboardType: 'phone-pad', maxLength: 16 })}
            {field('email', 'Email', { keyboardType: 'email-address', autoCapitalize: 'none', maxLength: 160 })}
            {field('principal_name', "Principal's name (optional)", { maxLength: 120 })}
          </Panel>
        </FadeIn>
        <FadeIn index={2}>
          <Panel title="A little more" subtitle="Optional" icon="information-outline">
            {field('students', 'About how many students', { keyboardType: 'number-pad', maxLength: 6 })}
            {field('teachers', 'About how many teachers', { keyboardType: 'number-pad', maxLength: 5 })}
            {field('message', 'Anything we should know', { maxLength: 1000, multiline: true })}
          </Panel>
        </FadeIn>
        <FadeIn index={3}>
          <Panel>
            <Checkbox.Item mode="android" position="leading" status={privacy ? 'checked' : 'unchecked'} onPress={() => setPrivacy((v) => !v)} labelVariant="bodyMedium"
              labelStyle={{ textAlign: 'left' }} label="I agree that Prangan may store these details to process this request, as described in its privacy policy." />
            <Checkbox.Item mode="android" position="leading" status={contact ? 'checked' : 'unchecked'} onPress={() => setContact((v) => !v)} labelVariant="bodyMedium"
              labelStyle={{ textAlign: 'left' }} label="The Prangan team may contact me by phone, WhatsApp or email about this request." />
            {errs.consent ? <HelperText type="error" visible>{errs.consent}</HelperText> : null}
            <Button mode="contained" icon="send" onPress={send} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }} style={{ marginTop: space.sm }}>Send request</Button>
            <Button onPress={() => router.back()} style={{ marginTop: space.xs }}>Cancel</Button>
          </Panel>
        </FadeIn>
      </Screen>
    </KeyboardAvoidingView>
  );
}
