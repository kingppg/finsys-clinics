import React from 'react';
import Select, { components } from 'react-select';
import { useClinic } from './ClinicContext';

// Status options — colors reference the shared app-wide --dc-status-* tokens
// (dcPrimitives.css) so the whole app speaks one status language.
const statusOptions = [
  { value: 'Scheduled',  label: 'Scheduled',  color: 'var(--dc-status-scheduled)' },
  { value: 'Confirmed',  label: 'Confirmed',  color: 'var(--dc-status-confirmed)' },
  { value: 'Checked-In', label: 'Checked-In', color: 'var(--dc-status-checkedin)' },
  { value: 'Completed',  label: 'Completed',  color: 'var(--dc-status-completed)' },
  { value: 'No Show',    label: 'No Show',    color: 'var(--dc-status-noshow)' },
  { value: 'Cancelled',  label: 'Cancelled',  color: 'var(--dc-status-cancelled)' },
];

// --- Helper: Status disabling logic based on appointment time, current status, and clinic timezone ---
function getOptionDisabled(optionValue, appointmentTime, currentStatus, clinicTimeZone) {
  if (!appointmentTime) return false;

  const now = new Date();
  const apptTime = new Date(appointmentTime);
  const msBeforeAppt = apptTime.getTime() - now.getTime();
  const gracePeriodMs = 60 * 60 * 1000; // 1 hour

  // --- Rules when current status is Checked-In ---
  // Only Completed or Confirmed (revert) are allowed
  if (currentStatus === 'Checked-In') {
    if (optionValue === 'Completed' || optionValue === 'Confirmed') return false;
    return true; // disable everything else
  }

  // --- Checked-In: only selectable on the exact appointment date ---
  if (optionValue === 'Checked-In') {
    // Get today's date string in clinic timezone
    const tz = clinicTimeZone || 'Asia/Manila';
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    // Get appointment date string in clinic timezone
    const apptStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(apptTime);

    // Only enable if today matches appointment date
    if (todayStr !== apptStr) return true;

    // Also only allow from Scheduled or Confirmed
    if (!['Scheduled', 'Confirmed'].includes(currentStatus)) return true;

    return false;
  }

  // --- Cancelled: allowed only more than 1 hour before appointment ---
  if (optionValue === 'Cancelled') {
    if (msBeforeAppt <= gracePeriodMs || now > apptTime) return true;
    return false;
  }

  // --- Completed / No Show: only after appointment time ---
  if (optionValue === 'Completed' || optionValue === 'No Show') {
    if (msBeforeAppt > 0) return true;
    return false;
  }

  // --- Scheduled / Confirmed: only before appointment time ---
  if (optionValue === 'Scheduled' || optionValue === 'Confirmed') {
    if (now > apptTime) return true;
    return false;
  }

  return false;
}

// Custom option renderer
const Option = (props) => {
  const { appointmentTime, currentStatus, clinicTimeZone } = props.selectProps;
  const isOptionDisabled = getOptionDisabled(props.data.value, appointmentTime, currentStatus, clinicTimeZone);

  return (
    <div style={{ opacity: isOptionDisabled ? 0.45 : 1, pointerEvents: isOptionDisabled ? 'none' : undefined }}>
      <components.Option {...props}>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: props.data.color,
            marginRight: 8,
            verticalAlign: 'middle',
          }}
        />
        {props.data.label}
      </components.Option>
    </div>
  );
};

// Custom single value renderer
const SingleValue = (props) => (
  <components.SingleValue {...props}>
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: props.data.color,
        marginRight: 8,
        verticalAlign: 'middle',
      }}
    />
    {props.data.label}
  </components.SingleValue>
);

// Custom styles for react-select — theme-driven (reads --dc-* tokens on :root)
const customStyles = {
  control: (provided, state) => ({
    ...provided,
    borderRadius: 12,
    minWidth: 130,
    height: 38,
    fontWeight: 'bold',
    background: 'var(--dc-surface-2, #f7fbff)',
    borderColor: state.isFocused ? 'var(--dc-accent, #185abd)' : 'var(--dc-border-strong, #ccc)',
    boxShadow: state.isFocused ? '0 0 0 2px var(--dc-accent-soft, rgba(24,90,189,0.2))' : 'none',
    '&:hover': { borderColor: 'var(--dc-accent, #185abd)' },
  }),
  menu: (provided) => ({
    ...provided,
    background: 'var(--dc-elevated, #fff)',
    border: '1px solid var(--dc-border-strong, #ccc)',
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 9999,
  }),
  option: (provided, { data, isFocused, isSelected, selectProps }) => {
    const isOptionDisabled = getOptionDisabled(
      data.value,
      selectProps.appointmentTime,
      selectProps.currentStatus,
      selectProps.clinicTimeZone
    );
    return {
      ...provided,
      backgroundColor: isSelected ? data.color : isFocused ? 'var(--dc-accent-soft, #eef6ff)' : 'transparent',
      color: isSelected ? 'var(--dc-accent-contrast, #fff)' : 'var(--dc-text, #185abd)',
      fontWeight: isSelected ? 'bold' : 'normal',
      cursor: isOptionDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      opacity: isOptionDisabled ? 0.45 : 1,
      pointerEvents: isOptionDisabled ? 'none' : undefined,
    };
  },
  singleValue: (provided) => ({
    ...provided,
    color: 'var(--dc-text, #185abd)',
    fontWeight: 'bold',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

function StatusSelect({ value, onChange, isDisabled = false, appointmentTime }) {
  const { clinicTimeZone } = useClinic();
  const selected = statusOptions.find(opt => opt.value === value);

  const handleChange = (opt) => {
    if (!getOptionDisabled(opt.value, appointmentTime, value, clinicTimeZone)) {
      onChange(opt.value);
    }
  };

  return (
    <Select
      value={selected}
      options={statusOptions}
      onChange={handleChange}
      components={{ Option, SingleValue }}
      styles={customStyles}
      isSearchable={false}
      isDisabled={isDisabled}
      menuPlacement="auto"
      menuPosition="fixed"
      menuPortalTarget={document.body}
      appointmentTime={appointmentTime}
      currentStatus={value}
      clinicTimeZone={clinicTimeZone}
      theme={theme => ({
        ...theme,
        borderRadius: 12,
        spacing: { ...theme.spacing, controlHeight: 36 }
      })}
    />
  );
}

export default StatusSelect;