import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { DcThemeProvider } from '../../themes/DcThemeProvider';
import {
  CONDITIONS,
  ConditionId,
  SURFACE_NAMES,
  SurfaceKey,
  ToothData,
  ToothRecord,
  computeArchLayout,
  conditionById,
  toothName,
} from './odontogramData';
import ToothGlyph from './ToothGlyph';
import './Odontogram.css';

// ============================================================================
// ODONTOGRAM — full-mouth anatomical chart (Dark Executive)
// Same persistence contract as the legacy component: one odontograms row per
// patient, upserted on demand. Presentation and interaction are new:
// oval arch layout, anatomically-oriented surface rings, live center panel,
// per-condition counts, undo, and unsaved-change tracking.
// ============================================================================

interface OdontogramProps {
  patientId: number;
  clinicId: number;
  patientName?: string;
}

const LAYOUT = computeArchLayout();
const MAX_UNDO = 30;

function countConditions(toothData: ToothData): Record<ConditionId, number> {
  const counts = Object.fromEntries(CONDITIONS.map(c => [c.id, 0])) as Record<ConditionId, number>;
  for (const rec of Object.values(toothData)) {
    if (!rec) continue;
    const seen = new Set<ConditionId>();
    if (rec.whole) seen.add(rec.whole);
    for (const v of Object.values(rec.surfaces || {})) {
      if (v) seen.add(v);
    }
    seen.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  }
  return counts;
}

function describeTooth(rec?: ToothRecord): string[] {
  if (!rec) return [];
  const parts: string[] = [];
  if (rec.whole) parts.push(`Whole tooth — ${conditionById(rec.whole)?.label}`);
  for (const [key, val] of Object.entries(rec.surfaces || {})) {
    if (val) parts.push(`${SURFACE_NAMES[key as SurfaceKey]} — ${conditionById(val)?.label}`);
  }
  return parts;
}

