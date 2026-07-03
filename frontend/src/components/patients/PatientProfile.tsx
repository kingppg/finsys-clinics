import React, { useMemo, useState } from 'react';
import { DcThemeProvider } from '../../themes/DcThemeProvider';
import Odontogram from '../odontogram/Odontogram';
import PatientFiles from './PatientFiles';
import './PatientProfile.css';

// ============================================================================
// PATIENT PROFILE — full-page workstation (Dark Executive)
// Replaces the old cramped profile modal: the Patients list swaps to this
// full-viewport view when a patient's name is clicked. Subtabs host the
// existing Odontogram and PatientFiles components unchanged; Appointment
// History is rendered here with the same data Patients.js already loads.
// ============================================================================

export interface PatientLite {
  id: number;
  name: string;
  phone?: string | null;
  messenger_id?: string | null;
}

export interface AppointmentLite {
  id: number;
  patient_id: number;
  dentist_id: number | null;
  appointment_time: string;
  reason: string | null;
  status: string | null;
}

export interface DentistLite {
  id: number;
  name: string;
}

interface PatientProfileProps {
  patient: PatientLite;
  clinicId: number;
  appointments: AppointmentLite[];
  dentists: DentistLite[];
  onBack: () => void;
}

type TabId = 'history' | 'odontogram' | 'files';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'history',    label: '📋 Appointment History' },
  { id: 'odontogram', label: '🦷 Odontogram' },
  { id: 'files',      label: '🩻 Images & Files' },
];

/** Status → theme tone (cosmetics stay in tokens; this is just a mapping) */
function statusTone(status: string | null | undefined): { tone: string; soft: string } {
  switch ((status || '').toLowerCase()) {
    case 'confirmed': return { tone: 'var(--dc-success, #4ADE80)', soft: 'var(--dc-success-soft, rgba(74,222,128,0.13))' };
    case 'completed': return { tone: 'var(--dc-info, #60A5FA)',    soft: 'var(--dc-info-soft, rgba(96,165,250,0.13))' };
    case 'scheduled': return { tone: 'var(--dc-accent, #2DD4BF)',  soft: 'var(--dc-accent-soft, rgba(45,212,191,0.13))' };
    case 'no show':   return { tone: 'var(--dc-warning, #FBBF24)', soft: 'var(--dc-warning-soft, rgba(251,191,36,0.13))' };
    case 'cancelled': return { tone: 'var(--dc-danger, #F87171)',  soft: 'var(--dc-danger-soft, rgba(248,113,113,0.14))' };
    default:          return { tone: 'var(--dc-text-3, #6E7E98)',  soft: 'var(--dc-surface-2, #1A2438)' };
  }
}

function PatientProfileInner({ patient, clinicId, appointments, dentists, onBack }: PatientProfileProps) {
  const [tab, setTab] = useState<TabId>('history');

  const history = useMemo(
    () =>
      appointments
        .filter(a => a.patient_id === patient.id)
        .sort((a, b) => new Date(b.appointment_time).getTime() - new Date(a.appointment_time).getTime()),
    [appointments, patient.id]
  );

  const dentistName = (id: number | null) =>
    dentists.find(d => String(d.id) === String(id))?.name ?? (id ?? '—');

  return (
    <div className="pp-root">

      {/* ── Header ── */}
      <div className="pp-header">
        <button type="button" className="pp-back" onClick={onBack}>
          ← Back to Patients
        </button>
        <div className="pp-identity">
          <div className="pp-avatar">{(patient.name || '?').trim().charAt(0).toUpperCase()}</div>
          <div className="pp-identity-text">
            <h2 className="pp-name">{patient.name}</h2>
            <div className="pp-contact">
              {patient.phone && <span>📞 {patient.phone}</span>}
              {patient.messenger_id && <span>💬 {patient.messenger_id}</span>}
              <span className="pp-contact-dim">{history.length} appointment{history.length === 1 ? '' : 's'} on record</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="pp-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`pp-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Scrollable body — header + tabs above stay pinned ── */}
      <div className="pp-body">

      {/* ── Tab: Appointment History ── */}
      {tab === 'history' && (
        <div className="pp-panel">
          {history.length === 0 ? (
            <div className="pp-empty">No appointments found for {patient.name}.</div>
          ) : (
            <ul className="pp-history">
              {history.map(a => {
                const t = statusTone(a.status);
                const d = new Date(a.appointment_time);
                return (
                  <li key={a.id} className="pp-history-item">
                    <div className="pp-history-when">
                      <span className="pp-history-date">
                        {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="pp-history-time">
                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="pp-history-body">
                      <div className="pp-history-proc">{a.reason || 'No procedure noted'}</div>
                      <div className="pp-history-dentist">Dentist: {dentistName(a.dentist_id)}</div>
                    </div>
                    <span
                      className="pp-status"
                      style={{ '--tone': t.tone, '--tone-soft': t.soft } as React.CSSProperties}
                    >
                      {a.status || 'Unknown'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Tab: Odontogram (already dc-themed, drops in as-is) ── */}
      {tab === 'odontogram' && (
        <div className="pp-panel pp-panel--flush">
          <Odontogram patientId={patient.id} clinicId={clinicId} patientName={patient.name} />
        </div>
      )}

      {/* ── Tab: Images & Files (already dc-themed, drops in as-is) ── */}
      {tab === 'files' && (
        <div className="pp-panel pp-panel--flush">
          <PatientFiles patientId={patient.id} clinicId={clinicId} patientName={patient.name} />
        </div>
      )}

      </div>
    </div>
  );
}

export default function PatientProfile(props: PatientProfileProps) {
  return (
    <DcThemeProvider>
      <PatientProfileInner {...props} />
    </DcThemeProvider>
  );
}
