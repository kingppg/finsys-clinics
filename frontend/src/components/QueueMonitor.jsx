import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useClinic } from './ClinicContext';
import socket from '../socket';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import { LuArmchair, LuTv, LuCopy, LuExternalLink, LuUsers, LuUserCheck, LuClock, LuLink, LuCheck, LuQrCode } from 'react-icons/lu';
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
  const [queue, setQueue]           = useState([]);
  const [patients, setPatients]     = useState([]);
  const [queueToken, setQueueToken] = useState('');
  const [stationsInput, setStationsInput] = useState(1);
  const [savingStations, setSavingStations] = useState(false);
  const [stationsSaved, setStationsSaved]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const qrCanvasRef                 = useRef(null);

  const queueUrl = queueToken ? `${BASE_URL}/queue-display?token=${queueToken}` : '';

  // ── fetch clinic settings ──────────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId) return;
    supabase
      .from('clinics')
      .select('queue_token, queue_stations')
      .eq('id', clinicId)
      .single()
      .then(({ data }) => {
        if (data?.queue_token) setQueueToken(data.queue_token);
        if (data?.queue_stations) {
          setStationsInput(data.queue_stations);
        }
      });
  }, [clinicId]);

  // ── generate QR code ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!queueUrl || !qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, queueUrl, {
      width: 120,
      margin: 1,
      color: { dark: '#0f2340', light: '#ffffff' }
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

  // ── save stations ──────────────────────────────────────────────────────────
  const handleSaveStations = async () => {
    const val = Math.max(1, parseInt(stationsInput, 10) || 1);
    setSavingStations(true);
    await supabase
      .from('clinics')
      .update({ queue_stations: val })
      .eq('id', clinicId);
    setStationsInput(val);
    setSavingStations(false);
    setStationsSaved(true);
    setTimeout(() => setStationsSaved(false), 2000);
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const getPatientFirstName = (patientId) => {
    const p = patients.find(p => String(p.id) === String(patientId));
    return p ? firstName(p.name) : '—';
  };

  // Live preview: the picker drives the display immediately; Save persists it
  // to the DB for the public monitor.
  const effectiveStations = Math.max(1, parseInt(stationsInput, 10) || 1);
  const nowServingList = queue.slice(0, effectiveStations);
  const waitingList    = queue.slice(effectiveStations);

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
    <div className="dc-page qm-root">

      {/* Standard header */}
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Operations</div>
          <h1 className="dc-page-title">Queue Monitor</h1>
        </div>
        <div className="dc-page-header-actions">
          <span className="qm-live-badge"><span className="qm-live-dot" /> Live</span>
        </div>
      </header>

      {/* Stations config */}
      <div className="qm-stations-bar">
        <span className="qm-stations-label"><LuArmchair /> Active Chairs / Stations</span>
        <input
          type="number"
          min={1}
          value={stationsInput}
          onChange={e => setStationsInput(e.target.value)}
          className="qm-stations-input"
        />
        <button className="dc-btn dc-btn--primary" onClick={handleSaveStations} disabled={savingStations}>
          {savingStations ? 'Saving…' : 'Save'}
        </button>
        {stationsSaved && <span className="qm-copy-feedback">✓ Saved!</span>}
        <span className="qm-stations-hint">
          First {effectiveStations} checked-in patient{effectiveStations !== 1 ? 's' : ''} = Now Serving
        </span>
      </div>

      {/* Count stat tiles */}
      <div className="qm-count-row">
        <div className="qm-stat">
          <span className="qm-stat-icon"><LuUsers /></span>
          <div className="qm-stat-body">
            <span className="qm-stat-num">{queue.length}</span>
            <span className="qm-stat-label">In queue today</span>
          </div>
        </div>
        <div className="qm-stat qm-stat--serving">
          <span className="qm-stat-icon"><LuUserCheck /></span>
          <div className="qm-stat-body">
            <span className="qm-stat-num">{nowServingList.length}</span>
            <span className="qm-stat-label">Being served</span>
          </div>
        </div>
        <div className="qm-stat">
          <span className="qm-stat-icon"><LuClock /></span>
          <div className="qm-stat-body">
            <span className="qm-stat-num">{waitingList.length}</span>
            <span className="qm-stat-label">Waiting</span>
          </div>
        </div>
      </div>

      {/* Now Serving */}
      <div className="qm-section-label">Now Serving</div>
      <div className="qm-serving-row">
        {Array.from({ length: effectiveStations }).map((_, idx) => {
          const appt = nowServingList[idx];
          if (!appt) {
            return (
              <div className="qm-serving-empty" key={idx}>
                <span className="qm-serving-empty-icon"><LuArmchair /></span>
                <div className="qm-serving-empty-label">Station {idx + 1}</div>
                <div className="qm-serving-empty-sub">Open</div>
              </div>
            );
          }
          const name = getPatientFirstName(appt.patient_id);
          return (
            <motion.div
              className="qm-serving-card"
              key={appt.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              <span className="qm-serving-watermark">{idx + 1}</span>
              <div className="qm-serving-inner">
                <div className="qm-serving-label">Station {idx + 1}</div>
                <div className="qm-serving-avatar">{name.charAt(0).toUpperCase()}</div>
                <div className="qm-serving-name">{name}</div>
                <div className="qm-serving-status"><span className="qm-serving-status-dot" /> Serving now</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Waiting */}
      <div className="qm-waiting-card">
        <div className="qm-waiting-title">Waiting</div>
        <div className="qm-waiting-list">
          {waitingList.length === 0 ? (
            <div className="qm-waiting-empty">No one waiting</div>
          ) : (
            waitingList.map((appt, idx) => {
              const name = getPatientFirstName(appt.patient_id);
              return (
                <motion.div
                  className="qm-waiting-item"
                  key={appt.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                >
                  <div className="qm-waiting-pos">{effectiveStations + idx + 1}</div>
                  <div className="qm-waiting-avatar">{name.charAt(0).toUpperCase()}</div>
                  <div className="qm-waiting-name">{name}</div>
                  {idx === 0 && <span className="qm-waiting-chip">Up next</span>}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Monitor setup */}
      <div className="qm-setup-card">
        <div className="qm-setup-head">
          <span className="qm-setup-icon"><LuTv /></span>
          <div>
            <div className="qm-setup-title">Display on Monitor</div>
            <div className="qm-setup-desc">
              Cast the live queue to a TV or monitor in your waiting area — set it up once and bookmark it.
            </div>
          </div>
        </div>

        <div className="qm-setup-body">
          <div className="qm-setup-left">
            <div className="qm-url-box">
              <LuLink className="qm-url-icon" />
              <span className="qm-url-text">{queueUrl || 'Loading…'}</span>
              <button className="qm-url-copy" onClick={handleCopy} disabled={!queueUrl} title="Copy URL">
                {copied ? <LuCheck /> : <LuCopy />}
              </button>
            </div>
            <div className="qm-setup-actions">
              <button className="dc-btn dc-btn--primary" onClick={handleOpenMonitor} disabled={!queueUrl}>
                <LuExternalLink /> Open on Monitor
              </button>
              <button className="dc-btn dc-btn--ghost" onClick={handleCopy} disabled={!queueUrl}>
                {copied ? '✓ Copied!' : <><LuCopy /> Copy URL</>}
              </button>
            </div>
            <div className="qm-steps">
              <div className="qm-step"><span className="qm-step-num">1</span> Open it in a new window</div>
              <div className="qm-step"><span className="qm-step-num">2</span> Drag the window onto your TV screen</div>
              <div className="qm-step"><span className="qm-step-num">3</span> Press F11 for fullscreen</div>
            </div>
          </div>

          <div className="qm-qr-wrap">
            <div className="qm-qr-frame">
              <canvas ref={qrCanvasRef} className="qm-qr-box" />
            </div>
            <div className="qm-qr-label"><LuQrCode /> Scan to open</div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default QueueMonitor;
