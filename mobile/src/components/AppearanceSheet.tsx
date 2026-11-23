import { Pressable, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { space, THEME_KINDS, ThemeKind, themeFor, useAppTheme, useThemePref } from '@/lib/theme';

import { Icon, Sheet } from './ui';

/** A tiny picture of a theme drawn in its own colours and fonts: page, a card, a present and an absent pill. */
function Preview({ kind }: { kind: ThemeKind }) {
  const phoneDark = useColorScheme() === 'dark';
  const p = themeFor(kind, phoneDark);
  return (
    <View style={{ width: 96, height: 84, borderRadius: 14, backgroundColor: p.colors.background, padding: 8, gap: 6,
      borderWidth: 1, borderColor: p.custom.cardBorder, overflow: 'hidden' }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={{ fontFamily: p.custom.fontDisplay, fontWeight: '700', fontSize: 15, lineHeight: 19, color: p.colors.onBackground }}>Aa</Text>
      <View style={{ flex: 1, borderRadius: Math.min(p.shape.card, 10), backgroundColor: p.custom.feature, padding: 6, justifyContent: 'flex-end', gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <View style={{ flex: 1, height: 9, borderRadius: 5, backgroundColor: p.custom.present === p.custom.feature ? p.custom.amber : p.custom.present }} />
          <View style={{ width: 18, height: 9, borderRadius: 5, backgroundColor: p.custom.danger }} />
        </View>
      </View>
    </View>
  );
}

/** Me → Appearance: pick Chalk, Register or Marigold Night. Saved on this phone; the app redraws at once. */
export function AppearanceSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const t = useAppTheme();
  const { kind, setKind } = useThemePref();
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Appearance">
      <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
        Choose how Prangan looks on this phone. Everything stays in the same place — only the look changes.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ gap: space.sm }}>
        {THEME_KINDS.map((x) => {
          const on = x.kind === kind;
          return (
            <Pressable key={x.kind} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={`${x.name}. ${x.blurb}`}
              onPress={() => { if (!on) { haptic.tap(); setKind(x.kind); } }}
              android_ripple={{ color: t.colors.surfaceVariant }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: t.shape.card, overflow: 'hidden',
                borderWidth: on ? 2 : 1.5, borderColor: on ? t.colors.primary : t.colors.outlineVariant, backgroundColor: t.colors.elevation.level1 }}>
              <Preview kind={x.kind} />
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={{ color: t.colors.onSurface }}>{x.name}</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{x.blurb}</Text>
              </View>
              <Icon name={on ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={on ? t.colors.primary : t.colors.outline} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

export const themeName = (k: ThemeKind) => THEME_KINDS.find((x) => x.kind === k)?.name ?? 'Chalk';
