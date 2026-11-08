import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, HelperText, Text, TextInput, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeIn, Icon, IconName, PressScale } from '@/components/ui';
import { getBaseUrl, loadStored, setBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';

const DEMO: { label: string; email: string; icon: IconName; desc: string }[] = [
  { label: 'Principal', email: 'principal@school.com', icon: 'school', desc: 'Insights & admin' },
  { label: 'Teacher', email: 'anita@school.com', icon: 'human-male-board', desc: 'Attendance & marks' },
  { label: 'Student', email: 'aarav@school.com', icon: 'account-school', desc: 'Results & homework' },
];

export default function Login() {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadStored().then(({ url }) => setServer(url));
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [float]);

  if (user) return <Redirect href={`/${user.role}`} />;

  const doShake = () => {
    haptic.error();
    Animated.sequence([10, -10, 7, -7, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start();
  };

  async function submit(e = email, p = password) {
    setError(null);
    if (!e || !p) return doShake();
    setBusy(true);
    try {
      if (server.trim() !== getBaseUrl()) await setBaseUrl(server);
      const u = await login(e.trim(), p);
      haptic.success();
      router.replace(`/${u.role}`);
    } catch (err) {
      setError((err as Error).message);
      doShake();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <LinearGradient colors={[t.custom.heroStart, t.custom.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + space.xxl, paddingBottom: 90, alignItems: 'center', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.06)', top: -80, left: -80 }} />
          <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(245,166,35,0.18)', bottom: -40, right: -30 }} />
          <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
            <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: t.custom.amber, alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
              <Icon name="school" size={46} color="#1A1300" />
            </View>
          </Animated.View>
          <Text variant="headlineLarge" style={{ color: '#fff', fontWeight: '800', marginTop: space.lg }}>School Hub</Text>
          <Text variant="bodyLarge" style={{ color: 'rgba(255,255,255,0.8)' }}>Everything your school needs, in one place</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: space.lg, marginTop: -60 }}>
          <FadeIn>
            <Animated.View style={{ transform: [{ translateX: shake }], backgroundColor: t.colors.elevation.level1, borderRadius: radius.xxl, padding: space.xl,
              shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
              <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }}>Welcome back 👋</Text>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.lg }}>Sign in with your school account</Text>
              <TextInput mode="outlined" label="Email" value={email} onChangeText={(v) => { setEmail(v); setPicked(null); }} autoCapitalize="none"
                keyboardType="email-address" left={<TextInput.Icon icon="email-outline" />} style={{ marginBottom: space.md }} />
              <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                left={<TextInput.Icon icon="lock-outline" />} right={<TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw((s) => !s)} />}
                onSubmitEditing={() => submit()} />
              <HelperText type="error" visible={!!error}>{error}</HelperText>
              <Button mode="contained" onPress={() => submit()} loading={busy} contentStyle={{ paddingVertical: 8 }} labelStyle={{ fontSize: 16, fontWeight: '700' }}>
                Sign in
              </Button>
            </Animated.View>
          </FadeIn>

          <FadeIn index={2}>
            <Text variant="titleSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.xl, marginBottom: space.sm, fontWeight: '700' }}>
              Explore with a demo account
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {DEMO.map((d) => {
                const on = picked === d.email;
                return (
                  <PressScale key={d.email} style={{ flex: 1 }} onPress={() => { setPicked(d.email); setEmail(d.email); setPassword('demo123'); submit(d.email, 'demo123'); }}>
                    <View style={{ backgroundColor: on ? t.colors.primaryContainer : t.colors.elevation.level2, borderRadius: radius.xl, padding: space.md,
                      alignItems: 'center', borderWidth: 1, borderColor: on ? t.colors.primary : 'transparent' }}>
                      <Icon name={d.icon} size={30} color={t.colors.primary} />
                      <Text variant="labelLarge" style={{ fontWeight: '800', marginTop: 6, color: t.colors.onSurface }}>{d.label}</Text>
                      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center' }}>{d.desc}</Text>
                    </View>
                  </PressScale>
                );
              })}
            </View>
          </FadeIn>

          <TouchableRipple onPress={() => { haptic.tap(); setShowServer((s) => !s); }} style={{ marginTop: space.xl, alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="server-network" size={16} color={t.colors.onSurfaceVariant} />
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Server settings</Text>
              <Icon name={showServer ? 'chevron-up' : 'chevron-down'} size={16} color={t.colors.onSurfaceVariant} />
            </View>
          </TouchableRipple>
          {showServer ? (
            <FadeIn>
              <TextInput mode="outlined" label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
                placeholder="https://school-api.onrender.com" left={<TextInput.Icon icon="link-variant" />} />
              <HelperText type="info">Saved when you sign in</HelperText>
            </FadeIn>
          ) : null}
          <View style={{ height: insets.bottom + space.xl }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
