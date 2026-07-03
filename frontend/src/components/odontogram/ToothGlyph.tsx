import React from 'react';
import {
  ConditionId,
  SURFACE_NAMES,
  SurfaceKey,
  ToothRecord,
  conditionById,
  toothName,
  toothType,
  TOOTH_RADII,
} from './odontogramData';

// ============================================================================
// ToothGlyph — one tooth in occlusal view, anatomically oriented.
// A silhouette (whole-tooth click target) carries a 4-sector surface ring
// (M/D/B/L) around an occlusal center. Sector positions are computed from the
// tooth's real outward (Buccal) and midline (Mesial) directions, so B always
// faces out of the mouth and M always faces the dental midline — correct for
// every quadrant, which the old flat chart was not.
// ============================================================================

interface ToothGlyphProps {
  fdi: number;
  x: number;
  y: number;
  outwardDeg: number;
  mesialDeg: number;
  record?: ToothRecord;
  hovered: boolean;
  onClick: (fdi: number, surface: SurfaceKey | null) => void;
  onHover: (fdi: number | null) => void;
}

// Chart degrees: 0 = up, clockwise positive (screen y grows downward).
const polar = (cx: number, cy: number, r: number, chartDeg: number): [number, number] => {
  const rad = (chartDeg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
};

// Annulus sector path centered on `centerDeg`, spanning `span` degrees.
function sectorPath(cx: number, cy: number, r0: number, r1: number, centerDeg: number, span: number): string {
  const a0 = centerDeg - span / 2;
  const a1 = centerDeg + span / 2;
  const [x1, y1] = polar(cx, cy, r1, a0);
  const [x2, y2] = polar(cx, cy, r1, a1);
  const [x3, y3] = polar(cx, cy, r0, a1);
  const [x4, y4] = polar(cx, cy, r0, a0);
  return `M ${x1} ${y1} A ${r1} ${r1} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r0} ${r0} 0 0 0 ${x4} ${y4} Z`;
}

export function ToothGlyph({
  fdi, x, y, outwardDeg, mesialDeg, record, hovered, onClick, onHover,
}: ToothGlyphProps) {
  const type = toothType(fdi);
  const rOuter = TOOTH_RADII[type];
  const rRing = rOuter - 3.5;      // surface ring outer radius
  const rHole = rOuter * 0.42;     // surface ring inner radius
  const rCore = rHole - 1.5;       // occlusal center

  const whole = record?.whole || null;
  const surfaces = record?.surfaces || {};
  const wholeDef = conditionById(whole);

  const surfaceAngles: Record<Exclude<SurfaceKey, 'O'>, number> = {
    B: outwardDeg,
    L: outwardDeg + 180,
    M: mesialDeg,
    D: mesialDeg + 180,
  };

  const numberPos = polar(x, y, rOuter + 13, outwardDeg);

  const handle = (surface: SurfaceKey | null) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(fdi, surface);
  };

  // ---- MISSING: ghost silhouette only --------------------------------------
  if (whole === 'missing') {
    return (
      <g
        className="odo-tooth odo-tooth--missing"
        onMouseEnter={() => onHover(fdi)}
        onMouseLeave={() => onHover(null)}
        onClick={handle(null)}
      >
        <title>{`${fdi} · ${toothName(fdi)} — Missing`}</title>
        <circle cx={x} cy={y} r={rOuter - 2} className="odo-missing-ghost" />
        <line x1={x - rOuter * 0.45} y1={y - rOuter * 0.45} x2={x + rOuter * 0.45} y2={y + rOuter * 0.45} className="odo-missing-x" />
        <line x1={x + rOuter * 0.45} y1={y - rOuter * 0.45} x2={x - rOuter * 0.45} y2={y + rOuter * 0.45} className="odo-missing-x" />
        <text x={numberPos[0]} y={numberPos[1]} className="odo-tooth-num odo-tooth-num--dim">{fdi}</text>
      </g>
    );
  }

  const glow = hovered || whole ? (wholeDef?.color ?? 'var(--dc-accent, #2DD4BF)') : 'none';

  return (
    <g
      className={`odo-tooth${hovered ? ' odo-tooth--hover' : ''}`}
      onMouseEnter={() => onHover(fdi)}
      onMouseLeave={() => onHover(null)}
      style={glow !== 'none' ? { filter: `drop-shadow(0 0 5px ${glow})` } : undefined}
    >
      <title>{`${fdi} · ${toothName(fdi)}`}</title>

      {/* Silhouette = whole-tooth target */}
      <circle
        cx={x}
        cy={y}
        r={rOuter}
        className="odo-silhouette"
        style={whole && wholeDef ? { fill: wholeDef.soft, stroke: wholeDef.color } : undefined}
        onClick={handle(null)}
      />

      {/* Surface ring + occlusal core — hidden when a whole-tooth condition is set */}
      {!whole && (
        <>
          {(Object.keys(surfaceAngles) as Array<Exclude<SurfaceKey, 'O'>>).map(key => {
            const cond = conditionById(surfaces[key] || null);
            return (
              <path
                key={key}
                d={sectorPath(x, y, rHole, rRing, surfaceAngles[key], 84)}
                className="odo-sector"
                style={cond ? { fill: cond.soft, stroke: cond.color } : undefined}
                onClick={handle(key)}
              >
                <title>{`${fdi} ${SURFACE_NAMES[key]}${surfaces[key] ? ` — ${conditionById(surfaces[key])?.label}` : ''}`}</title>
              </path>
            );
          })}
          {(() => {
            const cond = conditionById(surfaces.O || null);
            return (
              <circle
                cx={x}
                cy={y}
                r={rCore}
                className="odo-sector odo-core"
                style={cond ? { fill: cond.soft, stroke: cond.color } : undefined}
                onClick={handle('O')}
              >
                <title>{`${fdi} ${SURFACE_NAMES.O}${surfaces.O ? ` — ${conditionById(surfaces.O)?.label}` : ''}`}</title>
              </circle>
            );
          })()}
        </>
      )}

      {/* Whole-tooth overlays */}
      {whole === 'extraction' && (
        <>
          <line x1={x - rOuter * 0.55} y1={y - rOuter * 0.55} x2={x + rOuter * 0.55} y2={y + rOuter * 0.55} className="odo-mark" style={{ stroke: wholeDef?.color }} />
          <line x1={x + rOuter * 0.55} y1={y - rOuter * 0.55} x2={x - rOuter * 0.55} y2={y + rOuter * 0.55} className="odo-mark" style={{ stroke: wholeDef?.color }} />
        </>
      )}
      {(whole === 'crown' || whole === 'crown_bridge') && (
        <circle cx={x} cy={y} r={rOuter * 0.62} className="odo-mark-ring" style={{ stroke: wholeDef?.color }} />
      )}
      {whole === 'implant' && (
        <>
          <line x1={x} y1={y - rOuter * 0.55} x2={x} y2={y + rOuter * 0.55} className="odo-mark" style={{ stroke: wholeDef?.color }} />
          <line x1={x - rOuter * 0.32} y1={y - rOuter * 0.22} x2={x + rOuter * 0.32} y2={y - rOuter * 0.22} className="odo-mark odo-mark--thin" style={{ stroke: wholeDef?.color }} />
          <line x1={x - rOuter * 0.32} y1={y + rOuter * 0.22} x2={x + rOuter * 0.32} y2={y + rOuter * 0.22} className="odo-mark odo-mark--thin" style={{ stroke: wholeDef?.color }} />
        </>
      )}
      {whole === 'rct' && (
        <path
          d={`M ${x - rOuter * 0.3} ${y - rOuter * 0.35} L ${x} ${y + rOuter * 0.5} L ${x + rOuter * 0.3} ${y - rOuter * 0.35}`}
          className="odo-mark-ring"
          style={{ stroke: wholeDef?.color }}
        />
      )}

      <text x={numberPos[0]} y={numberPos[1]} className="odo-tooth-num">{fdi}</text>
    </g>
  );
}

export default ToothGlyph;
