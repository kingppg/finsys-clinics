import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import socket from '../socket';
import './QueueDisplay.css';

// ─── helpers ────────────────────────────────────────────────────────────────

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function isTodayCheckedIn(appt) {
  if (appt.status !== 'Checked-In') return false;
  if (!appt.checked_in_at) return false;
  const d = new Date(appt.checked_in_at);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth()    === now.getUTCMonth()    &&
    d.getUTCDate()     === now.getUTCDate()
  );
}

function firstName(fullName = '') {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function useClockTick() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const TICKER_ITEMS = [
  'Please wait for your number to be called',
  'Thank you for your patience',
  'Please keep your area clean and orderly',
  'Kindly turn your phone to silent mode',
  'Walk-ins are subject to availability',
];

// ─── component ───────────────────────────────────────────────────────────────

function QueueDisplay() {
  const token = getTokenFromUrl();
  const [clinicId, setClinicId]   = useState(null);
  const [clinicName, setClinicName] = useState('');
  const [queue, setQueue]           = useState([]);
  const [patients, setPatients]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [invalid, setInvalid]       = useState(false);
  const now                         = useClockTick();

  // ── resolve token → clinic ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    supabase
      .from('clinics')
      .select('id, name')
      .eq('queue_token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setInvalid(true); setLoading(false); return; }
        setClinicId(data.id);
        setClinicName(data.name);
      });
  }, [token]);

  // ── fetch patients ─────────────────────────────────────────────────────────
  const fetchPatients = useCallback(async () => {
    if (!clinicId) return;
    const { data } = await supabase
      .from('patients')
      .select('id, name')
      .eq('clinic_id', clinicId)
      .eq('deleted', false);
    setPatients(data || []);
  }, [clinicId]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // ── fetch queue ────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    if (!clinicId) return;
    const { data, error } = await supabase
      .from('appointments')
      .select('id, patient_id, status, checked_in_at, clinic_id')
      .eq('clinic_id', clinicId)
      .eq('deleted', false)
      .eq('status', 'Checked-In')
      .order('checked_in_at', { ascending: true });

    if (!error && data) setQueue(data.filter(isTodayCheckedIn));
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // ── socket ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    function handleUpdated(updatedRow) {
      if (String(updatedRow.clinic_id) !== String(clinicId)) return;
      if (isTodayCheckedIn(updatedRow)) {
        setQueue(prev => {
          const exists = prev.some(a => a.id === updatedRow.id);
          const next = exists
            ? prev.map(a => a.id === updatedRow.id ? { ...a, ...updatedRow } : a)
            : [...prev, updatedRow];
          return [...next].sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at));
        });
        fetchPatients();
      } else {
        setQueue(prev => prev.filter(a => a.id !== updatedRow.id));
      }
    }
    socket.on('appointment-updated', handleUpdated);
    return () => socket.off('appointment-updated', handleUpdated);
  }, [clinicId, fetchPatients]);

  // ── derived ────────────────────────────────────────────────────────────────
  const getPatientFirstName = (patientId) => {
    const p = patients.find(p => String(p.id) === String(patientId));
    return p ? firstName(p.name) : '—';
  };

  const nowServing  = queue.length > 0 ? queue[0] : null;
  const waitingList = queue.length > 1 ? queue.slice(1) : [];

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── invalid token ──────────────────────────────────────────────────────────
  if (invalid) {
    return (
      <div className="qd-no-clinic">
        <h2>Queue Display</h2>
        <p>Invalid or missing token.</p>
        <p style={{ fontSize: '0.8rem' }}>Please use the URL provided by your clinic dashboard.</p>
      </div>
    );
  }

  return (
    <div className="qd-root">
      <header className="qd-header">
        <div className="qd-logo-area">
          <div className="qd-clinic-name">{clinicName || 'Clinic'}</div>
          <div className="qd-subtitle">Patient Queue</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="qd-count-pill">
            <span className="qd-live-dot" />
            {queue.length} in queue
          </span>
        </div>
        <div className="qd-clock">
          <div className="qd-time">{timeStr}</div>
          <div className="qd-date">{dateStr}</div>
        </div>
      </header>

      <div className="qd-body">
        <div className="qd-now-serving">
          <div className="qd-section-label">Now Serving</div>
          {loading ? (
            <div className="qd-serving-empty"><div className="qd-serving-empty-text">Loading…</div></div>
          ) : nowServing ? (
            <div className="qd-serving-card">
              <div className="qd-queue-badge">Queue No.</div>
              <div className="qd-serving-number">1</div>
              <div className="qd-serving-name">{getPatientFirstName(nowServing.patient_id)}</div>
            </div>
          ) : (
            <div className="qd-serving-empty">
              <div className="qd-serving-empty-icon">🪑</div>
              <div className="qd-serving-empty-text">No one yet</div>
            </div>
          )}
        </div>

        <div className="qd-waiting">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="qd-section-label">Waiting</div>
            {waitingList.length > 0 && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: 1 }}>
                {waitingList.length} patient{waitingList.length !== 1 ? 's' : ''} waiting
              </span>
            )}
          </div>
          <div className="qd-waiting-list">
            {waitingList.length === 0 ? (
              <div className="qd-waiting-empty">
                <div style={{ fontSize: '2rem', opacity: 0.3 }}>✓</div>
                <div style={{ fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase' }}>No one waiting</div>
              </div>
            ) : (
              [...waitingList].map((appt, idx) => (
                <div className="qd-waiting-item" key={appt.id}>
                  <div className="qd-waiting-num">{idx + 2}</div>
                  <div className="qd-waiting-name">{getPatientFirstName(appt.patient_id)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="qd-ticker-wrap">
        <div className="qd-ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span className="qd-ticker-item" key={i}>
              <span className="qd-ticker-dot" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default QueueDisplay;
