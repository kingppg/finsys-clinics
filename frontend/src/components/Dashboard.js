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
import ClinicDashboard from './CalendarView';
import { ClinicProvider } from './ClinicContext'; // ✅ import provider

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modalContent, setModalContent] = useState(null);

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
    // ✅ Wrap entire dashboard with ClinicProvider
    // clinicId is fetched once here; all children can access clinic data via useClinic()
    <ClinicProvider clinicId={user.clinic_id}>
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
    </ClinicProvider>
  );
}

export default Dashboard;