import React, { useReducer, useEffect, useState } from "react";
import CalendarForCalendarView from './CalendarForCalendarView';
import { supabase } from '../supabaseClient';

const initialDate = {
  month: new Date().getMonth(),
  year: new Date().getFullYear()
};

function dateReducer(state, action) {
  switch (action.type) {
    case 'NEXT_MONTH':
      if (state.month === 11) return { month: 0, year: state.year + 1 };
      return { ...state, month: state.month + 1 };
    case 'PREV_MONTH':
      if (state.month === 0) return { month: 11, year: state.year - 1 };
      return { ...state, month: state.month - 1 };
    case 'TODAY':
      return { month: new Date().getMonth(), year: new Date().getFullYear() };
    default:
      return state;
  }
}

function ClinicDashboard({ clinicId, user, onDateClick }) {
  const [appointments, setAppointments] = useState([]);
  const [date, dispatch] = useReducer(dateReducer, initialDate);

  useEffect(() => {
    async function fetchAppointments() {
      if (!clinicId) return;
      const from = new Date(date.year, date.month, 1);
      const to = new Date(date.year, date.month + 1, 0, 23, 59, 59, 999);
      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_time, status')
        .eq('clinic_id', clinicId)
        .gte('appointment_time', from.toISOString())
        .lte('appointment_time', to.toISOString())
        .eq('deleted', false);
      setAppointments(error ? [] : data || []);
    }
    fetchAppointments();
  }, [clinicId, date]);

  return (
    <div className="cal-root dc-page">
      <header className="dc-page-header">
        <div className="dc-page-titlewrap">
          <div className="dc-page-eyebrow">Schedule</div>
          <h1 className="dc-page-title">Calendar</h1>
        </div>
      </header>
      <CalendarForCalendarView
        appointments={appointments}
        month={date.month}
        year={date.year}
        onPrevMonth={() => dispatch({ type: 'PREV_MONTH' })}
        onNextMonth={() => dispatch({ type: 'NEXT_MONTH' })}
        onToday={() => dispatch({ type: 'TODAY' })}
        onDateClick={onDateClick}
      />
    </div>
  );
}

export default ClinicDashboard;
