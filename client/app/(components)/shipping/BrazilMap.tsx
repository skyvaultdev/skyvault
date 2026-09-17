"use client";

import "./BrazilMap.css";

// Silhueta simplificada do Brasil (não é geodata oficial, é um contorno
// aproximado desenhado à mão em coordenadas lon/lat) + centróide aproximado
// de cada UF. "Aproximado" de propósito: não temos rastreio GPS em tempo
// real, só a cidade/estado que o staff registra manualmente a cada etapa —
// então a bolinha marca a região do estado, não um ponto exato no mapa.
const OUTLINE: [number, number][] = [
  [-51, 4], [-44, -1], [-38, -3], [-34.8, -7.5], [-37, -11], [-38.5, -13],
  [-39, -17], [-40, -20], [-41, -22.5], [-48, -25.5], [-48.5, -27],
  [-53.5, -29.5], [-57, -30], [-57.5, -25], [-58, -20], [-60, -16],
  [-65, -10], [-73, -8], [-70, -1], [-67, 1], [-60, 4.5], [-59, 3], [-51, 4],
];

const STATE_COORDS: Record<string, [number, number]> = {
  AC: [-70.0, -9.0], AL: [-36.6, -9.6], AP: [-51.9, 1.4], AM: [-64.9, -4.0],
  BA: [-41.7, -12.6], CE: [-39.3, -5.2], DF: [-47.9, -15.8], ES: [-40.6, -19.5],
  GO: [-49.5, -15.9], MA: [-45.3, -5.0], MT: [-55.9, -12.9], MS: [-54.6, -20.5],
  MG: [-44.6, -18.6], PA: [-52.3, -3.9], PB: [-36.8, -7.2], PR: [-51.6, -24.9],
  PE: [-37.8, -8.4], PI: [-42.8, -7.7], RJ: [-43.2, -22.3], RN: [-36.6, -5.8],
  RS: [-53.2, -29.7], RO: [-63.0, -10.8], RR: [-61.4, 2.0], SC: [-50.2, -27.5],
  SP: [-48.6, -22.2], SE: [-37.3, -10.6], TO: [-48.3, -10.2],
};

const LON_MIN = -74, LON_MAX = -34, LAT_MIN = -34, LAT_MAX = 6;
const WIDTH = 300, HEIGHT = 300;

function project([lon, lat]: [number, number]): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WIDTH;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * HEIGHT;
  return [x, y];
}

const OUTLINE_PATH = OUTLINE.map(project).map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";

type Props = {
  state: string | null;
  city?: string | null;
};

export default function BrazilMap({ state, city }: Props) {
  const uf = state?.toUpperCase().trim() ?? "";
  const coords = STATE_COORDS[uf];

  return (
    <div className="brazilMap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="brazilMapSvg">
        <path d={OUTLINE_PATH} className="brazilMapOutline" />
        {coords && (
          <g transform={`translate(${project(coords)[0]}, ${project(coords)[1]})`}>
            <circle r="10" className="brazilMapPulse" />
            <circle r="4.5" className="brazilMapDot" />
          </g>
        )}
      </svg>
      <p className="brazilMapLabel">
        {coords
          ? <>📍 {city ? `${city} — ` : ""}{uf}</>
          : "Localização ainda não informada"}
      </p>
    </div>
  );
}
