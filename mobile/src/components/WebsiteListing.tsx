import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { TextInput } from '@/components/Field';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';

import { FadeIn, Panel } from './ui';

type Showcase = { show: boolean; city: string; name: string; board: string;
  crest: { initials: string; color: string; shape: 'shield' | 'circle' | 'hex'; motif: string } };

/** The generated crest the website shows for this school (never the school's real logo). */
function Crest({ c, size = 56 }: { c: Showcase['crest']; size?: number }) {
  const shape = c.shape === 'circle' ? <Circle cx={32} cy={32} r={29} fill={c.color} />
    : c.shape === 'hex' ? <Path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill={c.color} />
      : <Path d="M32 3 56 11v20c0 15-10 25-24 30C18 56 8 46 8 31V11Z" fill={c.color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {shape}
      <SvgText x={32} y={39} fontSize={18} fontWeight="700" fill="#fff" textAnchor="middle">{c.initials}</SvgText>
    </Svg>
  );
}

/** Principal: list (or hide) the school on the public School Hub website. */
export function WebsiteListing() {
  const t = useAppTheme();
  const toast = useToast();
  const { user } = useAuth();
  const [d, setD] = useState<Showcase | null>(null);
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role !== 'principal') return;
    api<Showcase>('/school/showcase').then((r) => { setD(r); setCity(r.city); }).catch(() => {});
  }, [user?.role]);
  if (user?.role !== 'principal' || !d) return null;

  async function save(show: boolean) {
    haptic.tap();
    setBusy(true);
    try {
      const r = await api<Showcase>('/school/showcase', { method: 'PUT', body: { show, city: city.trim() } });
      setD(r);
      toast(show ? 'Your school is listed on the School Hub website' : 'Your school is hidden from the website');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FadeIn index={3}>
      <Panel title="Show on website" icon="web" subtitle="List your school on the School Hub website">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
          <Crest c={d.crest} />
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ color: t.colors.onSurface }}>{d.name}</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
              {[city.trim(), d.board].filter(Boolean).join(', ') || 'Add your city below'}
            </Text>
          </View>
          <Switch value={d.show} disabled={busy} onValueChange={(v) => save(v)} />
        </View>
        <TextInput label="City (shown on the website)" value={city} onChangeText={setCity} maxLength={60} />
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginVertical: space.sm }}>
          Only the school's name, city and board are shown, with a crest made from your initials. No student, parent or staff details.
        </Text>
        {city.trim() !== d.city ? <Button mode="contained-tonal" onPress={() => save(d.show)} loading={busy}>Save city</Button> : null}
      </Panel>
    </FadeIn>
  );
}
