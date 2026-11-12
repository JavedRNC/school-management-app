// Small accessible SVG charts drawn from real data (no chart library). Each has a text alternative.
import { useId } from 'react';

type Pt = { label: string; value: number };
const W = 640;

function Tip({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(60, text.length * 6.6 + 16);
  const tx = Math.min(Math.max(x - w / 2, 2), W - w - 2);
  return (
    <g className="tip" aria-hidden="true">
      <rect x={tx} y={Math.max(0, y - 34)} width={w} height={24} rx={6} />
      <text x={tx + w / 2} y={Math.max(0, y - 34) + 16} textAnchor="middle">{text}</text>
    </g>
  );
}

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/** A level over time. `unit` is appended in tooltips (e.g. "%"). */
export function LineChart({ points, unit = '', height = 220, max, summary }: { points: Pt[]; unit?: string; height?: number; max?: number; summary: string }) {
  const id = useId();
  if (points.length < 2) return <p className="muted small">Not enough data yet to draw a trend.</p>;
  const H = height, L = 36, R = 10, T = 14, B = 26;
  const top = max ?? niceMax(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const every = Math.ceil(points.length / 7);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id}>
      <title id={id}>{summary}</title>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="axis" x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} />
          <text x={L - 6} y={y(top * f) + 4} textAnchor="end">{Math.round(top * f)}{unit}</text>
        </g>
      ))}
      <path className="area" d={`${d} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} />
      <path className="line" d={d} />
      {points.map((p, i) => (
        <g key={i}>
          {(i % every === 0 && points.length - 1 - i >= every / 2) || i === points.length - 1 ? <text x={x(i)} y={H - 8} textAnchor={i === points.length - 1 ? 'end' : 'middle'}>{p.label}</text> : null}
          {points.length <= 16 ? <circle className="dot" cx={x(i)} cy={y(p.value)} r={3.5} /> : null}
          <rect className="hit" x={x(i) - (W - L - R) / points.length / 2} y={T} width={(W - L - R) / points.length} height={H - T - B} tabIndex={0}
            aria-label={`${p.label}: ${p.value}${unit}`} />
          <Tip x={x(i)} y={y(p.value)} text={`${p.label}: ${p.value}${unit}`} />
        </g>
      ))}
    </svg>
  );
}

/** One or two series side by side per period. */
export function BarChart({ labels, a, b, nameA, nameB, height = 220, summary }: { labels: string[]; a: number[]; b?: number[]; nameA: string; nameB?: string; height?: number; summary: string }) {
  const id = useId();
  const H = height, L = 30, R = 8, T = 14, B = 26;
  const top = niceMax(Math.max(1, ...a, ...(b ?? [])));
  const slot = (W - L - R) / labels.length;
  const bw = Math.min(26, (slot - 8) / (b ? 2 : 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(labels.length / 8);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id}>
        <title id={id}>{summary}</title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="axis" x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} />
            <text x={L - 6} y={y(top * f) + 4} textAnchor="end">{Math.round(top * f)}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const cx = L + slot * i + slot / 2;
          const tip = `${lab}: ${a[i]} ${nameA.toLowerCase()}${b && nameB ? `, ${b[i]} ${nameB.toLowerCase()}` : ''}`;
          return (
            <g key={lab}>
              <rect className="bar" x={b ? cx - bw - 1 : cx - bw / 2} y={y(a[i])} width={bw} height={Math.max(0, y(0) - y(a[i]))} rx={3} />
              {b ? <rect className="bar b2" x={cx + 1} y={y(b[i])} width={bw} height={Math.max(0, y(0) - y(b[i]))} rx={3} /> : null}
              {i % every === 0 ? <text x={cx} y={H - 8} textAnchor="middle">{lab}</text> : null}
              <rect className="hit" x={cx - slot / 2} y={T} width={slot} height={H - T - B} tabIndex={0} aria-label={tip} />
              <Tip x={cx} y={Math.min(y(a[i]), b ? y(b[i]) : H)} text={tip} />
            </g>
          );
        })}
      </svg>
      <div className="legend"><span><i />{nameA}</span>{b && nameB ? <span><i className="b2" />{nameB}</span> : null}</div>
    </>
  );
}

/** Ranked horizontal bars with a value label (e.g. attendance by class). */
export function Bars({ rows, unit = '%', max = 100, tone }: { rows: { label: string; value: number | null }[]; unit?: string; max?: number; tone?: (v: number) => string }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="b" key={r.label}>
          <span className="small">{r.label}</span>
          {r.value === null ? <div className="meter" role="img" aria-label={`${r.label}: not available yet`} /> : (
            <div className={`meter ${tone ? tone(r.value) : ''}`} role="img" aria-label={`${r.label}: ${r.value}${unit}`}><i style={{ width: `${Math.max(2, Math.min(100, (r.value / max) * 100))}%` }} /></div>
          )}
          <span className="small num">{r.value === null ? 'Not marked' : `${r.value}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}
