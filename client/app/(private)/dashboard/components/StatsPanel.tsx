"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Area, AreaChart,
  BarChart, Bar,
} from "recharts";
import "./StatsPanel.css";

type SeriesPoint = { date: string; sales: number; revenue: number; visits: number };
type TopProduct = { name: string; quantity: number };

type StatsData = {
  series: SeriesPoint[];
  topProducts: TopProduct[];
};

const RANGES: { key: "7d" | "30d" | "90d"; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

const GRID_COLOR = "rgba(255,255,255,0.08)";
const AXIS_COLOR = "rgba(255,255,255,0.5)";

function formatDay(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="statsTooltip">
      <strong>{formatDay(label)}</strong>
      {payload.map((p: any) => (
        <span key={p.dataKey}>{formatter ? formatter(p.value) : p.value}</span>
      ))}
    </div>
  );
}

export default function StatsPanel() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [primaryColor, setPrimaryColor] = useState("#6400ff");
  const [secondaryColor, setSecondaryColor] = useState("#00c8ff");

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--primary").trim();
    const secondary = styles.getPropertyValue("--secondary").trim();
    if (primary) setPrimaryColor(primary);
    if (secondary) setSecondaryColor(secondary);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/stats?range=${range}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok) setData({ series: json.data.series, topProducts: json.data.topProducts });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const topProductsChartData = useMemo(
    () => (data?.topProducts ?? []).map((p) => ({ ...p, shortName: p.name.length > 22 ? p.name.slice(0, 20) + "…" : p.name })),
    [data]
  );

  return (
    <section className="statsPanel">
      <div className="statsPanelHeader">
        <h3>Desempenho</h3>
        <div className="statsRangeSwitch">
          {RANGES.map((r) => (
            <button key={r.key} className={range === r.key ? "active" : ""} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <p className="helperText">Carregando gráficos...</p>}

      {data && (
        <div className="statsChartsGrid">
          <div className="statsChartCard">
            <h4>Receita por dia</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="statsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primaryColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={formatCurrency} />
                <Tooltip content={<ChartTooltip formatter={formatCurrency} />} cursor={{ stroke: GRID_COLOR }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={primaryColor}
                  strokeWidth={2}
                  fill="url(#statsRevenueFill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: "#0c0c0e", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="statsChartCard">
            <h4>Visitas à loja por dia</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} visita${v === 1 ? "" : "s"}`} />} cursor={{ stroke: GRID_COLOR }} />
                <Line
                  type="monotone"
                  dataKey="visits"
                  stroke={secondaryColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "#0c0c0e", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="statsChartCard">
            <h4>Top 5 produtos vendidos</h4>
            {topProductsChartData.length === 0 ? (
              <p className="helperText">Sem vendas pagas nesse período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProductsChartData} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} horizontal={false} />
                  <XAxis type="number" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="shortName" type="category" stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <Tooltip
                    content={({ active, payload }: any) =>
                      active && payload?.length ? (
                        <div className="statsTooltip">
                          <strong>{payload[0].payload.name}</strong>
                          <span>{payload[0].value} unidade{payload[0].value === 1 ? "" : "s"}</span>
                        </div>
                      ) : null
                    }
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="quantity" fill={primaryColor} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
