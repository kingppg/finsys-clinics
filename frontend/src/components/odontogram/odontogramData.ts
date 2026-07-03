// ============================================================================
// ODONTOGRAM — data contracts, condition catalog, FDI naming, arch geometry
// ----------------------------------------------------------------------------
// The persisted data model is UNCHANGED from the original component:
//   odontograms table, one row per patient:
//   tooth_data = { "<fdi>": { whole: ConditionId|null, surfaces: {M,D,B,L,O} } }
// Only the presentation is new. Condition ids must never change — they are
// stored in patient records.
// ============================================================================

export type SurfaceKey = 'M' | 'D' | 'B' | 'L' | 'O';

export type ConditionId =
  | 'caries' | 'filling' | 'crown' | 'missing' | 'rct'
  | 'extraction' | 'implant' | 'crown_bridge' | 'healthy';

export interface ToothRecord {
  whole: ConditionId | null;
  surfaces: Partial<Record<SurfaceKey, ConditionId | null>>;
}

export type ToothData = Record<string, ToothRecord>;

export interface ConditionDef {
  id: ConditionId;
  label: string;
  /** Solid tone used on the dark chart (glow color) */
  color: string;
  /** Translucent wash for fills */
  soft: string;
}

// Dark-Executive-tuned palette. IDs identical to legacy data.
export const CONDITIONS: ConditionDef[] = [
  { id: 'caries',       label: 'Caries',         color: '#F87171', soft: 'rgba(248,113,113,0.30)' },
  { id: 'filling',      label: 'Filling',        color: '#60A5FA', soft: 'rgba(96,165,250,0.30)' },
  { id: 'crown',        label: 'Crown',          color: '#FBBF24', soft: 'rgba(251,191,36,0.30)' },
  { id: 'missing',      label: 'Missing',        color: '#64748B', soft: 'rgba(100,116,139,0.25)' },
  { id: 'rct',          label: 'Root Canal',     color: '#A78BFA', soft: 'rgba(167,139,250,0.30)' },
  { id: 'extraction',   label: 'For Extraction', color: '#FB7185', soft: 'rgba(251,113,133,0.30)' },
  { id: 'implant',      label: 'Implant',        color: '#34D399', soft: 'rgba(52,211,153,0.30)' },
  { id: 'crown_bridge', label: 'Bridge/Crown',   color: '#2DD4BF', soft: 'rgba(45,212,191,0.30)' },
  { id: 'healthy',      label: 'Healthy',        color: '#4ADE80', soft: 'rgba(74,222,128,0.28)' },
];

export const conditionById = (id?: ConditionId | null): ConditionDef | undefined =>
  CONDITIONS.find(c => c.id === id);

// FDI charting order (patient's right appears on the chart's left).
export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const QUADRANT_NAMES: Record<string, string> = {
  '1': 'Upper Right', '2': 'Upper Left', '3': 'Lower Left', '4': 'Lower Right',
};
const UNIT_NAMES: Record<string, string> = {
  '1': 'Central Incisor', '2': 'Lateral Incisor', '3': 'Canine',
  '4': 'First Premolar', '5': 'Second Premolar',
  '6': 'First Molar', '7': 'Second Molar', '8': 'Third Molar',
};

export function toothName(fdi: number): string {
  const s = String(fdi);
  return `${QUADRANT_NAMES[s[0]] || ''} ${UNIT_NAMES[s[1]] || ''}`.trim();
}

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'molar';

export function toothType(fdi: number): ToothType {
  const unit = fdi % 10;
  if (unit <= 2) return 'incisor';
  if (unit === 3) return 'canine';
  if (unit <= 5) return 'premolar';
  return 'molar';
}

export const SURFACE_NAMES: Record<SurfaceKey, string> = {
  M: 'Mesial', D: 'Distal', B: 'Buccal/Facial', L: 'Lingual/Palatal', O: 'Occlusal/Incisal',
};

// ----------------------------------------------------------------------------
// ARCH GEOMETRY — teeth placed along a full-mouth ellipse with equal arc
// spacing. Angles are "chart degrees": 0 = up, clockwise positive.
// ----------------------------------------------------------------------------

export interface ToothPlacement {
  fdi: number;
  x: number;
  y: number;
  /** Direction pointing OUT of the mouth (Buccal) in chart degrees */
  outwardDeg: number;
  /** Direction pointing toward the dental midline neighbor (Mesial) */
  mesialDeg: number;
  isUpper: boolean;
}

const toChartDeg = (vx: number, vy: number): number =>
  (Math.atan2(vx, -vy) * 180) / Math.PI;

/** Equal-arc-length points along an ellipse between two parametric angles. */
function equalArcPoints(
  cx: number, cy: number, a: number, b: number,
  tStartDeg: number, tEndDeg: number, n: number
): Array<{ x: number; y: number; outwardDeg: number }> {
  const SAMPLES = 1440;
  const pts: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = ((tStartDeg + ((tEndDeg - tStartDeg) * i) / SAMPLES) * Math.PI) / 180;
    pts.push({ x: cx + a * Math.cos(t), y: cy - b * Math.sin(t), t });
  }
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const out: Array<{ x: number; y: number; outwardDeg: number }> = [];
  for (let k = 0; k < n; k++) {
    const target = (total * (k + 0.5)) / n;
    let i = cum.findIndex(c => c >= target);
    if (i < 0) i = pts.length - 1;
    const p = pts[i];
    // Outward normal of the ellipse at parameter t (screen coords, y down)
    const nx = Math.cos(p.t) / a;
    const ny = -Math.sin(p.t) / b;
    out.push({ x: p.x, y: p.y, outwardDeg: toChartDeg(nx, ny) });
  }
  return out;
}

export interface ArchLayout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  placements: ToothPlacement[];
}

export function computeArchLayout(): ArchLayout {
  const width = 780;
  const height = 600;
  const cx = width / 2;
  const cy = height / 2;
  const a = 310; // horizontal semi-axis
  const b = 218; // vertical semi-axis

  // Upper arch sweeps the top half left→right; lower sweeps the bottom half.
  // The gaps near ±180°/0° keep the arch ends from colliding.
  const upperPts = equalArcPoints(cx, cy, a, b, 171, 9, UPPER_TEETH.length);
  const lowerPts = equalArcPoints(cx, cy, a, b, 189, 351, LOWER_TEETH.length);

  const build = (fdis: number[], pts: typeof upperPts, isUpper: boolean): ToothPlacement[] =>
    fdis.map((fdi, i) => {
      // Mesial = toward the midline neighbor. Centrals (index 7 & 8 in the
      // chart order) point at each other across the midline.
      const centerIdx = fdis.length / 2 - 0.5; // 7.5
      const neighbor = pts[i < centerIdx ? i + 1 : i - 1];
      const mesialDeg = toChartDeg(neighbor.x - pts[i].x, neighbor.y - pts[i].y);
      return { fdi, x: pts[i].x, y: pts[i].y, outwardDeg: pts[i].outwardDeg, mesialDeg, isUpper };
    });

  return {
    width,
    height,
    cx,
    cy,
    placements: [...build(UPPER_TEETH, upperPts, true), ...build(LOWER_TEETH, lowerPts, false)],
  };
}

// Glyph radii per tooth type (occlusal-view footprint)
export const TOOTH_RADII: Record<ToothType, number> = {
  molar: 21.5,
  premolar: 19,
  canine: 17.5,
  incisor: 16,
};
