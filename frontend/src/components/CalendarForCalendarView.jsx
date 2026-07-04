import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FaExclamationTriangle } from "react-icons/fa";
import './CalendarView.css';

// Status colors are theme-driven: each references a --cal-* variable defined
// once on .cal-root (CalendarView.css), which maps to the active theme tokens.
const STATUS_CONFIG = {
  confirmed:    { label: "Confirmed",  color: "var(--cal-confirmed)" },
  scheduled:    { label: "Scheduled",  color: "var(--cal-scheduled)" },
  completed:    { label: "Completed",  color: "var(--cal-completed)" },
  "checked-in": { label: "Checked-In", color: "var(--cal-checkedin)" },
  "no show":    { label: "No Show",    color: "var(--cal-noshow)" },
  cancelled:    { label: "Cancelled",  color: "var(--cal-cancelled)" },
};

const ALL_STATUSES = ["confirmed", "scheduled", "completed", "checked-in", "no show", "cancelled"];
const STALE_STATUSES = new Set(["confirmed", "scheduled", "checked-in"]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeStatus(raw) {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (s === "checked in" || s === "checked-in") return "checked-in";
  return s;
}

function getDaysInMonth(year, month) {
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => i + 1);
}
function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}
function isPastDay(year, month, day) {
  const today = new Date();
  const cellDate = new Date(year, month, day);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return cellDate < todayDate;
}

function groupAppointmentsByDay(appointments, year, month) {
  const out = {};
  appointments.forEach(a => {
    const d = new Date(a.appointment_time);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!out[day]) out[day] = { total: 0, statusCount: {} };
      out[day].total += 1;
      const status = normalizeStatus(a.status);
      out[day].statusCount[status] = (out[day].statusCount[status] || 0) + 1;
    }
  });
  return out;
}

function getMonthStatusSummary(grouped, year, month) {
  let total = 0, staleCount = 0;
  const statusCounts = {};
  Object.entries(grouped).forEach(([dayStr, day]) => {
    const dayNum = parseInt(dayStr);
    const past = isPastDay(year, month, dayNum);
    Object.entries(day.statusCount).forEach(([stat, count]) => {
      statusCounts[stat] = (statusCounts[stat] || 0) + count;
      total += count;
      if (past && STALE_STATUSES.has(stat)) staleCount += count;
    });
  });
  return { total, statusCounts, staleCount };
}

