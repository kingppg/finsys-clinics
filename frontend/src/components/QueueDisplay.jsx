import React, { useEffect, useState, useCallback } from 'react';
import socket from '../socket';
import './QueueDisplay.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  'God is good all the time',
  'Thank you for your patience',
  'Please keep your area clean and orderly',
  'Kindly turn your phone to silent mode',
  'Walk-ins are subject to availability',
  'Lamentations 3:22The steadfast love of the Lord never ceases;  his mercies never come to an end; The steadfast love of the Lord never ceases; 3:23they are new every morning; great is your faithfulness.',
];

function QueueDisplay() {
  const token = getTokenFromUrl();
  const [clinicId, setClinicId]     = useState(null);
  const [clinicName, setClinicName] = useState('');
  const [stations, setStations]     = useState(1);
  const [queue, setQueue]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [invalid, setInvalid]       = useState(false);
  const now                         = useClockTick();

  // Load the queue from the PUBLIC, token-scoped endpoint. The TV has no login,
  // so it can't read the RLS-protected patients/appointments tables directly —
  // the backend serves the minimal queue (first names only) with the service key.
  const loadQueue = useCallback(async () => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/queue/${encodeURIComponent(token)}`);
      if (!res.ok) { setInvalid(true); setLoading(false); return; }
      const data = await res.json();
      setClinicId(data.clinic_id);
      setClinicName(data.clinic_name || '');
      setStations(data.stations || 1);
      setQueue((data.queue || [])
        .filter(isTodayCheckedIn)
        .sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at)));
      setInvalid(false);
    } catch {
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Poll so the TV stays fresh even if the socket connection drops.
  useEffect(() => {
    const interval = setInterval(loadQueue, 20000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  // Live refresh on any appointment change for this clinic.
  useEffect(() => {
    if (!clinicId) return;
    function handleUpdated(updatedRow) {
      if (String(updatedRow?.clinic_id) !== String(clinicId)) return;
      loadQueue();
    }
    socket.on('appointment-updated', handleUpdated);
    return () => socket.off('appointment-updated', handleUpdated);
  }, [clinicId, loadQueue]);

  const nowServingList = queue.slice(0, stations);
  const waitingList    = queue.slice(stations);

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
        {/* NOW SERVING */}
        <div className="qd-now-serving">
          <div className="qd-section-label">Now Serving</div>

          {loading ? (
            <div className="qd-serving-empty">
              <div className="qd-serving-empty-text">Loading…</div>
            </div>
          ) : (
            <div
              className="qd-serving-cards-row"
              style={{ gridTemplateColumns: `repeat(${Math.min(stations, 4)}, 1fr)` }}
            >
              {Array.from({ length: stations }).map((_, idx) => {
                const appt = nowServingList[idx];
                return appt ? (
                  <div className="qd-serving-card" key={appt.id}>
                    <div className="qd-queue-badge">Station {idx + 1}</div>
                    <div className="qd-serving-center">
                      <div className="qd-serving-number">{idx + 1}</div>
                      <div className="qd-serving-name">{appt.first_name || '—'}</div>
                    </div>
                    <div className="qd-serving-live"><span className="qd-serving-live-dot" /> Now Serving</div>
                  </div>
                ) : (
                  <div className="qd-serving-empty" key={idx}>
                    <div className="qd-serving-empty-icon">🪑</div>
                    <div className="qd-serving-empty-text">Available</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* WAITING LIST */}
        <div className="qd-waiting">
          <div className="qd-waiting-head">
            <div className="qd-section-label">Waiting</div>
            {waitingList.length > 0 && (
              <span className="qd-waiting-count">
                {waitingList.length} patient{waitingList.length !== 1 ? 's' : ''} waiting
              </span>
            )}
          </div>
          <div className="qd-waiting-list">
            {waitingList.length === 0 ? (
              <div className="qd-waiting-empty">
                <div className="qd-waiting-empty-check">✓</div>
                <div className="qd-waiting-empty-text">No one waiting</div>
              </div>
            ) : (
              waitingList.map((appt, idx) => (
                <div className={`qd-waiting-item${idx === 0 ? ' qd-up-next' : ''}`} key={appt.id}>
                  <div className="qd-waiting-num">{stations + idx + 1}</div>
                  <div className="qd-waiting-name">{appt.first_name || '—'}</div>
                  {idx === 0 && <span className="qd-up-next-chip">Up next</span>}
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
