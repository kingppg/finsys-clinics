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
import QueueMonitor from './QueueMonitor';
import { ClinicProvider } from './ClinicContext';
import { DcThemeRoot } from '../themes/DcThemeProvider';

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modalContent, setModalContent] = useState(null);
  const [calendarJumpDate, setCalendarJumpDate] = useState(null);

  const allowedTabs = ['dashboard', 'patients', 'appointments', 'bills', 'chat', 'queue'];

  if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') {
    allowedTabs.push('dentists');
    allowedTabs.push('procedures');
  }
  if (user.role === 'superadmin' || user.role === 'admin') {
    allowedTabs.push('clinicconfig');
    allowedTabs.push('usersroles');
  }

  const clinicName = user.clinic_name || "Clinic";

  // Called when user clicks a date on the calendar
  function handleCalendarDateClick({ year, month, day }) {
    setCalendarJumpDate({ year, month, day });
    setActiveTab('appointments');
  }

  // Called when user clicks any sidebar tab
  function handleTabSelect(tab) {
    if (tab === 'appointments') setCalendarJumpDate(null);
    setActiveTab(tab);
  }

  return (
    <DcThemeRoot>
    <ClinicProvider clinicId={user.clinic_id}>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar
          active={activeTab}
          onSelect={handleTabSelect}
          allowedTabs={allowedTabs}
          user={user}
          onLogout={onLogout}
          clinicName={clinicName}
        />
        <main
          className="dc-viewport"
          style={{
            marginLeft: 240,
            padding: '8px 32px',
            flex: 1,
            minHeight: '100vh',
            boxSizing: 'border-box', // padding inside the 100vh — else main is 100vh+16px and the page always scrolls
            position: 'relative',
          }}
        >
          {activeTab === 'dashboard' && (
            <ClinicDashboard
              clinicId={user.clinic_id}
              user={user}
              onDateClick={handleCalendarDateClick}
            />
          )}
          {activeTab === 'patients' && (
            <Patients setModalContent={setModalContent} clinicId={user.clinic_id} />
          )}
          {activeTab === 'dentists' &&
            (user.role === 'superadmin' || user.role === 'admin' || user.role === 'receptionist') && (
            <Dentists clinicId={user.clinic_id} />
          )}
          {activeTab === 'appointments' && (
            <AppointmentsModern
              clinicId={user.clinic_id}
              jumpDate={calendarJumpDate}
            />
          )}
          {activeTab === 'bills' && <BillsPayment clinicId={user.clinic_id} />}
          {activeTab === 'queue' && <QueueMonitor clinicId={user.clinic_id} />}
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
    </DcThemeRoot>
  );
}

export default Dashboard;