// Animated count-up (easeOutCubic) for the KPI numbers.
function useCountUp(target, ms = 650) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (target - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function CountUp({ value }) {
  return <span className="cal-kpi-num">{useCountUp(value)}</span>;
}

function StatusBar({ statusCount }) {
  const segs = ALL_STATUSES.filter(s => statusCount[s] > 0);
  return (
    <div className="cal-bar">
      {segs.map(s => (
        <span
          key={s}
          className="cal-bar-seg"
          style={{ flexGrow: statusCount[s], background: STATUS_CONFIG[s].color }}
        />
      ))}
    </div>
  );
}

function CalendarCell({ dayNum, dow, total, statusCounts, intensity, highlight, onClick, year, month, variants }) {
  const nonzero = ALL_STATUSES.filter(s => statusCounts[s] > 0);
  const past = isPastDay(year, month, dayNum);
  const hasStale = past && nonzero.some(s => STALE_STATUSES.has(s));
  const isWeekend = dow === 0 || dow === 6;

  const cls = [
    "cal-cell",
    total === 0 ? "cal-cell--empty" : "",
    isWeekend ? "cal-cell--weekend" : "",
    hasStale && !highlight ? "cal-cell--stale" : "",
    highlight ? "cal-cell--today" : "",
  ].filter(Boolean).join(" ");

  const shown = nonzero.slice(0, 4);
  const more = nonzero.length - shown.length;
  const breakdown = nonzero
    .map(s => `${STATUS_CONFIG[s].label}: ${statusCounts[s]}`)
    .join("  •  ");

  return (
    <motion.div
      className={cls}
      style={{ "--i": intensity }}
      variants={variants}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      onClick={onClick}
      title={total > 0 ? `${total} appointment${total > 1 ? "s" : ""} — ${breakdown}${hasStale ? "  (needs status update)" : ""}` : undefined}
    >
      <div className="cal-cell-top">
        <span className="cal-daynum">{dayNum}</span>
        {highlight && <span className="cal-today-pill">TODAY</span>}
        {total > 0 && (
          <span className={`cal-count${hasStale ? " cal-count--stale" : ""}`}>{total}</span>
        )}
      </div>

      {total > 0 && (
        <div className="cal-cell-foot">
          <div className="cal-dots">
            {shown.map(s => (
              <span key={s} className="cal-dot" style={{ "--dot": STATUS_CONFIG[s].color }}>
                {statusCounts[s]}
              </span>
            ))}
            {more > 0 && <span className="cal-dot cal-dot--more">+{more}</span>}
          </div>
          <StatusBar statusCount={statusCounts} />
        </div>
      )}
    </motion.div>
  );
}

function CalendarWidget({ appointments, month, year, onPrevMonth, onNextMonth, onDateClick, onToday }) {
  const days = getDaysInMonth(year, month);
  const grouped = groupAppointmentsByDay(appointments, year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();
  const blankDays = Array.from({ length: firstDay });
  const maxDay = Math.max(1, ...days.map(d => (grouped[d]?.total || 0)));

  const isToday = (day) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  const monthName = new Date(year, month).toLocaleString("default", { month: "long" });
  const { total, statusCounts, staleCount } = getMonthStatusSummary(grouped, year, month);

  const activeStatuses = ALL_STATUSES.filter(s => statusCounts[s] > 0);

  // Stagger cells in on mount / month change
  const container = { hidden: {}, show: { transition: { staggerChildren: 0.012 } } };
  const cellVariant = {
    hidden: { opacity: 0, y: 8, scale: 0.97 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 500, damping: 30 } },
  };

  return (
    <div className="cal-card">
      {/* HEADER */}
      <div className="cal-head">
        <div className="cal-head-left">
          <button className="cal-nav-btn" onClick={onPrevMonth} aria-label="Previous Month">‹</button>
          <button className="cal-nav-btn" onClick={onNextMonth} aria-label="Next Month">›</button>
          <span className="cal-title">
            {monthName}<span className="cal-title-year">{year}</span>
          </span>
          {onToday && <button className="cal-today-btn" onClick={onToday}>Today</button>}
        </div>

        <div className="cal-kpis">
          <div className="cal-kpi cal-kpi--total">
            <CountUp value={total} />
            <span className="cal-kpi-label">Total</span>
          </div>
          {activeStatuses.map(s => (
            <div key={s} className="cal-kpi">
              <span className="cal-kpi-dot" style={{ "--dot": STATUS_CONFIG[s].color }} />
              <CountUp value={statusCounts[s]} />
              <span className="cal-kpi-label">{STATUS_CONFIG[s].label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stale banner */}
      {staleCount > 0 && (
        <div className="cal-stale-banner">
          <FaExclamationTriangle className="cal-stale-icon" />
          <span>
            <strong>{staleCount} past appointment{staleCount > 1 ? "s" : ""}</strong> still marked as Confirmed, Scheduled, or Checked-In — please update their status.
          </span>
        </div>
      )}

      {/* Weekday headers */}
      <div className="cal-weekdays">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`cal-weekday${i === 0 || i === 6 ? " cal-weekday--wknd" : ""}`}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <motion.div
        className="cal-grid"
        key={`${year}-${month}`}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {blankDays.map((_, i) => <div key={"blank-" + i} />)}
        {days.map(dayNum => {
          const info = grouped[dayNum] || { total: 0, statusCount: {} };
          const dow = new Date(year, month, dayNum).getDay();
          return (
            <CalendarCell
              key={dayNum}
              dayNum={dayNum}
              dow={dow}
              total={info.total}
              statusCounts={info.statusCount}
              intensity={info.total / maxDay}
              highlight={isToday(dayNum)}
              onClick={() => onDateClick && onDateClick({ year, month, day: dayNum })}
              year={year}
              month={month}
              variants={cellVariant}
            />
          );
        })}
      </motion.div>

      <div className="cal-hint">💡 Click any date to view appointments for that day</div>
    </div>
  );
}

export default CalendarWidget;
