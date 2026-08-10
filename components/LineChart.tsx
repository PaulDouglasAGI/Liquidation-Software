"use client";

import { useId, useState } from "react";

/**
 * A small multi-series line chart in plain SVG.
 *
 * No chart library: this codebase carries no chart dependency, and one chart
 * shape does not justify adding one. Hand-rolled also means the axes can speak
 * the domain — dollars, days, multiples — instead of being bent into a generic
 * component's idea of a number.
 */

export interface Series {
  label: string;
  /** Same length as `labels`. null leaves a gap rather than drawing through it. */
  values: (number | null)[];
  color: string;
  /** Draw as a dashed line — for reference lines like break-even. */
  dashed?: boolean;
  /** Right-hand axis, for a series in different units. */
  axis?: "left" | "right";
}

export interface LineChartProps {
  labels: string[];
  series: Series[];
  height?: number;
  /** How to render a value in the tooltip and on the axis. */
  formatLeft?: (n: number) => string;
  formatRight?: (n: number) => string;
  leftTitle?: string;
  /** Horizontal reference line on the left axis (e.g. break-even at 1.0). */
  markLeft?: { value: number; label: string };
}

const PAD = { top: 12, right: 54, bottom: 30, left: 60 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export default function LineChart({
  labels, series, height = 240,
  formatLeft = (n) => String(Math.round(n)),
  formatRight = (n) => String(Math.round(n)),
  leftTitle, markLeft,
}: LineChartProps) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  if (labels.length === 0 || series.length === 0) {
    return <div className="px-3 py-6 text-center text-[13px] text-muted">Not enough history to chart yet.</div>;
  }

  const forAxis = (a: "left" | "right") => series.filter((s) => (s.axis ?? "left") === a);
  const rangeOf = (list: Series[], includeMark = false) => {
    const vals = list.flatMap((s) => s.values.filter((v): v is number => v != null));
    if (includeMark && markLeft) vals.push(markLeft.value);
    if (vals.length === 0) return { min: 0, max: 1 };
    let min = Math.min(...vals, 0); // always show the zero line for money
    let max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    return { min, max };
  };

  const left = rangeOf(forAxis("left"), true);
  const right = rangeOf(forAxis("right"));

  const x = (i: number) => PAD.left + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const yOn = (v: number, r: { min: number; max: number }) =>
    PAD.top + innerH - ((v - r.min) / (r.max - r.min)) * innerH;

  const pathFor = (s: Series) => {
    const r = (s.axis ?? "left") === "left" ? left : right;
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${yOn(v, r).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const leftTicks = niceTicks(left.min, left.max);
  const rightTicks = forAxis("right").length ? niceTicks(right.min, right.max) : [];
  // Enough labels to orient without turning the axis into a smear.
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[520px]"
        role="img"
        aria-label={`${leftTitle ?? "Chart"} by period`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid + left axis */}
        {leftTicks.map((t) => (
          <g key={`l${t}`}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOn(t, left)} y2={yOn(t, left)}
              className="stroke-edge" strokeWidth="1" />
            <text x={PAD.left - 8} y={yOn(t, left) + 3} textAnchor="end"
              className="fill-muted text-[10px]">{formatLeft(t)}</text>
          </g>
        ))}

        {rightTicks.map((t) => (
          <text key={`r${t}`} x={width - PAD.right + 8} y={yOn(t, right) + 3}
            className="fill-muted text-[10px]">{formatRight(t)}</text>
        ))}

        {markLeft ? (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOn(markLeft.value, left)} y2={yOn(markLeft.value, left)}
              className="stroke-accent" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
            <text x={width - PAD.right - 2} y={yOn(markLeft.value, left) - 4} textAnchor="end"
              className="fill-accent text-[10px]">{markLeft.label}</text>
          </g>
        ) : null}

        {/* period labels */}
        {labels.map((l, i) =>
          i % labelStep === 0 || i === labels.length - 1 ? (
            <text key={l + i} x={x(i)} y={height - 10} textAnchor="middle" className="fill-muted text-[10px]">{l}</text>
          ) : null
        )}

        {series.map((s) => (
          <path key={s.label} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2"
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* points on the hovered period */}
        {hover != null
          ? series.map((s) => {
              const v = s.values[hover];
              if (v == null) return null;
              const r = (s.axis ?? "left") === "left" ? left : right;
              return <circle key={s.label} cx={x(hover)} cy={yOn(v, r)} r="3.5" fill={s.color} />;
            })
          : null}

        {hover != null ? (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH}
            className="stroke-muted" strokeWidth="1" opacity="0.5" />
        ) : null}

        {/* invisible hit areas, one per period */}
        {labels.map((l, i) => (
          <rect key={`hit${i}`} x={x(i) - innerW / Math.max(1, labels.length * 2) - 2} y={PAD.top}
            width={innerW / Math.max(1, labels.length) + 4} height={innerH}
            fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 text-[11px]">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-muted">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
            {hover != null && s.values[hover] != null ? (
              <span className="font-semibold text-zinc-200">
                {(s.axis ?? "left") === "left" ? formatLeft(s.values[hover]!) : formatRight(s.values[hover]!)}
              </span>
            ) : null}
          </span>
        ))}
        {hover != null ? <span className="ml-auto font-semibold text-zinc-300">{labels[hover]}</span> : null}
      </div>
    </div>
  );
}
