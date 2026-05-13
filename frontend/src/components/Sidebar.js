import React from 'react';
import {
  FiHome, FiUsers, FiGrid, FiUserPlus, FiCalendar, FiCreditCard, FiLogOut,
  FiSettings, FiClipboard, FiShield, FiMessageCircle
} from 'react-icons/fi';
import { FaTable } from "react-icons/fa";
import { VscCalendar } from "react-icons/vsc";
import './Sidebar.css';

const navItems = [
  { key: 'dashboard', label: 'Calendar View', icon: <VscCalendar /> },        // NEW dashboard tab!
  { key: 'appointments', label: 'Appointments', icon: <FiGrid /> },
  { key: 'patients', label: 'Patients', icon: <FiUsers /> },
  { key: 'dentists', label: 'Dentists', icon: <FiUserPlus /> },
  { key: 'bills', label: 'Billing System', icon: <FiCreditCard /> },
  { key: 'procedures', label: 'Procedures', icon: <FiClipboard /> },
  { key: 'clinicconfig', label: 'Clinic Config', icon: <FiSettings /> },
//  { key: 'usersroles', label: 'Users & Roles', icon: <FiShield /> }, MOVED TO ConfigClinic tab
  { key: 'chat', label: 'Chat', icon: <FiMessageCircle /> },
];

function Sidebar({ active, onSelect, user, onLogout, allowedTabs, clinicName }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span role="img" aria-label="Tooth" style={{ fontSize: 20 }}>🦷</span>
        <span className="sidebar-title">{clinicName || "Clinic"}</span>
      </div>
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
      <div className="sidebar-bottom">
        {user && (
          <div className="sidebar-user-info">
            <div className="sidebar-username">{user.name}</div>
            <div className="sidebar-role">{user.role}</div>
          </div>
        )}
        <button className="sidebar-logout-btn" onClick={onLogout}>
          <FiLogOut style={{ marginRight: 8 }} /> Logout
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;