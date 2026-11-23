import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateGate } from '@/components/UpdateGate';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/feedback';
import { useSchemeTheme } from '@/lib/theme';

/** Phones get the fonts bundled at build time (app.json → expo-font). The web preview loads them here. */
const WEB_FONTS = Platform.OS === 'web' ? [
  { fontFamily: 'Mukta', fontDefinitions: [
    { path: require('../../assets/fonts/Mukta_400Regular.ttf'), weight: 400 },
    { path: require('../../assets/fonts/Mukta_500Medium.ttf'), weight: 500 },
    { path: require('../../assets/fonts/Mukta_600SemiBold.ttf'), weight: 600 },
    { path: require('../../assets/fonts/Mukta_700Bold.ttf'), weight: 700 },
    { path: require('../../assets/fonts/Mukta_800ExtraBold.ttf'), weight: 800 },
  ] },
  { fontFamily: 'Bricolage Grotesque', fontDefinitions: [
    { path: require('../../assets/fonts/BricolageGrotesque_600SemiBold.ttf'), weight: 600 },
    { path: require('../../assets/fonts/BricolageGrotesque_700Bold.ttf'), weight: 700 },
    { path: require('../../assets/fonts/BricolageGrotesque_800ExtraBold.ttf'), weight: 800 },
  ] },
] : {};

export default function RootLayout() {
  useFonts(WEB_FONTS);
  const theme = useSchemeTheme();
  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: theme.colors.primary, background: theme.colors.background, card: theme.colors.surface, text: theme.colors.onSurface, border: theme.colors.outlineVariant },
  };
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme} settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
        <ThemeProvider value={navTheme}>
          <ToastProvider>
            <AuthProvider>
              <StatusBar style={theme.dark ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
              <UpdateGate />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
