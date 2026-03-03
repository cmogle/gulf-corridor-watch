/** Tiny inline SVG sparkline for 6h trend data. */

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

export function Sparkline({ data, width = 80, height = 20, color = "var(--primary-blue)", className }: Props) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * (height - 2) - 1; // 1px padding top+bottom
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Fill area under the line
  const areaPoints = [
    `0,${height}`,
    ...points,
    `${width},${height}`,
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polygon
        points={areaPoints}
        fill={color}
        opacity="0.08"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
