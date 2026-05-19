import React from "react";
import { FaCheckCircle, FaCalendarAlt, FaUserTimes, FaTimesCircle, FaUserClock, FaClipboardCheck, FaExclamationTriangle } from "react-icons/fa";

const STATUS_CONFIG = {
  confirmed:    { label: "Confirmed",  color: "#4caf50", icon: <FaCheckCircle /> },
  scheduled:    { label: "Scheduled",  color: "#2196f3", icon: <FaCalendarAlt /> },
  completed:    { label: "Completed",  color: "#673ab7", icon: <FaUserClock /> },
  "checked-in": { label: "Checked-In", color: "#00897b", icon: <FaClipboardCheck /> },
  "no show":    { label: "No Show",    color: "#ff9800", icon: <FaUserTimes /> },
  cancelled:    { label: "Cancelled",  color: "#f44336", icon: <FaTimesCircle /> },
};

const ALL_STATUSES = [
  "confirmed", "scheduled", "completed", "checked-in", "no show", "cancelled"
];

const STALE_STATUSES = new Set(["confirmed", "scheduled", "checked-in"]);

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
      if (!out[day].statusCount[status]) out[day].statusCount[status] = 0;
      out[day].statusCount[status] += 1;
    }
  });
  return out;
}

function getMonthStatusSummary(grouped, year, month) {
  let total = 0;
  let staleCount = 0;
  const statusCounts = {};
  Object.entries(grouped).forEach(([dayStr, day]) => {
    const dayNum = parseInt(dayStr);
    const past = isPastDay(year, month, dayNum);
    Object.entries(day.statusCount).forEach(([stat, count]) => {
      statusCounts[stat] = (statusCounts[stat] || 0) + count;
      total += count;
      if (past && STALE_STATUSES.has(stat)) {
        staleCount += count;
      }
    });
  });
  return { total, statusCounts, staleCount };
}

