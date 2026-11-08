import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { Button, Card, ErrorBox, Field, Screen, styles } from '@/components/ui';
import { getBaseUrl, loadStored, setBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

const DEMO = [
  { label: 'Principal', email: 'principal@school.com' },
  { label: 'Teacher', email: 'anita@school.com' },
  { label: 'Student', email: 'aarav@school.com' },
];

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStored().then(({ url }) => setServer(url));
  }, []);

  if (user) return <Redirect href={`/${user.role}`} />;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (server.trim() !== getBaseUrl()) await setBaseUrl(server);
      const u = await login(email.trim(), password);
      router.replace(`/${u.role}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: space.xl * 2, marginBottom: space.xl }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 34 }}>🏫</Text>
          </View>
          <Text style={[styles.h1, { marginTop: space.md }]}>School Hub</Text>
          <Text style={styles.muted}>Sign in to continue</Text>
        </View>

        <Card>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@school.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••" onSubmitEditing={submit} />
          {error ? <ErrorBox message={error} /> : null}
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
        </Card>

        <Card title="Try a demo account" right={<Text style={[styles.muted, { fontSize: 12 }]}>password demo123</Text>}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {DEMO.map((d) => (
              <Button key={d.label} title={d.label} variant="secondary" small style={{ flex: 1 }}
                onPress={() => { setEmail(d.email); setPassword('demo123'); }} />
            ))}
          </View>
        </Card>

        <Pressable onPress={() => setShowServer((s) => !s)}>
          <Text style={[styles.muted, { textAlign: 'center', fontSize: 13 }]}>
            Server settings {showServer ? '▲' : '▼'}
          </Text>
        </Pressable>
        {showServer ? (
          <Card style={{ marginTop: space.md }}>
            <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
              placeholder="https://school-api.onrender.com" />
            <Text style={[styles.muted, { fontSize: 12 }]}>Saved when you sign in.</Text>
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
