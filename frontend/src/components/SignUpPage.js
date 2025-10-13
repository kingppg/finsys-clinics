import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

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
  },
  '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
  '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } }
};

function SignUpPage({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // 1. Register user with Supabase Auth
    const { data, error: supaError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });

    if (supaError) {
      setLoading(false);
      setError(supaError.message || 'Registration failed');
      return;
    }

    const supabaseUser = data.user || (data.session ? data.session.user : null);

    if (!supabaseUser) {
      setLoading(false);
      setSuccess('Registration initiated! Please check your email to confirm your account.');
      return;
    }

    // 2. Create a clinic record
    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .insert([{ name: clinicName }])
      .select()
      .single();

    if (clinicError) {
      setLoading(false);
      setError('Clinic creation failed: ' + (clinicError.message || ''));
      return;
    }

    // 3. Insert user details into custom users table
    const { error: userInsertError } = await supabase
      .from('users')
      .insert([{
        user_id: supabaseUser.id,
        email: supabaseUser.email,
        name,
        role: 'admin',
        clinic_id: clinicData.id
      }]);

    setLoading(false);
    if (userInsertError) {
      setError('User profile creation failed: ' + (userInsertError.message || ''));
    } else {
      setSuccess('Registration successful! Please check your email for confirmation.');
      setEmail('');
      setPassword('');
      setName('');
      setClinicName('');
    }
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
      {/* Spinner & fade-in animation keyframes */}
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