function OdontogramInner({ patientId, clinicId, patientName }: OdontogramProps) {
  const [toothData, setToothData] = useState<ToothData>({});
  const [selectedCond, setSelectedCond] = useState<ConditionId>('caries');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Dirty tracking + undo
  const savedSnapshot = useRef<string>('{}|');
  const undoStack = useRef<ToothData[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const snapshot = JSON.stringify(toothData) + '|' + notes;
  const dirty = !loading && snapshot !== savedSnapshot.current;

  // ── Load (unchanged contract) ──
  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    supabase
      .from('odontograms')
      .select('tooth_data, notes, updated_at')
      .eq('patient_id', patientId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) console.error('Odontogram load error:', error);
        const td = (data?.tooth_data as ToothData) || {};
        const n = data?.notes || '';
        setToothData(td);
        setNotes(n);
        setLastUpdated(data?.updated_at || null);
        savedSnapshot.current = JSON.stringify(td) + '|' + n;
        undoStack.current = [];
        setUndoCount(0);
        setLoading(false);
      });
  }, [patientId]);

  // ── Save (unchanged contract) ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    const { error } = await supabase.from('odontograms').upsert(
      {
        patient_id: patientId,
        clinic_id: clinicId,
        tooth_data: toothData,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id' }
    );
    setSaving(false);
    if (error) {
      setSaveMsg('error');
      console.error(error);
    } else {
      savedSnapshot.current = JSON.stringify(toothData) + '|' + notes;
      setLastUpdated(new Date().toISOString());
      setSaveMsg('saved');
      setTimeout(() => setSaveMsg(''), 2500);
    }
  }, [patientId, clinicId, toothData, notes]);

  const pushUndo = (state: ToothData) => {
    undoStack.current.push(state);
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
  };

  const handleUndo = () => {
    const prev = undoStack.current.pop();
    if (prev) {
      setToothData(prev);
      setUndoCount(undoStack.current.length);
    }
  };

  // ── Tooth interaction — identical semantics to the legacy chart ──
  const handleToothClick = useCallback((fdi: number, surface: SurfaceKey | null) => {
    setToothData(prev => {
      pushUndo(prev);
      const key = String(fdi);
      const td: ToothRecord = prev[key] || { whole: null, surfaces: {} };

      if (selectedCond === 'missing') {
        const isMissing = td.whole === 'missing';
        return { ...prev, [key]: isMissing ? { whole: null, surfaces: {} } : { whole: 'missing', surfaces: {} } };
      }

      if (surface) {
        const cur = td.surfaces?.[surface];
        return {
          ...prev,
          [key]: {
            whole: null,
            surfaces: { ...td.surfaces, [surface]: cur === selectedCond ? null : selectedCond },
          },
        };
      }

      const isSet = td.whole === selectedCond;
      return { ...prev, [key]: isSet ? { whole: null, surfaces: {} } : { whole: selectedCond, surfaces: {} } };
    });
  }, [selectedCond]);

  const counts = useMemo(() => countConditions(toothData), [toothData]);
  const markedTeeth = useMemo(
    () => Object.values(toothData).filter(r => r && (r.whole || Object.values(r.surfaces || {}).some(Boolean))).length,
    [toothData]
  );

  const hoveredRecord = hoveredTooth ? toothData[String(hoveredTooth)] : undefined;
  const hoveredDetails = describeTooth(hoveredRecord);

  if (loading) {
    return <div className="odo-loading">Loading dental chart…</div>;
  }

  return (
    <motion.div className="odo-root" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

      {/* ── Condition palette ── */}
      <div className="odo-palette">
        {CONDITIONS.map(c => (
          <button
            key={c.id}
            type="button"
            className={`odo-chip${selectedCond === c.id ? ' active' : ''}`}
            style={{ '--tone': c.color, '--tone-soft': c.soft } as React.CSSProperties}
            onClick={() => setSelectedCond(c.id)}
          >
            <span className="odo-chip-dot" />
            {c.label}
            {counts[c.id] > 0 && <span className="odo-chip-count">{counts[c.id]}</span>}
          </button>
        ))}
      </div>

      {/* ── Chart ── */}
      <div className="odo-chart-wrap">
        <svg
          className="odo-chart"
          viewBox={`0 0 ${LAYOUT.width} ${LAYOUT.height}`}
          role="img"
          aria-label={`Dental chart for ${patientName || 'patient'}`}
        >
          {LAYOUT.placements.map(p => (
            <ToothGlyph
              key={p.fdi}
              fdi={p.fdi}
              x={p.x}
              y={p.y}
              outwardDeg={p.outwardDeg}
              mesialDeg={p.mesialDeg}
              record={toothData[String(p.fdi)]}
              hovered={hoveredTooth === p.fdi}
              onClick={handleToothClick}
              onHover={setHoveredTooth}
            />
          ))}
        </svg>

        {/* Center live panel */}
        <div className="odo-center">
          {hoveredTooth ? (
            <>
              <div className="odo-center-num">{hoveredTooth}</div>
              <div className="odo-center-name">{toothName(hoveredTooth)}</div>
              {hoveredDetails.length > 0 ? (
                <ul className="odo-center-list">
                  {hoveredDetails.map(d => <li key={d}>{d}</li>)}
                </ul>
              ) : (
                <div className="odo-center-clear">No markings</div>
              )}
            </>
          ) : (
            <>
              <div className="odo-center-name">{patientName || 'Dental Chart'}</div>
              <div className="odo-center-stat">
                <strong>{markedTeeth}</strong> of 32 teeth charted
              </div>
              {counts.missing > 0 && (
                <div className="odo-center-stat odo-center-stat--dim">{counts.missing} missing</div>
              )}
              <div className="odo-center-hint">Hover a tooth · Click ring = surface · Click body = whole tooth</div>
            </>
          )}
        </div>

        {/* Quadrant labels */}
        <span className="odo-quad odo-quad--tl">UPPER RIGHT</span>
        <span className="odo-quad odo-quad--tr">UPPER LEFT</span>
        <span className="odo-quad odo-quad--bl">LOWER RIGHT</span>
        <span className="odo-quad odo-quad--br">LOWER LEFT</span>
      </div>

      {/* ── Surface key ── */}
      <div className="odo-surface-key">
        {(Object.entries(SURFACE_NAMES) as Array<[SurfaceKey, string]>).map(([k, v]) => (
          <span key={k}><strong>{k}</strong> {v}</span>
        ))}
        <span className="odo-surface-note">Ring sectors follow real anatomy — Buccal always faces outward, Mesial faces the midline</span>
      </div>

      {/* ── Notes ── */}
      <div className="odo-notes">
        <label>Clinical Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Observations, treatment plan, remarks…"
          rows={3}
        />
      </div>

      {/* ── Actions ── */}
      <div className="odo-actions">
        <button type="button" className="odo-btn-save" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : dirty ? 'Save Chart •' : 'Saved'}
        </button>
        <button type="button" className="odo-btn-ghost" onClick={handleUndo} disabled={undoCount === 0}>
          ↩ Undo{undoCount > 0 ? ` (${undoCount})` : ''}
        </button>
        <button type="button" className="odo-btn-danger" onClick={() => setConfirmClear(true)}>
          Clear All
        </button>
        <span className="odo-status">
          {saveMsg === 'saved' && <span className="odo-status--ok">✓ Saved</span>}
          {saveMsg === 'error' && <span className="odo-status--err">Save failed — try again</span>}
          {!saveMsg && dirty && <span className="odo-status--warn">Unsaved changes</span>}
          {!saveMsg && !dirty && lastUpdated && `Last saved ${new Date(lastUpdated).toLocaleString()}`}
        </span>
      </div>

      {/* ── Clear confirm ── */}
      {confirmClear && (
        <div className="odo-modal-overlay" onClick={() => setConfirmClear(false)}>
          <div className="odo-modal" onClick={e => e.stopPropagation()}>
            <h3>Clear all markings?</h3>
            <p>
              This removes every tooth condition for <strong>{patientName || 'this patient'}</strong>.
              Nothing is permanent until you press Save.
            </p>
            <div className="odo-modal-actions">
              <button type="button" className="odo-btn-ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button
                type="button"
                className="odo-btn-danger odo-btn-danger--solid"
                onClick={() => { pushUndo(toothData); setToothData({}); setConfirmClear(false); }}
              >
                Yes, clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function Odontogram(props: OdontogramProps) {
  return (
    <DcThemeProvider>
      <OdontogramInner {...props} />
    </DcThemeProvider>
  );
}
