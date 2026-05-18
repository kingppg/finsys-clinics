import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { TIME_ZONES } from './TimeZones';
import { CURRENCIES } from './Currencies';

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
    marginBottom: 20,
    textAlign: 'center',
  },
  inputWrapper: {
    width: '100%',
    margin: '10px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    marginBottom: 4,
    color: "#3462db",
    fontWeight: 500,
    fontSize: 14
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
  error: {
    color: '#e74c3c',
    minHeight: 22,
    fontWeight: 500,
    fontSize: 14,
    marginBottom: 0,
    textAlign: 'center',
  },
  success: {
    color: '#2ecc71',
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
    boxShadow: 'none',
  },
  spinner: {
    margin: '10px auto',
    width: 24,
    height: 24,
    border: '3px solid #3462db',
    borderTop: '3px solid #f6f9fc',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'block',
  }
};

function SignUpPage({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [timeZone, setTimeZone] = useState('Asia/Manila');
  const [selectedCurrencyIndex, setSelectedCurrencyIndex] = useState(0); // Default sa index 0 (Peso)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Kunin ang detalye ng napiling currency bago mag-submit
    const chosenCurrency = CURRENCIES[selectedCurrencyIndex];

    // 1. Try to sign up via supabase.auth.signUp
    const { data, error: supaError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    // 2. If there is any error, STOP
    if (supaError) {
      setLoading(false);
      if (
        supaError.message &&
        supaError.message.toLowerCase().includes('already registered')
      ) {
        setError('A user with this email already exists. Please use a different email or login.');
      } else {
        setError(supaError.message || 'Registration failed');
      }
      return;
    }

    // 3. Check for duplicate
    const supabaseUser = data.user || (data.session ? data.session.user : null);
    if (!supabaseUser || !supabaseUser.id) {
      setLoading(false);
      setError('A user with this email already exists. Please use a different email or login.');
      return;
    }

    if (!supabaseUser.identities || supabaseUser.identities.length === 0) {
      setLoading(false);
      setError('This email is already registered. Please use a different email or login.');
      return;
    }

    // 4. Proceed to RPC to create the clinic
    const { error: rpcError } = await supabase.rpc('register_clinic_with_admin', {
      p_clinic_name: clinicName,
      p_time_zone: timeZone,
      p_user_id: supabaseUser.id,
      p_email: supabaseUser.email,
      p_name: name,
    });

    if (rpcError) {
      setLoading(false);
      if (
        rpcError.code === '23505' ||
        (rpcError.message && rpcError.message.toLowerCase().includes('duplicate key value'))
      ) {
        setError('A user with this email already exists. Please use a different email or login.');
      } else {
        setError('Registration failed: ' + (rpcError.message || ''));
      }
      return;
    }

    // 5. Post-RPC Update: Hanapin ang pinakahuling clinic na ginawa sa system
    const { data: clinicData, error: fetchError } = await supabase
      .from('clinics')
      .select('id')
      .order('created_at', { ascending: false }) // Kunin ang pinakabago
      .limit(1)
      .single();

    if (!fetchError && clinicData) {
      // I-update ang kakagawang clinic gamit ang tamang currency at locale
      await supabase
        .from('clinics')
        .update({
          currency_symbol: chosenCurrency.symbol,
          currency_locale: chosenCurrency.locale
        })
        .eq('id', clinicData.id);
    }

    setLoading(false);
    setSuccess('Registration successful! Please check your email for confirmation.');
    setEmail('');
    setPassword('');
    setName('');
    setClinicName('');
    setTimeZone('Asia/Manila');
    setSelectedCurrencyIndex(0);
  }

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit} aria-label="Sign up form">
        <div style={styles.title}>Sign Up</div>
        
        <div style={styles.inputWrapper}>
          <input
            type="text"
            placeholder="Name"
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

        <div style={styles.inputWrapper}>
          <input
            type="email"
            placeholder="Email"
            aria-label="Email Address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              ...styles.input,
              ...(focusedInput === 'email' ? styles.inputFocus : {})
            }}
            onFocus={() => setFocusedInput('email')}
            onBlur={() => setFocusedInput(null)}
          />
        </div>

        <div style={styles.inputWrapper}>
          <input
            type="password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              ...styles.input,
              ...(focusedInput === 'password' ? styles.inputFocus : {})
            }}
            onFocus={() => setFocusedInput('password')}
            onBlur={() => setFocusedInput(null)}
          />
        </div>

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

        {/* Timezone Dropdown */}
        <div style={styles.inputWrapper}>
          <label htmlFor="timeZoneSel" style={styles.label}>
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

        {/* Bagong Currency Dropdown */}
        <div style={styles.inputWrapper}>
          <label htmlFor="currencySel" style={styles.label}>
            Clinic Currency
          </label>
          <select
            id="currencySel"
            required
            value={selectedCurrencyIndex}
            onChange={e => setSelectedCurrencyIndex(Number(e.target.value))}
            style={styles.input}
          >
            {CURRENCIES.map((cur, index) => (
              <option key={index} value={index}>
                {cur.label} ({cur.symbol})
              </option>
            ))}
          </select>
        </div>

        {loading && <div style={styles.spinner} />}
        <div style={styles.error}>{error}</div>
        <div style={styles.success}>{success}</div>

        <button type="submit" disabled={loading} style={{
          ...styles.button,
          ...(loading ? { opacity: 0.7, cursor: 'not-allowed' } : {})
        }}>
          {loading ? (
            <span>
              <span
                style={{
                  ...styles.spinner,
                  width: 18,
                  height: 18,
                  borderWidth: 2,
                  verticalAlign: 'middle',
                  margin: '0 8px -2px 0',
                  display: 'inline-block'
                }}
              /> Signing up...
            </span>
          ) : 'Sign Up'}
        </button>

        <button type="button" onClick={onBackToLogin} style={styles.buttonSecondary}>
          Back to Login
        </button>
      </form>

      <style>
        {`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        `}
      </style>
    </div>
  );
}

export default SignUpPage;