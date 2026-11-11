import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, HelperText, Switch, Text, TextInput } from 'react-native-paper';

import { FilterChips, Icon, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { fieldOutline, radius, space, useAppTheme } from '@/lib/theme';
import type { Banner, BannerColor, SchoolClass } from '@/lib/types';

import { BannerCard } from './BannerCard';
import { AUDIENCE_OPTIONS, bannerGradient, COLOR_KEYS, isoIn } from './util';

export interface BannerBody {
  title: string;
  text: string;
  image_url: string;
  color: BannerColor;
  roles: string[];
  class_ids: number[];
  start_date: string | null;
  end_date: string | null;
  popup: boolean;
  sort: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Create / edit a banner (school or platform). */
export function BannerEditor({ visible, onDismiss, initial, allowImages, showClasses, onSave }: {
  visible: boolean; onDismiss: () => void; initial: Banner | null; allowImages: boolean; showClasses: boolean;
  onSave: (body: BannerBody) => Promise<void>;
}) {
  const t = useAppTheme();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [image, setImage] = useState('');
  const [color, setColor] = useState<BannerColor>('primary');
  const [aud, setAud] = useState('all');
  const [classIds, setClassIds] = useState<number[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [popup, setPopup] = useState(false);
  const [sort, setSort] = useState('0');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const b = initial;
    setTitle(b?.title ?? ''); setText(b?.text ?? ''); setImage(b?.image_url ?? ''); setColor(b?.color ?? 'primary');
    const match = AUDIENCE_OPTIONS.find((o) => JSON.stringify([...o.roles].sort()) === JSON.stringify([...(b?.roles ?? [])].sort()));
    setAud(match?.value ?? 'all');
    setClassIds(b?.class_ids ?? []); setStart(b?.start_date ?? ''); setEnd(b?.end_date ?? '');
    setPopup(b?.popup ?? false); setSort(String(b?.sort ?? 0)); setTouched(false);
    if (showClasses) api<SchoolClass[]>('/classes').then(setClasses).catch(() => setClasses([]));
  }, [visible, initial, showClasses]);

  const imageBad = !!image && !image.startsWith('https://');
  const startBad = !!start && !DATE_RE.test(start);
  const endBad = !!end && (!DATE_RE.test(end) || (!!start && DATE_RE.test(start) && end < start));
  const valid = title.trim() && !imageBad && !startBad && !endBad;
  const roles = AUDIENCE_OPTIONS.find((o) => o.value === aud)?.roles ?? [];
  const forStudents = aud === 'all' || aud === 'parent' || aud === 'student';

  async function save() {
    setTouched(true);
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      await onSave({
        title: title.trim(), text: text.trim(), image_url: allowImages ? image.trim() : '', color, roles,
        class_ids: forStudents ? classIds : [], start_date: start || null, end_date: end || null, popup, sort: Number(sort) || 0,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={initial ? 'Edit banner' : 'New banner'}>
      <BannerCard banner={{ title: title.trim(), text: text.trim(), image_url: allowImages ? image.trim() : '', color }} height={140}
        style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Title" value={title} onChangeText={setTitle} maxLength={120} error={touched && !title.trim()} />
      <HelperText type="error" visible={touched && !title.trim()}>Title is required</HelperText>
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Message (optional)" value={text} onChangeText={setText} multiline maxLength={600}
        style={{ minHeight: 80, marginBottom: space.md }} />

      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>Colour</Text>
      <View style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
        {COLOR_KEYS.map((k) => {
          const [c1, c2] = bannerGradient(t, k);
          const on = k === color;
          return (
            <Pressable key={k} onPress={() => { haptic.tap(); setColor(k); }} accessibilityLabel={`Colour ${k}`}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c1, borderWidth: on ? 3 : 0, borderColor: t.colors.onSurface,
                alignItems: 'center', justifyContent: 'center', shadowColor: c2, shadowOpacity: on ? 0.6 : 0, shadowRadius: 8, elevation: on ? 4 : 0 }}>
              {on ? <Icon name="check" size={20} color="#fff" /> : null}
            </Pressable>
          );
        })}
      </View>

      {allowImages ? (
        <>
          <TextInput mode="outlined" outlineStyle={fieldOutline} label="Image link (optional)" value={image} onChangeText={setImage} autoCapitalize="none" autoCorrect={false}
            placeholder="https://…" left={<TextInput.Icon icon="image-outline" />} error={imageBad} />
          <HelperText type={imageBad ? 'error' : 'info'} visible>
            {imageBad ? 'Link must start with https://' : 'Paste an https image link. Photo upload will come once image storage is connected.'}
          </HelperText>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: t.colors.surfaceVariant, borderRadius: radius.md,
          padding: space.md, marginBottom: space.md }}>
          <Icon name="lock-outline" size={18} color={t.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>Image banners are part of the Communication module.</Text>
        </View>
      )}

      <FilterChips label="Who sees it" options={AUDIENCE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))} value={aud} onChange={setAud} />
      {showClasses && forStudents && classes.length ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>
            Classes {classIds.length ? `(${classIds.length})` : '(all)'} — for students & parents
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {classes.map((c) => {
              const on = classIds.includes(c.id);
              return (
                <Pressable key={c.id} onPress={() => { haptic.tap(); setClassIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id])); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1,
                    borderColor: on ? t.colors.primary : t.colors.outlineVariant, backgroundColor: on ? t.colors.secondaryContainer : 'transparent' }}>
                  <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput mode="outlined" outlineStyle={fieldOutline} label="Show from" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" style={{ flex: 1 }} error={startBad} />
        <TextInput mode="outlined" outlineStyle={fieldOutline} label="Until" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" style={{ flex: 1 }} error={endBad} />
      </View>
      <HelperText type={startBad || endBad ? 'error' : 'info'} visible>
        {startBad || endBad ? 'Use YYYY-MM-DD; "Until" can’t be before "Show from"' : 'Leave empty to show right away / with no end date'}
      </HelperText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
        {([['Starts today', () => setStart(isoIn(0))], ['Ends in 7 days', () => setEnd(isoIn(7))], ['Ends in 30 days', () => setEnd(isoIn(30))],
          ['No end', () => setEnd('')]] as [string, () => void][]).map(([label, fn]) => (
          <Button key={label} compact mode="outlined" onPress={() => { haptic.tap(); fn(); }}>{label}</Button>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Show as pop-up once</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Opens over the app the next time each person opens it</Text>
        </View>
        <Switch value={popup} onValueChange={setPopup} />
      </View>
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Order (lower shows first)" value={sort} onChangeText={(v) => setSort(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad" style={{ marginBottom: space.md }} />
      <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }}>
        {initial ? 'Save changes' : 'Publish banner'}
      </Button>
    </Sheet>
  );
}
