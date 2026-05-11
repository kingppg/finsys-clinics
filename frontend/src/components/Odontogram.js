import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONDITIONS = [
  { id: 'caries',     label: 'Caries',         color: '#fecaca', stroke: '#ef4444' },
  { id: 'filling',    label: 'Filling',         color: '#bfdbfe', stroke: '#3b82f6' },
  { id: 'crown',      label: 'Crown',           color: '#fde68a', stroke: '#d97706' },
  { id: 'missing',    label: 'Missing',         color: '#e5e7eb', stroke: '#9ca3af' },
  { id: 'rct',        label: 'Root Canal',      color: '#ede9fe', stroke: '#7c3aed' },
  { id: 'extraction', label: 'For Extraction',  color: '#fee2e2', stroke: '#dc2626' },
  { id: 'implant',    label: 'Implant',         color: '#d1fae5', stroke: '#059669' },
  { id: 'crown_bridge', label: 'Bridge/Crown',  color: '#fef3c7', stroke: '#f59e0b' },
  { id: 'healthy',    label: 'Healthy/Normal',  color: '#d1fae5', stroke: '#10b981' },
];

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function condColor(id)   { return CONDITIONS.find(c => c.id === id)?.color  ?? '#f9fafb'; }
function condStroke(id)  { return CONDITIONS.find(c => c.id === id)?.stroke ?? '#d1d5db'; }

// ─── Single Tooth SVG ─────────────────────────────────────────────────────────

