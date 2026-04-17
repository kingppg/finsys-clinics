import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Patients from './Patients';
import Dentists from './Dentists';
import AppointmentsModern from './AppointmentsModern';
import BillsPayment from './BillsPayment';
import ClinicConfig from './ClinicConfig';
import ClinicProcedureManager from './ClinicProcedureManager';
import AdminUsersRoles from './AdminUsersRoles';
import ChatBox from './chats/ChatBox';
// 👇 NEW: Import the dashboard with the calendar
import ClinicDashboard from './CalendarView';

function Dashboard({ user, onLogout }) {
  // Start with dashboard as default tab
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modalContent, setModalContent] = useState(null);

  // Define allowedTabs; add/remove 'dashboard' per your access policy
  const allowedTabs = ['dashboard', 'patients', 'appointments', 'bills', 'chat'];

  if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') {
    allowedTabs.push('dentists');
    allowedTabs.push('procedures');
  }
  if (user.role === 'superadmin' || user.role === 'admin') {
    allowedTabs.push('clinicconfig');
    allowedTabs.push('usersroles');
  }

  const clinicName = user.clinic_name || "Clinic";

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar
        active={activeTab}
        onSelect={setActiveTab}
        allowedTabs={allowedTabs}
        user={user}
        onLogout={onLogout}
        clinicName={clinicName}
      />
      <main
        style={{
          marginLeft: 220,
          padding: '8px 32px',
          flex: 1,
          background: '#f6f9fc',
          minHeight: '100vh',
          position: 'relative',
        }}
      >
        {/* --- NEW DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && (
          <ClinicDashboard clinicId={user.clinic_id} user={user} />
        )}

        {activeTab === 'patients' && (
          <Patients setModalContent={setModalContent} clinicId={user.clinic_id} />
        )}
        {activeTab === 'dentists' && 
          (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') && (
          <Dentists clinicId={user.clinic_id} />
        )}
        {activeTab === 'appointments' && <AppointmentsModern clinicId={user.clinic_id} />}
        {activeTab === 'bills' && <BillsPayment clinicId={user.clinic_id} />}
        {activeTab === 'clinicconfig' && 
          (user.role === 'superadmin' || user.role === 'admin') && (
          <ClinicConfig
            clinicId={user.clinic_id}
            user={user}
            onBack={() => setActiveTab('patients')}
          />
        )}
        {activeTab === 'procedures' && 
          (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') && (
          <ClinicProcedureManager clinicId={user.clinic_id} user={user} />
        )}
        {activeTab === 'chat' && <ChatBox user={user} />}
        {modalContent}
      </main>
    </div>
  );
}

export default Dashboard;