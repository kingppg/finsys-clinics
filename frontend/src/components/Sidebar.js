import React from 'react';
import {
  FiCalendar, FiClipboard, FiMonitor, FiUsers, FiUser,
  FiCreditCard, FiActivity, FiSettings, FiMessageSquare, FiLogOut
} from 'react-icons/fi';
import finsysLogo from '../assets/NewFSOnly.png';
import './Sidebar.css';

// One cohesive icon family (Feather) for the nav; the brand mark is the only
// deliberate exception (a solid tooth glyph in the app badge).
const navItems = [
  { key: 'dashboard',    label: 'Calendar View',  icon: <FiCalendar /> },
  { key: 'appointments', label: 'Appointments',   icon: <FiClipboard /> },
  { key: 'queue',        label: 'Queue Monitor',  icon: <FiMonitor /> },
  { key: 'patients',     label: 'Patients',        icon: <FiUsers /> },
  { key: 'dentists',     label: 'Dentists',        icon: <FiUser /> },
  { key: 'bills',        label: 'Billing System',  icon: <FiCreditCard /> },
  { key: 'procedures',   label: 'Procedures',      icon: <FiActivity /> },
  { key: 'clinicconfig', label: 'Clinic Config',   icon: <FiSettings /> },
  { key: 'chat',         label: 'Chat',            icon: <FiMessageSquare /> },
];

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function Sidebar({ active, onSelect, user, onLogout, allowedTabs, clinicName }) {
  return (
    <nav className="sidebar">
      {/* Brand: product logo + name only */}
      <div className="sidebar-brand">
        <img className="sidebar-logo" src={finsysLogo} alt="FinSys" />
        <span className="sidebar-name">FinSys</span>
      </div>

      {/* Clinic (workspace) header above the tabs */}
      <div className="sidebar-clinic">{clinicName || 'Clinic'}</div>

      {/* Nav */}
      <ul className="sidebar-nav">
        {navItems
          .filter(item => allowedTabs.includes(item.key))
          .map(item => (
            <li
              key={item.key}
              className={`sidebar-nav-item${active === item.key ? ' active' : ''}`}
              onClick={() => onSelect(item.key)}
              tabIndex={0}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </li>
          ))}
      </ul>

      {/* User + logout */}
      <div className="sidebar-bottom">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initialOf(user.name)}</div>
            <div className="sidebar-user-text">
              <div className="sidebar-username">{user.name}</div>
              <div className="sidebar-role">{user.role}</div>
            </div>
          </div>
        )}
        <button className="sidebar-logout-btn" onClick={onLogout}>
          <FiLogOut className="sidebar-logout-icon" /> <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
