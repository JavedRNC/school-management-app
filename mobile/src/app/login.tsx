import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, HelperText, Text, TouchableRipple } from 'react-native-paper';
import { TextInput } from '@/components/Field';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeIn, Icon, IconName, PressScale } from '@/components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getBaseUrl, loadStored, setBaseUrl } from '@/lib/api';
import { homeFor, KEY_SCHOOL_CODE, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { cardEdge, glow, radius, shadow, space, useAppTheme } from '@/lib/theme';

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
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadStored().then(({ url }) => setServer(url));
    AsyncStorage.getItem(KEY_SCHOOL_CODE).then((c) => { if (c) setCode(c); }).catch(() => {});
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [float]);

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
      if (server.trim() !== getBaseUrl()) await setBaseUrl(server);
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <LinearGradient colors={[t.custom.heroStart, t.custom.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: insets.top + space.xl, paddingBottom: 84, alignItems: 'center', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.06)', top: -80, left: -80 }} />
          <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(245,166,35,0.18)', bottom: -40, right: -30 }} />
          <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
            <View style={{ width: 84, height: 84, borderRadius: 24, overflow: 'hidden', ...glow(t.custom.amber, true) }}>
              <Image source={require('../../assets/icon.png')} style={{ width: 84, height: 84 }} accessibilityLabel="Prangan logo" />
            </View>
          </Animated.View>
          <Text variant="headlineLarge" style={{ color: '#fff', fontWeight: '700', marginTop: space.md }}>Prangan</Text>
          <Text variant="titleSmall" style={{ color: t.custom.amber, marginTop: -2 }}>प्रांगण</Text>
          <Text variant="bodyMedium" style={{ color: 'rgba(255,255,255,0.82)' }}>Everything your school needs, in one place</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: space.lg, marginTop: -60 }}>
          <FadeIn>
            <Animated.View style={{ transform: [{ translateX: shake }], backgroundColor: t.colors.elevation.level1, borderRadius: radius.xxl, padding: space.lg + 4,
              ...shadow(t, 2), ...cardEdge(t) }}>
              <Text variant="titleLarge" style={{ fontWeight: '700', color: t.colors.onSurface }}>Welcome back 👋</Text>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.lg }}>Use the details your school gave you</Text>
              <TextInput mode="outlined" label="School code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPicked(null); }} autoCapitalize="characters"
                autoCorrect={false} left={<TextInput.Icon icon="domain" />} style={{ marginBottom: space.md }} />
              <TextInput mode="outlined" label="Login ID" value={email} onChangeText={(v) => { setEmail(v); setPicked(null); }} autoCapitalize="none"
                autoCorrect={false} left={<TextInput.Icon icon="account-outline" />} style={{ marginBottom: space.md }}
                placeholder="Employee code, admission no. or mobile" />
              <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                left={<TextInput.Icon icon="lock-outline" />} right={<TextInput.Icon icon={showPw ? 'eye-off' : 'eye'} onPress={() => setShowPw((s) => !s)} />}
                onSubmitEditing={() => submit()} />
              <HelperText type="error" visible={!!error}>{error}</HelperText>
              <View style={[{ borderRadius: radius.pill, backgroundColor: t.colors.primary }, t.dark ? null : glow(t.colors.primary)]}>
                <Button mode="contained" icon="arrow-right" onPress={() => submit()} loading={busy} contentStyle={{ paddingVertical: 6, flexDirection: 'row-reverse' }}
                  labelStyle={{ fontSize: 15, fontWeight: '700' }}>
                  Sign in
                </Button>
              </View>
            </Animated.View>
          </FadeIn>

          <FadeIn index={2}>
            <Text variant="titleSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.xl, marginBottom: space.sm, fontWeight: '700' }}>
              Explore with a demo account
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {DEMO.map((d) => {
                const key = `${d.code}/${d.id}`;
                const on = picked === key;
                return (
                  <PressScale key={key} style={{ width: '31.5%' }}
                    onPress={() => { setPicked(key); setCode(d.code); setEmail(d.id); setPassword(d.pw); submit(d.id, d.pw, d.code); }}>
                    <View style={{ backgroundColor: on ? t.colors.primaryContainer : t.colors.elevation.level2, borderRadius: radius.lg, padding: space.md,
                      alignItems: 'center', borderWidth: 1, borderColor: on ? t.colors.primary : t.custom.cardBorder, minHeight: 100 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={d.icon} size={22} color={t.colors.primary} />
                      </View>
                      <Text variant="labelLarge" style={{ fontWeight: '700', marginTop: 6, color: t.colors.onSurface, textAlign: 'center' }} numberOfLines={1}>{d.label}</Text>
                      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center' }} numberOfLines={2}>{d.desc}</Text>
                    </View>
                  </PressScale>
                );
              })}
            </View>
            <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.sm }}>
              Demo school code DEMO01 · password demo123
            </Text>
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
