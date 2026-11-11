import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, PanResponder, Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/feedback';
import { pctTone, radius, space, toneColors, useAppTheme } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(100, e.nativeEvent.layout.width)) };
}

function useGrow(deps: unknown[], duration = 900) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

// ------------------------------------------------------------------ Ring
export function Ring({ value, size = 104, label, low = 75, stroke = 11 }: { value: number; size?: number; label?: string; low?: number; stroke?: number }) {
  const t = useAppTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = toneColors(t, pctTone(value, low)).fg;
  const grow = useGrow([value], 1100);
  const offset = grow.interpolate({ inputRange: [0, 1], outputRange: [c, c * (1 - Math.max(0, Math.min(100, value)) / 100)] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.custom.chartTrack} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <Text style={{ fontSize: size * 0.22, fontWeight: '700', color: col }}>{Math.round(value)}%</Text>
      {label ? <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: -2 }}>{label}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ Progress bars
export function ProgressRows({ data, low = 75, onPress }: {
  data: { key?: string; label: string; value: number | null; caption?: string }[]; low?: number; onPress?: (i: number) => void;
}) {
  const t = useAppTheme();
  const grow = useGrow([data.map((d) => d.value).join(',')]);
  return (
    <View style={{ gap: space.md }}>
      {data.map((d, i) => {
        const tone = toneColors(t, pctTone(d.value, low));
        const w = grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(0, Math.min(100, d.value ?? 0))}%`] });
        return (
          <Pressable key={d.key ?? d.label} disabled={!onPress} onPress={() => { haptic.tap(); onPress?.(i); }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{d.label}
                {d.caption ? <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{`  ${d.caption}`}</Text> : null}
              </Text>
              <Text variant="labelLarge" style={{ color: d.value == null ? t.colors.outline : tone.fg, fontWeight: '700' }}>
                {d.value == null ? 'Not marked' : `${d.value}%`}
              </Text>
            </View>
            <View style={{ height: 10, backgroundColor: t.custom.chartTrack, borderRadius: 5, overflow: 'hidden' }}>
              <Animated.View style={{ width: w, height: 10, backgroundColor: tone.fg, borderRadius: 5 }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ Line (scrubbable)
export function TrendChart({ data, height = 180, threshold }: { data: { label: string; value: number }[]; height?: number; threshold?: number }) {
  const t = useAppTheme();
  const { w, onLayout } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const pad = { l: 32, r: 12, t: 16, b: 22 };
  const geo = useMemo(() => {
    if (data.length < 2) return null;
    const vals = data.map((d) => d.value);
    const min = Math.max(0, Math.floor((Math.min(...vals, threshold ?? 100) - 5) / 10) * 10);
    const max = 100;
    const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1);
    const y = (v: number) => pad.t + ((max - v) * (height - pad.t - pad.b)) / (max - min);
    // smooth path (monotone-ish cubic)
    let d = `M${x(0)},${y(vals[0])}`;
    for (let i = 1; i < vals.length; i++) {
      const cx = (x(i - 1) + x(i)) / 2;
      d += ` C${cx},${y(vals[i - 1])} ${cx},${y(vals[i])} ${x(i)},${y(vals[i])}`;
    }
    const area = `${d} L${x(vals.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
    return { min, max, x, y, d, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, w, height, threshold]);

  const lastIdx = useRef<number | null>(null);
  const pick = (px: number) => {
    if (!geo) return;
    const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (data.length - 1));
    const c = Math.max(0, Math.min(data.length - 1, i));
    if (c !== lastIdx.current) { lastIdx.current = c; haptic.tap(); }
    setActive(c);
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
    onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
    onPanResponderRelease: () => { lastIdx.current = null; setTimeout(() => setActive(null), 1600); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [geo, w]);

  const draw = useGrow([data.length, w], 1000);
  if (!geo) return <Text style={{ color: t.colors.onSurfaceVariant }}>Not enough data yet</Text>;
  const ticks = [geo.min, Math.round((geo.min + geo.max) / 2), geo.max];
  const ai = active ?? data.length - 1;
  const ax = geo.x(ai);
  const ay = geo.y(data[ai].value);
  const tipW = 92;
  const tipX = Math.max(pad.l, Math.min(w - pad.r - tipW, ax - tipW / 2));
  const reveal = draw.interpolate({ inputRange: [0, 1], outputRange: [pad.l, w] });

  return (
    <View onLayout={onLayout} {...pan.panHandlers}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.colors.primary} stopOpacity={0.28} />
            <Stop offset="1" stopColor={t.colors.primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {ticks.map((tk) => (
          <G key={tk}>
            <Line x1={pad.l} x2={w - pad.r} y1={geo.y(tk)} y2={geo.y(tk)} stroke={t.custom.chartTrack} strokeWidth={1} />
            <SvgText x={pad.l - 6} y={geo.y(tk) + 4} fontSize={10} fill={t.colors.onSurfaceVariant} textAnchor="end">{tk}</SvgText>
          </G>
        ))}
        {threshold != null && threshold > geo.min ? (
          <Line x1={pad.l} x2={w - pad.r} y1={geo.y(threshold)} y2={geo.y(threshold)} stroke={t.custom.danger} strokeDasharray="5 5" strokeWidth={1.2} />
        ) : null}
        <Path d={geo.area} fill="url(#fill)" />
        <Path d={geo.d} stroke={t.colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {/* reveal mask: covers the line until animation completes */}
        <AnimatedRect x={reveal} y={0} width={w} height={height - pad.b + 1} fill={t.colors.elevation.level1} />
        <Line x1={ax} x2={ax} y1={pad.t} y2={height - pad.b} stroke={t.colors.outline} strokeWidth={1} strokeDasharray="3 3" opacity={active == null ? 0 : 1} />
        <Circle cx={ax} cy={ay} r={7} fill={t.colors.primary} opacity={0.2} />
        <Circle cx={ax} cy={ay} r={4.5} fill={t.colors.primary} stroke="#fff" strokeWidth={2} />
        <SvgText x={pad.l} y={height - 5} fontSize={10} fill={t.colors.onSurfaceVariant}>{data[0].label}</SvgText>
        <SvgText x={w - pad.r} y={height - 5} fontSize={10} fill={t.colors.onSurfaceVariant} textAnchor="end">{data[data.length - 1].label}</SvgText>
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', left: tipX, top: Math.max(0, ay - 48), width: tipW,
        backgroundColor: t.colors.inverseSurface, borderRadius: radius.sm, paddingVertical: 4, alignItems: 'center' }}>
        <Text variant="labelLarge" style={{ color: t.colors.inverseOnSurface, fontWeight: '700' }}>{data[ai].value}%</Text>
        <Text variant="labelSmall" style={{ color: t.colors.inverseOnSurface, opacity: 0.8 }}>{data[ai].label}</Text>
      </View>
      <Text variant="labelSmall" style={{ color: t.colors.outline, textAlign: 'center', marginTop: 2 }}>Drag across the chart to see each day</Text>
    </View>
  );
}

// ------------------------------------------------------------------ Columns (tappable)
export function ColumnChart({ data, height = 190, low = 50 }: { data: { label: string; value: number }[]; height?: number; low?: number }) {
  const t = useAppTheme();
  const { w, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const grow = useGrow([data.map((d) => d.value).join(',')], 900);
  if (!data.length) return null;
  const pad = { t: 22, b: 30 };
  const slot = w / data.length;
  const bw = Math.min(44, slot * 0.58);
  const h = height - pad.t - pad.b;
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Line x1={0} x2={w} y1={pad.t + h} y2={pad.t + h} stroke={t.colors.outlineVariant} />
        {data.map((d, i) => {
          const full = (Math.max(0, Math.min(100, d.value)) / 100) * h;
          const cx = slot * i + slot / 2;
          const tone = toneColors(t, pctTone(d.value, low));
          const on = sel === i;
          const bh = grow.interpolate({ inputRange: [0, 1], outputRange: [0, full] });
          const by = grow.interpolate({ inputRange: [0, 1], outputRange: [pad.t + h, pad.t + h - full] });
          return (
            <G key={d.label} onPress={() => { haptic.tap(); setSel(on ? null : i); }}>
              <Rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              <AnimatedRect x={cx - bw / 2} y={by} width={bw} height={bh} rx={8} fill={sel == null || on ? tone.fg : t.colors.outlineVariant} />
              <SvgText x={cx} y={pad.t + h - full - 7} fontSize={on ? 13 : 11} fontWeight="bold" fill={t.colors.onSurface} textAnchor="middle">
                {d.value.toFixed(on ? 1 : 0)}%
              </SvgText>
              <SvgText x={cx} y={height - 10} fontSize={11} fill={on ? t.colors.primary : t.colors.onSurfaceVariant} fontWeight={on ? 'bold' : 'normal'} textAnchor="middle">
                {d.label.length > 9 ? d.label.slice(0, 8) + '…' : d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** Small row of P/A dots for recent days. */
export function DayDots({ days }: { days: { date: string; present: boolean }[] }) {
  const t = useAppTheme();
  const [sel, setSel] = useState<number | null>(null);
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {days.map((d, i) => {
          const c = toneColors(t, d.present ? 'success' : 'danger');
          const on = sel === i;
          return (
            <Pressable key={d.date} onPress={() => { haptic.tap(); setSel(on ? null : i); }}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? c.fg : c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: on ? '#fff' : c.fg }}>{new Date(d.date + 'T00:00:00').getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      {sel != null ? (
        <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
          {new Date(days[sel].date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — {days[sel].present ? 'Present' : 'Absent'}
        </Text>
      ) : null}
    </View>
  );
}
