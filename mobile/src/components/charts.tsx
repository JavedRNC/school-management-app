import { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, pctColor } from '@/lib/theme';

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width) };
}

/** Horizontal bars, values in %, coloured by threshold. */
export function HBarChart({ data, low = 75, colorFn }: {
  data: { label: string; value: number | null }[]; low?: number; colorFn?: (v: number | null) => string;
}) {
  return (
    <View style={{ gap: 10 }}>
      {data.map((d) => {
        const c = colorFn ? colorFn(d.value) : pctColor(d.value, low);
        return (
          <View key={d.label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600' }}>{d.label}</Text>
              <Text style={{ fontSize: 13, color: c, fontWeight: '700' }}>{d.value == null ? 'Not marked' : `${d.value}%`}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(0, Math.min(100, d.value ?? 0))}%`, height: 8, backgroundColor: c, borderRadius: 4 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Line chart for a % series (0–100 axis auto-zoomed). */
export function LineChart({ data, height = 150, threshold }: {
  data: { label: string; value: number }[]; height?: number; threshold?: number;
}) {
  const { w, onLayout } = useWidth();
  if (data.length < 2) return <Text style={{ color: colors.muted }}>Not enough data yet</Text>;
  const pad = { l: 30, r: 8, t: 10, b: 20 };
  const vals = data.map((d) => d.value);
  const min = Math.max(0, Math.floor((Math.min(...vals, threshold ?? 100) - 5) / 10) * 10);
  const max = 100;
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (data.length - 1);
  const y = (v: number) => pad.t + ((max - v) * (height - pad.t - pad.b)) / (max - min);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(data.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const ticks = [min, Math.round((min + max) / 2), max];
  const last = data[data.length - 1];
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        {ticks.map((t) => (
          <SvgText key={t} x={pad.l - 6} y={y(t) + 4} fontSize={10} fill={colors.muted} textAnchor="end">{t}</SvgText>
        ))}
        {ticks.map((t) => (
          <Line key={`g${t}`} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
        ))}
        {threshold != null && threshold > min ? (
          <Line x1={pad.l} x2={w - pad.r} y1={y(threshold)} y2={y(threshold)} stroke={colors.bad} strokeDasharray="4 4" strokeWidth={1} />
        ) : null}
        <Path d={area} fill={colors.primary} opacity={0.08} />
        <Path d={path} stroke={colors.primary} strokeWidth={2} fill="none" />
        <Circle cx={x(data.length - 1)} cy={y(last.value)} r={4} fill={colors.primary} />
        <SvgText x={pad.l} y={height - 4} fontSize={10} fill={colors.muted}>{data[0].label}</SvgText>
        <SvgText x={w - pad.r} y={height - 4} fontSize={10} fill={colors.muted} textAnchor="end">{last.label}</SvgText>
      </Svg>
    </View>
  );
}

/** Vertical bars for a few categories. */
export function ColumnChart({ data, height = 160, colorFn }: {
  data: { label: string; value: number }[]; height?: number; colorFn?: (v: number) => string;
}) {
  const { w, onLayout } = useWidth();
  if (!data.length) return null;
  const pad = { t: 18, b: 34 };
  const slot = w / data.length;
  const bw = Math.min(36, slot * 0.55);
  const h = height - pad.t - pad.b;
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Line x1={0} x2={w} y1={pad.t + h} y2={pad.t + h} stroke={colors.border} />
        {data.map((d, i) => {
          const bh = (Math.max(0, Math.min(100, d.value)) / 100) * h;
          const cx = slot * i + slot / 2;
          const fill = colorFn ? colorFn(d.value) : colors.primary;
          const short = d.label.length > 9 ? d.label.slice(0, 8) + '…' : d.label;
          return (
            <G key={d.label}>
              <Rect x={cx - bw / 2} y={pad.t + h - bh} width={bw} height={bh} rx={4} fill={fill} />
              <SvgText x={cx} y={pad.t + h - bh - 5} fontSize={11} fontWeight="bold" fill={colors.text} textAnchor="middle">
                {Math.round(d.value)}
              </SvgText>
              <SvgText x={cx} y={height - 16} fontSize={10} fill={colors.muted} textAnchor="middle">{short}</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function Ring({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = pctColor(value);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none"
          strokeDasharray={`${(c * value) / 100} ${c}`} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <Text style={{ fontSize: 20, fontWeight: '800', color: col }}>{Math.round(value)}%</Text>
      {label ? <Text style={{ fontSize: 10, color: colors.muted }}>{label}</Text> : null}
    </View>
  );
}