function CalendarCell({ dayNum, total, statusCounts, highlight, onClick, year, month }) {
  const nonzeroStatusKeys = ALL_STATUSES.filter(
    s => statusCounts[s] && statusCounts[s] > 0
  );
  const past = isPastDay(year, month, dayNum);
  const hasStale = past && nonzeroStatusKeys.some(s => STALE_STATUSES.has(s));

  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 140,
        minHeight: 90,
        border: highlight
          ? "2.4px solid #185abd"
          : hasStale
            ? "1.5px solid #f59e0b"
            : "1px solid #222",
        borderRadius: 10,
        margin: 2,
        padding: 12,
        background: highlight
          ? "#ecf3fe"
          : total > 0
            ? "#f7fff9"
            : "#fff",
        boxSizing: "border-box",
        boxShadow: highlight
          ? "0 3px 24px #2866ee40"
          : hasStale
            ? "0 1.5px 8px #f59e0b28"
            : total > 0
              ? "0 1.5px 8px #2196f317"
              : "0 1px 3px #9992",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        transition: "background .18s, box-shadow .18s",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = highlight ? "#dbeafe" : "#f0f7ff";
        e.currentTarget.style.boxShadow = "0 4px 16px #185abd33";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = highlight ? "#ecf3fe" : total > 0 ? "#f7fff9" : "#fff";
        e.currentTarget.style.boxShadow = highlight
          ? "0 3px 24px #2866ee40"
          : hasStale
            ? "0 1.5px 8px #f59e0b28"
            : total > 0
              ? "0 1.5px 8px #2196f317"
              : "0 1px 3px #9992";
      }}
    >
      <div style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
      }}>
        <span style={{
          fontWeight: 900,
          fontSize: 24,
          color: highlight ? "#185abd" : "#333",
          lineHeight: 1.05,
          letterSpacing: 1
        }}>{dayNum}</span>
        {total > 0 && (
          <span style={{
            fontWeight: 800,
            fontSize: 18,
            background: hasStale ? "#f59e0b" : "#185abd",
            color: "#fff",
            borderRadius: "50%",
            padding: total > 9 ? "4px 9px" : "4px 12px",
            marginLeft: 7,
            transition: "background .18s",
          }}>
            {total}
          </span>
        )}
      </div>
      <div style={{ width: "100%" }}>
        {nonzeroStatusKeys.length === 0 ? (
          <div style={{ color: "#aaa", fontSize: 13, marginTop: 22 }}>No Appointment</div>
        ) : (
          nonzeroStatusKeys.map((status) => {
            const s = STATUS_CONFIG[status];
            const isStale = past && STALE_STATUSES.has(status);
            return (
              <div
                key={status}
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 15,
                  marginBottom: 2,
                  color: s.color,
                  fontWeight: 600,
                  gap: 3,
                  borderRadius: 6,
                  background: isStale ? "#fffbeb" : "#f5f7fa",
                  padding: "1.5px 8px",
                  marginLeft: -4,
                  width: "auto",
                }}
                title={
                  isStale
                    ? `${s.label}: ${statusCounts[status]} appointment${statusCounts[status] > 1 ? "s" : ""} — needs status update!`
                    : `${s.label}: ${statusCounts[status]} appointment${statusCounts[status] > 1 ? "s" : ""}`
                }
              >
                <span style={{ display: "flex", alignItems: "center", marginRight: 3, fontSize: 15 }}>
                  {s.icon}
                </span>
                <span>{statusCounts[status]}</span>
                <span style={{ fontSize: 13, fontWeight: 400 }}>{s.label}</span>
                {isStale && (
                  <span style={{ color: "#f59e0b", fontSize: 13, marginLeft: 2, display: "flex", alignItems: "center" }}>
                    <FaExclamationTriangle />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CalendarWidget({ appointments, month, year, onPrevMonth, onNextMonth, onDateClick }) {
  const days = getDaysInMonth(year, month);
  const grouped = groupAppointmentsByDay(appointments, year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = new Date();
  const blankDays = Array.from({ length: firstDay });

  function isToday(day) {
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  }

  const monthLabel = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
  const { total, statusCounts, staleCount } = getMonthStatusSummary(grouped, year, month);

  const statusSegments = ALL_STATUSES
    .filter(status => statusCounts[status] > 0)
    .map(status => {
      const s = STATUS_CONFIG[status];
      return (
        <span key={status} style={{ color: s.color, fontWeight: 600, marginLeft: 17, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span>{statusCounts[status]}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</span>
        </span>
      );
    });

  return (
    <div style={{
      width: 1150,
      padding: 18,
      background: "#fafcff",
      borderRadius: 22,
      boxShadow: "0 4px 28px #3462db18"
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: staleCount > 0 ? 6 : 13,
      }}>
        <span style={{ display: "flex", alignItems: "center", minWidth: 300 }}>
          <button
            onClick={onPrevMonth}
            style={{
              marginRight: 10, padding: "2px 13px", fontSize: 19,
              border: "none", borderRadius: 8, background: "#e2e8f0",
              color: "#185abd", cursor: "pointer"
            }}
            aria-label="Previous Month"
          >{"<"}</button>
          <span style={{
            fontWeight: 650, fontSize: 23, color: "#2866ee",
            marginRight: 10, letterSpacing: 1, minWidth: 145, textAlign: "left"
          }}>{monthLabel}</span>
          <button
            onClick={onNextMonth}
            style={{
              marginLeft: 0, padding: "2px 13px", fontSize: 19,
              border: "none", borderRadius: 8, background: "#e2e8f0",
              color: "#185abd", cursor: "pointer"
            }}
            aria-label="Next Month"
          >{">"}</button>
        </span>
        <span style={{
          minWidth: 240, textAlign: "right", fontWeight: 650,
          color: "#185abd", fontSize: 17,
        }}>
          Total for the month:&nbsp;
          <span style={{
            background: "#185abd", color: "#fff", borderRadius: 6,
            padding: "1.5px 13px", fontSize: 17, fontWeight: 900
          }}>
            {total}
          </span>
          {statusSegments}
        </span>
      </div>

      {/* Stale warning banner */}
      {staleCount > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#fffbeb",
          border: "1px solid #f59e0b",
          borderRadius: 8,
          padding: "6px 14px",
          marginBottom: 10,
          color: "#92400e",
          fontSize: 14,
          fontWeight: 600,
        }}>
          <FaExclamationTriangle style={{ color: "#f59e0b", fontSize: 15, flexShrink: 0 }} />
          <span>
            <strong>{staleCount} past appointment{staleCount > 1 ? "s" : ""}</strong> still marked as Confirmed, Scheduled, or Checked-In — please update their status.
          </span>
        </div>
      )}

      {/* Day headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 4, marginBottom: 6, color: "#3462db", fontWeight: 600, fontSize: 16
      }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d =>
          <div key={d} style={{ textAlign: "center" }}>{d}</div>
        )}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {blankDays.map((_, i) => <div key={"blank-" + i} />)}
        {days.map(dayNum => {
          const info = grouped[dayNum] || { total: 0, statusCount: {} };
          return (
            <CalendarCell
              key={dayNum}
              dayNum={dayNum}
              total={info.total}
              statusCounts={info.statusCount}
              highlight={isToday(dayNum)}
              onClick={() => onDateClick && onDateClick({ year, month, day: dayNum })}
              year={year}
              month={month}
            />
          );
        })}
      </div>

      {/* Click hint */}
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
        💡 Click any date to view appointments for that day
      </div>
    </div>
  );
}

export default CalendarWidget;
