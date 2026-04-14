import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { TIME_ZONES } from './TimeZones';

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(120deg,#a3c9ff 0%, #f6f9fc 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter,sans-serif',
  },
  card: {
    background: 'white',
    padding: '40px 32px 32px 32px',
    borderRadius: 18,
    boxShadow: '0 8px 32px rgba(52,98,219,0.13)',
    minWidth: 320,
    maxWidth: 380,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    animation: 'fadeIn 0.7s',
  },
  title: {
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: 0.5,
    color: '#3462db',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  inputWrapper: {
    width: '100%',
    margin: '10px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #d0d7de',
    borderRadius: 8,
    fontSize: 16,
    outline: 'none',
    background: '#f6f9fc',
    transition: 'border 0.2s, background 0.2s',
    boxSizing: 'border-box',
    display: 'block',
  },
  inputFocus: {
    border: '1.5px solid #3462db',
    background: '#fff',
  },
  inputDisabled: {
    background: '#eef0f4',
    color: '#888',
    cursor: 'not-allowed',
    border: '1px solid #d0d7de',
  },
  error: {
    color: '#e74c3c',
    minHeight: 22,
    fontWeight: 500,
    fontSize: 14,
    marginBottom: 0,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    padding: '13px 0',
    background: 'linear-gradient(90deg,#3462db 60%,#4ac7fa 100%)',
    color: 'white',
    fontWeight: 600,
    fontSize: 17,
    border: 'none',
    borderRadius: 8,
    marginTop: 14,
    cursor: 'pointer',
    boxShadow: '0 2px 16px rgba(52,98,219,0.08)',
    transition: 'box-shadow 0.2s, opacity 0.23s',
    display: 'block',
  },
  buttonSecondary: {
    width: '100%',
    padding: '13px 0',
    background: '#f6f9fc',
    color: '#3462db',
    fontWeight: 600,
    fontSize: 17,
    border: '1px solid #3462db',
    borderRadius: 8,
    marginTop: 8,
    cursor: 'pointer',
    display: 'block',
  },
  spinner: {
    width: 18,
    height: 18,
    border: '2px solid #3462db',
    borderTop: '2px solid #f6f9fc',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
    verticalAlign: 'middle',
    marginRight: 8,
  },
};

function CompleteRegistrationPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // ALL hooks first — before any conditional return
  const [name, setName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [timeZone, setTimeZone] = useState('Asia/Manila');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);

  const supabaseUser = location.state?.supabaseUser;

  // Guard: redirect to login if no supabase user in router state
  useEffect(() => {
    if (!supabaseUser) {
      navigate('/login', { replace: true });
    }
  }, [supabaseUser, navigate]);

  // Don't render anything while redirecting
  if (!supabaseUser) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: rpcError } = await supabase.rpc('register_clinic_with_admin', {
      p_clinic_name: clinicName,
      p_time_zone: timeZone,
      p_user_id: supabaseUser.id,
      p_email: supabaseUser.email,
      p_name: name,
    });

    setLoading(false);

    if (rpcError) {
      setError('Registration failed: ' + (rpcError.message || ''));
    } else {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', supabaseUser.email)
          .single();

        if (profileError || !profileData) {
          setError('Profile setup failed. Please contact your administrator.');
          return;
        }

        let clinicNameFetched = '';
        if (profileData.clinic_id) {
          const { data: clinicData } = await supabase
            .from('clinics')
            .select('name')
            .eq('id', profileData.clinic_id)
            .single();
          if (clinicData?.name) clinicNameFetched = clinicData.name;
        }

        navigate('/dashboard', {
          replace: true,
          state: {
            user: {
              ...profileData,
              clinic_name: clinicNameFetched,
              supabase_id: supabaseUser.id,
              supabase_email: supabaseUser.email,
            }
          }
        });
      } catch {
        setError('Profile setup failed. Please contact your administrator.');
      }
    }
  }

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit} aria-label="Complete registration form">
        <div style={styles.title}>Complete Registration</div>
        <div style={styles.subtitle}>
          Your account was created by invitation.<br />
          Please fill in the remaining details to continue.
        </div>

        {/* Email — pre-filled and grayed out */}
        <div style={styles.inputWrapper}>
          <input
            type="email"
            value={supabaseUser.email}
            disabled
            aria-label="Email Address"
            style={{ ...styles.input, ...styles.inputDisabled }}
          />
        </div>

        {/* Name */}
        <div style={styles.inputWrapper}>
          <input
            type="text"
            placeholder="Your Full Name"
            aria-label="Full Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{
              ...styles.input,
              ...(focusedInput === 'name' ? styles.inputFocus : {})
            }}
            onFocus={() => setFocusedInput('name')}
            onBlur={() => setFocusedInput(null)}
          />
        </div>

        {/* Clinic Name */}
        <div style={styles.inputWrapper}>
          <input
            type="text"
            placeholder="Clinic Name"
            aria-label="Clinic Name"
            value={clinicName}
            onChange={e => setClinicName(e.target.value)}
            required
            style={{
              ...styles.input,
              ...(focusedInput === 'clinic' ? styles.inputFocus : {})
            }}
            onFocus={() => setFocusedInput('clinic')}
            onBlur={() => setFocusedInput(null)}
          />
        </div>

        {/* Timezone */}
        <div style={styles.inputWrapper}>
          <label htmlFor="timeZoneSel" style={{ marginBottom: 4, color: '#3462db', fontWeight: 500 }}>
            Clinic Time Zone
          </label>
          <select
            id="timeZoneSel"
            required
            value={timeZone}
            onChange={e => setTimeZone(e.target.value)}
            style={styles.input}
          >
            {TIME_ZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.error}>{error}</div>

        <button
          type="submit"
          disabled={loading}
          style={{
            ...styles.button,
            ...(loading ? { opacity: 0.7, cursor: 'not-allowed' } : {})
          }}
        >
          {loading ? (
            <span>
              <span style={styles.spinner} /> Completing...
            </span>
          ) : 'Complete Registration'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          style={styles.buttonSecondary}
        >
          Cancel
        </button>
      </form>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

export default CompleteRegistrationPage;