function ToothSVG({ num, data = {}, onSurfaceClick }) {
  const W = 34, H = 42, cx = W / 2, cy = H / 2;
  const { whole, surfaces = {} } = data;

  const handleClick = (e) => {
    e.stopPropagation();
    onSurfaceClick(num, e.currentTarget.dataset.surf || null);
  };

  if (whole === 'missing') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', cursor: 'pointer' }} onClick={handleClick} data-surf={null}>
        <rect x="1" y="1" width={W - 2} height={H - 2} rx="5" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="0.8" />
        <line x1="5" y1="5" x2={W - 5} y2={H - 5} stroke="#9ca3af" strokeWidth="1.5" />
        <line x1={W - 5} y1="5" x2="5" y2={H - 5} stroke="#9ca3af" strokeWidth="1.5" />
      </svg>
    );
  }

  const wholeFill   = whole ? condColor(whole)  : '#f9fafb';
  const wholeStroke = whole ? condStroke(whole) : '#e5e7eb';

  const sf = (key) => surfaces[key] ? condColor(surfaces[key])  : 'rgba(0,0,0,0.04)';
  const ss = (key) => surfaces[key] ? condStroke(surfaces[key]) : '#d1d5db';

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', cursor: 'pointer' }}>
      {/* Base tooth */}
      <rect
        x="1" y="1" width={W - 2} height={H - 2} rx="5"
        fill={wholeFill} stroke={wholeStroke} strokeWidth="0.8"
        data-surf={null} onClick={handleClick}
        style={{ cursor: 'pointer' }}
      />

      {/* Surfaces — only when no whole-tooth condition */}
      {!whole && (
        <>
          {/* Buccal top */}
          <polygon
            points={`${cx},${cy} 4,4 ${W - 4},4`}
            fill={sf('B')} stroke={ss('B')} strokeWidth="0.5"
            data-surf="B" onClick={handleClick}
          />
          {/* Lingual bottom */}
          <polygon
            points={`${cx},${cy} 4,${H - 4} ${W - 4},${H - 4}`}
            fill={sf('L')} stroke={ss('L')} strokeWidth="0.5"
            data-surf="L" onClick={handleClick}
          />
          {/* Mesial left */}
          <polygon
            points={`${cx},${cy} 4,4 4,${H - 4}`}
            fill={sf('M')} stroke={ss('M')} strokeWidth="0.5"
            data-surf="M" onClick={handleClick}
          />
          {/* Distal right */}
          <polygon
            points={`${cx},${cy} ${W - 4},4 ${W - 4},${H - 4}`}
            fill={sf('D')} stroke={ss('D')} strokeWidth="0.5"
            data-surf="D" onClick={handleClick}
          />
          {/* Occlusal center */}
          <rect
            x={cx - 7} y={cy - 7} width="14" height="14" rx="2"
            fill={sf('O')} stroke={ss('O')} strokeWidth="0.5"
            data-surf="O" onClick={handleClick}
          />
        </>
      )}

      {/* Crown dashed outline */}
      {(whole === 'crown' || whole === 'crown_bridge') && (
        <rect x="4" y="4" width={W - 8} height={H - 8} rx="4"
          fill="none" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3,2" />
      )}

      {/* Implant lines */}
      {whole === 'implant' && (
        <>
          <line x1={cx} y1="6" x2={cx} y2={H - 6} stroke="#059669" strokeWidth="2" />
          <line x1={cx - 5} y1={H / 3} x2={cx + 5} y2={H / 3} stroke="#059669" strokeWidth="1.5" />
          <line x1={cx - 5} y1={H * 2 / 3} x2={cx + 5} y2={H * 2 / 3} stroke="#059669" strokeWidth="1.5" />
        </>
      )}

      {/* Extraction X */}
      {whole === 'extraction' && (
        <>
          <line x1="6" y1="6" x2={W - 6} y2={H - 6} stroke="#dc2626" strokeWidth="2" />
          <line x1={W - 6} y1="6" x2="6" y2={H - 6} stroke="#dc2626" strokeWidth="2" />
        </>
      )}

      {/* RCT cross */}
      {whole === 'rct' && (
        <>
          <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke="#7c3aed" strokeWidth="1.5" />
          <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} stroke="#7c3aed" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

// ─── Main Odontogram Component ────────────────────────────────────────────────

export default function Odontogram({ patientId, clinicId, patientName }) {
  const [toothData, setToothData]         = useState({});
  const [selectedCond, setSelectedCond]   = useState('caries');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [loading, setLoading]             = useState(true);
  const [saveMsg, setSaveMsg]             = useState('');
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [confirmClear, setConfirmClear]   = useState(false);

  // ── Load from Supabase ──
  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    supabase
      .from('odontograms')
      .select('tooth_data, notes, updated_at')
      .eq('patient_id', patientId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('Odontogram load error:', error);
        if (data) {
          setToothData(data.tooth_data || {});
          setNotes(data.notes || '');
          setLastUpdated(data.updated_at);
        }
        setLoading(false);
      });
  }, [patientId]);

  // ── Save to Supabase ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg('');
    const payload = {
      patient_id: patientId,
      clinic_id:  clinicId,
      tooth_data: toothData,
      notes,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('odontograms')
      .upsert(payload, { onConflict: 'patient_id' });

    setSaving(false);
    if (error) {
      setSaveMsg('❌ Failed to save. Please try again.');
      console.error(error);
    } else {
      setSaveMsg('✓ Saved successfully');
      setLastUpdated(new Date().toISOString());
      setTimeout(() => setSaveMsg(''), 2500);
    }
  }, [patientId, clinicId, toothData, notes]);

  // ── Tooth interaction ──
  const handleSurfaceClick = useCallback((num, surf) => {
    setToothData(prev => {
      const td = prev[num] || { whole: null, surfaces: {} };

      if (selectedCond === 'missing') {
        const isMissing = td.whole === 'missing';
        return {
          ...prev,
          [num]: isMissing
            ? { whole: null, surfaces: {} }
            : { whole: 'missing', surfaces: {} },
        };
      }

      if (surf) {
        // Surface-level click — clear whole-tooth condition
        const curSurf = td.surfaces?.[surf];
        return {
          ...prev,
          [num]: {
            whole: null,
            surfaces: {
              ...td.surfaces,
              [surf]: curSurf === selectedCond ? null : selectedCond,
            },
          },
        };
      }

      // Whole-tooth click
      const isSet = td.whole === selectedCond;
      return {
        ...prev,
        [num]: isSet
          ? { whole: null, surfaces: {} }
          : { whole: selectedCond, surfaces: {} },
      };
    });
  }, [selectedCond]);

  const clearAll = () => setConfirmClear(true);
  const confirmClearAll = () => { setToothData({}); setConfirmClear(false); };

  // ── Render arch (row of teeth) ──
  const renderArch = (teeth, isUpper) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, alignItems: isUpper ? 'flex-end' : 'flex-start' }}>
      {teeth.map((num, idx) => (
        <React.Fragment key={num}>
          {/* Midline separator */}
          {idx === 8 && (
            <div style={{ width: 1, background: '#d1d5db', margin: '0 3px', alignSelf: 'stretch' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {isUpper && (
              <span style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1 }}>{num}</span>
            )}
            <ToothSVG
              num={num}
              data={toothData[num] || {}}
              onSurfaceClick={handleSurfaceClick}
            />
            {!isUpper && (
              <span style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1 }}>{num}</span>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  // ── UI ──
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
        Loading odontogram…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {CONDITIONS.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCond(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 6,
              border: selectedCond === c.id ? `1.5px solid ${c.stroke}` : '1px solid #e5e7eb',
              background: selectedCond === c.id ? c.color : '#fff',
              cursor: 'pointer', fontSize: 12,
              fontWeight: selectedCond === c.id ? 600 : 400,
              color: '#374151',
              transition: 'all 0.12s',
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: c.color, border: `1px solid ${c.stroke}`,
            }} />
            {c.label}
          </button>
        ))}
      </div>

      {/* ── Upper arch ── */}
      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Upper jaw (maxillary)
      </div>
      {renderArch(UPPER_TEETH, true)}

      {/* ── Divider ── */}
      <div style={{ width: '100%', height: 1, background: '#e5e7eb', margin: '8px 0' }} />

      {/* ── Lower arch ── */}
      {renderArch(LOWER_TEETH, false)}
      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Lower jaw (mandibular)
      </div>

      {/* ── Surface legend ── */}
      <div style={{
        marginTop: 14, background: '#f9fafb', borderRadius: 8,
        border: '1px solid #e5e7eb', padding: '10px 14px',
        display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6b7280',
      }}>
        {[['B','Buccal/Facial'],['L','Lingual/Palatal'],['M','Mesial'],['D','Distal'],['O','Occlusal/Incisal']].map(([k, v]) => (
          <span key={k}><strong>{k}</strong> = {v}</span>
        ))}
        <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>Click surface triangle • Click tooth body = whole tooth</span>
      </div>

      {/* ── Notes ── */}
      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
          Clinical Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Enter observations, treatment plan notes, or remarks…"
          rows={3}
          style={{
            width: '100%', borderRadius: 6, border: '1px solid #d1d5db',
            padding: '8px 10px', fontSize: 13, resize: 'vertical',
            fontFamily: 'inherit', color: '#111827', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#185abd', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 22px', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Odontogram'}
        </button>
        <button
          onClick={clearAll}
          style={{
            background: '#fff', color: '#e74c3c', border: '1px solid #e74c3c',
            borderRadius: 6, padding: '8px 16px', fontWeight: 500,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          Clear All
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith('✓') ? '#059669' : '#dc2626' }}>
            {saveMsg}
          </span>
        )}
        {lastUpdated && !saveMsg && (
          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
            Last saved: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
      </div>
      {/* ── Custom Clear Confirm Modal ── */}
      {confirmClear && (
        <div
          onClick={() => setConfirmClear(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: '28px 32px',
              maxWidth: 380, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              textAlign: 'center',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#fee2e2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px',
              fontSize: 24,
            }}>
              🗑️
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: '#111827' }}>
              Clear all markings?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              This will remove all tooth conditions for{' '}
              <strong style={{ color: '#374151' }}>{patientName || 'this patient'}</strong>.
              This action cannot be undone unless you save first.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 7,
                  border: '1.5px solid #d1d5db', background: '#fff',
                  color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 7,
                  border: 'none', background: '#e74c3c',
                  color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                Yes, clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}