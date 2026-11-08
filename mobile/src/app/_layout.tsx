import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/feedback';
import { useSchemeTheme } from '@/lib/theme';

export default function RootLayout() {
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
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
