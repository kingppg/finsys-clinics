import React from 'react';
import Select, { components } from 'react-select';

// Status options and color codes
const statusOptions = [
  { value: 'Scheduled', label: 'Scheduled', color: '#185abd' },
  { value: 'Confirmed', label: 'Confirmed', color: '#2bc1ff' },
  { value: 'Completed', label: 'Completed', color: '#2ecc40' },
  { value: 'No Show', label: 'No Show', color: '#e74c3c' },
  { value: 'Cancelled', label: 'Cancelled', color: '#bdc3c7' },
];

// --- Helper: Status disabling logic based on appointment time ---
function getOptionDisabled(optionValue, appointmentTime) {
  if (!appointmentTime) return false;

  const now = new Date();
  const apptTime = new Date(appointmentTime);
  const msBeforeAppt = apptTime.getTime() - now.getTime();

  // Grace period: "Cancelled" allowed only until 1 hour before appt
  const gracePeriodMs = 60 * 60 * 1000;

  if (optionValue === 'Cancelled') {
    // More than 1 hour before: enabled
    // Within 1 hour before: disabled
    // After appointment: always disabled
    if (msBeforeAppt <= gracePeriodMs || now > apptTime) {
      return true;
    }
    return false;
  }

  if (optionValue === 'Completed' || optionValue === 'No Show') {
    // Disabled if appointment is in future, or within 1 hour before
    // Only enabled after appointment time
    if (msBeforeAppt > 0) {
      return true;
    }
    return false;
  }

  if (optionValue === 'Scheduled' || optionValue === 'Confirmed') {
    // Disabled if appointment is in past
    if (now > apptTime) {
      return true;
    }
    return false;
  }

  return false;
}

// Custom option renderer to show color badge
const Option = (props) => {
  const { appointmentTime } = props.selectProps;
  const isOptionDisabled = getOptionDisabled(props.data.value, appointmentTime);

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

// Custom single value renderer to show color badge
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

// Custom styles for react-select
const customStyles = {
  control: (provided, state) => ({
    ...provided,
    borderRadius: 12,
    minWidth: 120,
    height: 38,
    fontWeight: 'bold',
    background: '#f7fbff',
    borderColor: state.isFocused ? '#185abd' : '#ccc',
    boxShadow: state.isFocused ? '0 0 0 2px #185abd33' : 'none',
  }),
  option: (provided, { data, isFocused, isSelected, selectProps }) => {
    const isOptionDisabled = getOptionDisabled(data.value, selectProps.appointmentTime);
    return {
      ...provided,
      backgroundColor: isSelected
        ? data.color
        : isFocused
        ? '#eef6ff'
        : undefined,
      color: isSelected ? '#fff' : '#185abd',
      fontWeight: isSelected ? 'bold' : 'normal',
      cursor: isOptionDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      opacity: isOptionDisabled ? 0.45 : 1,
      pointerEvents: isOptionDisabled ? 'none' : undefined,
    };
  },
  singleValue: (provided, { data }) => ({
    ...provided,
    color: '#185abd',
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
  const selected = statusOptions.find(opt => opt.value === value);

  // Prevent selecting disabled options
  const handleChange = (opt) => {
    if (!getOptionDisabled(opt.value, appointmentTime)) {
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
      theme={theme => ({
        ...theme,
        borderRadius: 12,
        spacing: { ...theme.spacing, controlHeight: 36 }
      })}
    />
  );
}

export default StatusSelect;