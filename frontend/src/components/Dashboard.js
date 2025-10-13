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

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('patients');
  const [modalContent, setModalContent] = useState(null);

  // Define allowedTabs based on user.role
  const allowedTabs = ['patients', 'appointments', 'bills', 'chat'];

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
        {activeTab === 'patients' && <Patients setModalContent={setModalContent} clinicId={user.clinic_id} />}
        {activeTab === 'dentists' && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') && <Dentists clinicId={user.clinic_id} />}
        {activeTab === 'appointments' && <AppointmentsModern clinicId={user.clinic_id} />}
        {activeTab === 'bills' && <BillsPayment clinicId={user.clinic_id} />}
        {activeTab === 'clinicconfig' && (user.role === 'superadmin' || user.role === 'admin') && (
          <ClinicConfig
            clinicId={user.clinic_id}
            user={user}
            onBack={() => setActiveTab('patients')}
          />
        )}
        {activeTab === 'procedures' && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') &&
          <ClinicProcedureManager clinicId={user.clinic_id} user={user} />
        }
        {activeTab === 'usersroles' && (user.role === 'superadmin' || user.role === 'admin') &&
          <AdminUsersRoles clinicId={user.clinic_id} currentUser={user} />
        }
        {activeTab === 'chat' && <ChatBox user={user} />}
        {modalContent}
      </main>
    </div>
  );
}

export default Dashboard;