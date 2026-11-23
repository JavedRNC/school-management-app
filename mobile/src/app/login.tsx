import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeIn, Icon, IconName } from '@/components/ui';
import { APP_NAME_LABEL, IS_DEV_APP } from '@/components/UpdateGate';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, cleanUrl, getBaseUrl, keepServer, loadStored, revertServer, serverOnTrial, tryServer } from '@/lib/api';
import { homeFor, KEY_SCHOOL_CODE, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';

const DEMO: { label: string; code: string; id: string; pw: string; icon: IconName; desc: string }[] = [
  { label: 'Principal', code: 'DEMO01', id: 'principal', pw: 'demo123', icon: 'school', desc: 'Insights & admin' },
  { label: 'Teacher', code: 'DEMO01', id: 'T001', pw: 'demo123', icon: 'human-male-board', desc: 'Attendance & marks' },
  { label: 'Student', code: 'DEMO01', id: '2026001', pw: 'demo123', icon: 'account-school', desc: 'Results & homework' },
  { label: 'Parent', code: 'DEMO01', id: '9876500001', pw: 'demo123', icon: 'human-male-female-child', desc: 'Two children' },
  { label: 'Vice Principal', code: 'DEMO01', id: 'vp', pw: 'demo123', icon: 'account-tie', desc: 'Limited admin' },
  { label: 'Admin', code: 'ADMIN', id: 'admin', pw: 'admin123', icon: 'shield-crown', desc: 'All schools' },
];

export default function Login() {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, login } = useAuth();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');   // login ID
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(serverOnTrial());   // hidden: tap the logo 7 times (Admin only)
  const taps = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadStored().then(({ url }) => setServer(url));
    AsyncStorage.getItem(KEY_SCHOOL_CODE).then((c) => { if (c) setCode((cur) => cur || c); }).catch(() => {});
    return () => { if (serverOnTrial()) revertServer(); };   // left without an Admin sign-in
  }, []);

  if (user) return <Redirect href={homeFor(user) as '/'} />;

  const doShake = () => {
    haptic.error();
    Animated.sequence([10, -10, 7, -7, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start();
  };

  async function submit(e = email, p = password, c = code) {
    setError(null);
    if (!c || !e || !p) return doShake();
    setBusy(true);
    try {
      if (showServer && cleanUrl(server) !== cleanUrl(getBaseUrl())) tryServer(server);
      if (serverOnTrial()) {
        // A new server sticks only when the platform Admin signs in on it.
        let role: string | null = null;
        try {
          role = (await api<{ user: { role: string } }>('/auth/login', { body: { school_code: c.trim(), login_id: e.trim(), password: p } })).user.role;
        } catch (err) {
          revertServer();
          setServer(getBaseUrl());
          throw err;
        }
        if (role !== 'admin') {
          revertServer();
          setServer(getBaseUrl());
          setShowServer(false);
          throw new Error('Only the Prangan admin can change the server. This phone is back on the normal server — sign in again.');
        }
        await keepServer();
      }
      const u = await login(c, e, p);
      haptic.success();
      router.replace(homeFor(u) as '/');
    } catch (err) {
      setError((err as Error).message);
      doShake();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48, paddingHorizontal: space.xl - 2, paddingBottom: insets.bottom + space.lg }}>
        <FadeIn>
          <Pressable accessible={false} onPress={() => { taps.current += 1; if (taps.current >= 7) { taps.current = 0; haptic.tap(); setShowServer((v) => !v); } }}
            style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden', alignSelf: 'flex-start' }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64 }} accessibilityLabel="Prangan logo" />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, marginTop: space.lg }}>
            <Text variant="displayMedium" style={{ color: t.colors.onBackground }}>Prangan</Text>
            <Text variant="titleLarge" style={{ color: t.colors.primary, fontSize: 24, lineHeight: 34, fontWeight: '600' }}>प्रांगण</Text>
          </View>
          {IS_DEV_APP ? (
            <View style={{ alignSelf: 'flex-start', backgroundColor: t.custom.amber, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 2, marginTop: 6 }}>
              <Text variant="labelMedium" style={{ color: t.custom.onAmber, fontWeight: '700' }}>Test app · demo data only</Text>
            </View>
          ) : null}
          <Text variant="bodyLarge" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm, fontSize: 17, lineHeight: 25 }}>
            Sign in with the details your school gave you.
          </Text>
        </FadeIn>

        <FadeIn index={1}>
          <Animated.View style={{ transform: [{ translateX: shake }], marginTop: space.xl + 4, gap: space.md }}>
            <TextInput mode="outlined" label="School code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPicked(null); }} autoCapitalize="characters"
              autoCorrect={false} outlineStyle={{ borderRadius: 14, borderWidth: 1.5 }} contentStyle={{ letterSpacing: 1 }} />
            <TextInput mode="outlined" label="Login ID" value={email} onChangeText={(v) => { setEmail(v); setPicked(null); }} autoCapitalize="none"
              autoCorrect={false} outlineStyle={{ borderRadius: 14, borderWidth: 1.5 }} placeholder="Employee code, admission no. or mobile" />
            <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPw}
              outlineStyle={{ borderRadius: 14, borderWidth: 1.5 }}
              right={<TextInput.Icon icon={showPw ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowPw((s) => !s)}
                accessibilityLabel={showPw ? 'Hide password' : 'Show password'} />}
              onSubmitEditing={() => submit()} />
          </Animated.View>
          <HelperText type="error" visible={!!error} style={{ paddingHorizontal: 0 }}>{error}</HelperText>
          <Button mode="contained" onPress={() => submit()} loading={busy} disabled={busy}
            style={{ borderRadius: 16 }} contentStyle={{ height: 56 }} labelStyle={{ fontSize: 17, lineHeight: 24, fontWeight: '700' }}>
            Sign in
          </Button>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center', marginTop: space.md }}>
            Forgot your password? Ask your school office to reset it.
          </Text>
        </FadeIn>

        <FadeIn index={2}>
          <Text variant="titleSmall" style={{ color: t.colors.onSurface, marginTop: space.xl + 8, marginBottom: space.sm }}>Try a demo account</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {DEMO.map((d) => {
              const key = `${d.code}/${d.id}`;
              const on = picked === key;
              return (
                <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Demo: ${d.label}, ${d.desc}`}
                  onPress={() => { haptic.tap(); setPicked(key); setCode(d.code); setEmail(d.id); setPassword(d.pw); submit(d.id, d.pw, d.code); }}
                  android_ripple={{ color: t.colors.primaryContainer }}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, overflow: 'hidden',
                    borderWidth: 1.5, borderColor: on ? t.colors.primary : t.colors.outlineVariant,
                    backgroundColor: on ? t.colors.primaryContainer : t.colors.elevation.level1 }}>
                  <Icon name={d.icon} size={18} color={t.colors.primary} />
                  <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
            Demo school code DEMO01 · password demo123
          </Text>
        </FadeIn>

        {showServer ? (
          <FadeIn style={{ marginTop: space.xl }}>
            <TextInput mode="outlined" label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
              placeholder="https://school-api.onrender.com" left={<TextInput.Icon icon="link-variant" />} />
            <HelperText type="info">For the Prangan admin only. Kept after an admin sign-in.</HelperText>
          </FadeIn>
        ) : null}

        <View style={{ flexGrow: 1, minHeight: space.xl }} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>New to Prangan?</Text>
          <Pressable accessibilityRole="link" onPress={() => { haptic.tap(); router.push('/register-school' as never); }}
            hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md }}>
            <Text variant="titleMedium" style={{ color: t.colors.primary, fontWeight: '700' }}>Register your school</Text>
          </Pressable>
          <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.sm }}>{APP_NAME_LABEL}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
