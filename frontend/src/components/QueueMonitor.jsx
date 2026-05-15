import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext';
import socket from '../socket';
import QRCode from 'qrcode';
import './QueueMonitor.css';

const BASE_URL = window.location.origin;

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

function QueueMonitor({ clinicId }) {
  const { clinicName } = useClinic();
  const [queue, setQueue]       = useState([]);
  const [patients, setPatients] = useState([]);
  const [queueToken, setQueueToken] = useState('');
  const [copied, setCopied]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const qrCanvasRef             = useRef(null);

  const queueUrl = queueToken ? `${BASE_URL}/queue-display?token=${queueToken}` : '';

  // ── fetch queue token ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    supabase
      .from('clinics')
      .select('queue_token')
      .eq('id', clinicId)
      .single()
      .then(({ data }) => {
        if (data?.queue_token) setQueueToken(data.queue_token);
      });
  }, [clinicId]);

  // ── generate QR code ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!queueUrl || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, queueUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#185abd', light: '#ffffff' }
    });
  }, [queueUrl]);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(queueUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpenMonitor = () => {
    window.open(queueUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="qm-root">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="qm-header">
        <div className="qm-title">🖥️ Queue Monitor</div>
        <span className="qm-live-badge">
          <span className="qm-live-dot" />
          Live
        </span>
      </div>

      {/* ── COUNT ──────────────────────────────────────────────────────────── */}
      <div className="qm-count-row">
        <span className="qm-count-pill">
          {queue.length} in queue today
        </span>
      </div>

      {/* ── QUEUE ROW ──────────────────────────────────────────────────────── */}
      <div className="qm-queue-row">

        {/* NOW SERVING */}
        {loading ? (
          <div className="qm-serving-empty">
            <div>Loading…</div>
          </div>
        ) : nowServing ? (
          <div className="qm-serving-card">
            <div className="qm-serving-label">Now Serving</div>
            <div className="qm-serving-number">1</div>
            <div className="qm-serving-name">{getPatientFirstName(nowServing.patient_id)}</div>
          </div>
        ) : (
          <div className="qm-serving-empty">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🪑</div>
            <div style={{ fontSize: '0.85rem' }}>No one checked in yet</div>
          </div>
        )}

        {/* WAITING LIST */}
        <div className="qm-waiting-card">
          <div className="qm-waiting-title">Waiting</div>
          <div className="qm-waiting-list">
            {waitingList.length === 0 ? (
              <div className="qm-waiting-empty">No one waiting</div>
            ) : (
              waitingList.map((appt, idx) => (
                <div className="qm-waiting-item" key={appt.id}>
                  <div className="qm-waiting-num">{idx + 2}</div>
                  <div className="qm-waiting-name">{getPatientFirstName(appt.patient_id)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── MONITOR SETUP ──────────────────────────────────────────────────── */}
      <div className="qm-setup-card">
        <div className="qm-setup-title">
          📺 Display on Monitor
        </div>
        <div className="qm-setup-desc">
          Open this URL on a TV or monitor in your waiting area. Bookmark it so you only need to set it up once.
        </div>

        <div className="qm-setup-body">
          <div className="qm-setup-left">
            <div className="qm-url-box">
              <span className="qm-url-text">{queueUrl || 'Loading...'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="qm-btn qm-btn-primary" onClick={handleOpenMonitor} disabled={!queueUrl}>
                🖥️ Open on Monitor
              </button>
              <button className="qm-btn qm-btn-outline" onClick={handleCopy} disabled={!queueUrl}>
                {copied ? '✓ Copied!' : '📋 Copy URL'}
              </button>
              {copied && <span className="qm-copy-feedback">URL copied to clipboard!</span>}
            </div>

            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
              💡 Tip: Open in a new window, move it to the TV, then press F11 for fullscreen.
            </div>
          </div>

          {/* QR CODE */}
          <div className="qm-qr-wrap">
            <canvas ref={qrCanvasRef} className="qm-qr-box" />
            <div className="qm-qr-label">Scan to open</div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default QueueMonitor;
