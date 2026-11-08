import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/lib/theme';

export function Screen({
  children, onRefresh, refreshing = false, scroll = true, padded = true,
}: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padded?: boolean }) {
  const inner = padded ? { padding: space.lg, paddingBottom: space.xl * 2 } : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={[styles.row, { marginBottom: space.lg, justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, title, right }: { children: ReactNode; style?: ViewStyle; title?: string; right?: ReactNode }) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: space.md }]}>
          <Text style={styles.h3}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Button({
  title, onPress, variant = 'primary', disabled, loading, small, style,
}: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean; loading?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const bg = { primary: colors.primary, secondary: colors.primarySoft, danger: colors.badSoft, ghost: 'transparent' }[variant];
  const fg = { primary: '#fff', secondary: colors.primary, danger: colors.bad, ghost: colors.primary }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }, small && { fontSize: 13 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Chips<T extends string | number>({
  options, value, onChange, label,
}: { options: { label: string; value: T }[]; value: T | null | undefined; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} onPress={() => onChange(o.value)}
              style={[styles.chip, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[styles.chipText, on && { color: '#fff' }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function Loading() {
  return <View style={{ padding: space.xl * 2 }}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.badSoft }]}>
      <Text style={{ color: colors.bad, marginBottom: onRetry ? space.sm : 0 }}>{message}</Text>
      {onRetry ? <Button title="Try again" variant="danger" small onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[styles.muted, { textAlign: 'center', padding: space.xl }]}>{text}</Text>;
}

export function Stat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={[styles.muted, { fontSize: 11 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, color = colors.primary, bg = colors.primarySoft }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function ListRow({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>{title}</Text>
        {subtitle ? <Text style={[styles.muted, { fontSize: 13 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  btn: { borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  btnText: { fontSize: 15, fontWeight: '700' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: 11, fontSize: 15, color: colors.text,
  },
  chip: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '600' },
  listRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border, gap: space.sm,
  },
});
