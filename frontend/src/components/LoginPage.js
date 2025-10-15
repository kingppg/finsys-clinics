import React, { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

// Centralized messages (easy to translate later)
const MESSAGES = {
  enterEmail: "Please enter your email above first.",
  sending: "Sending...",
  resetSent: "Password reset email sent! Please check your inbox.",
  loginFailed: "Invalid email or password",
  userProfileFailed: "User profile fetch failed",
  passwordResetFailed: "Failed to send reset email",
  login: "Login",
  loggingIn: "Logging in...",
  forgot: "Forgot password?",
  signUp: "Sign Up"
};

const styles = {
  // ... (all your previous styles, unchanged)
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
    padding: '48px 32px 32px 32px',
    borderRadius: '18px',
    boxShadow: '0 8px 32px rgba(52,98,219,0.13)',
    minWidth: 320,
    maxWidth: 360,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    animation: 'fadeIn 0.7s',
  },
  logo: {
    fontSize: 44,
    marginBottom: 8,
    marginTop: -12,
    width: 72,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: 'linear-gradient(120deg,#3462db2d,#4ac7fa2d 70%)',
    overflow: 'hidden',
  },
  logoImg: {
    width: 44,
    height: 44,
    objectFit: 'contain',
  },
  title: {
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: 0.5,
    color: '#3462db',
    marginBottom: 16,
    marginTop: 4,
    textAlign: 'center',
  },
  inputWrapper: {
    width: '100%',
    position: 'relative',
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
  forgotLink: {
    color: '#3462db',
    fontSize: 13,
    textAlign: 'right',
    textDecoration: 'underline',
    marginTop: 2,
    marginBottom: 2,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    opacity: 1,
    transition: 'opacity 0.2s'
  },
  forgotLinkDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
    marginTop: 18,
    cursor: 'pointer',
    boxShadow: '0 2px 16px rgba(52,98,219,0.08)',
    transition: 'box-shadow 0.2s, opacity 0.23s',
    display: 'block',
  },
  buttonSecondary: {
    width: '100%',
    padding: '13px 0',
    background: 'linear-gradient(90deg,#4ac7fa 60%,#3462db 100%)',
    color: 'white',
    fontWeight: 600,
    fontSize: 17,
    border: 'none',
    borderRadius: 8,
    marginTop: 10,
    cursor: 'pointer',
    boxShadow: '0 2px 16px rgba(52,98,219,0.08)',
    transition: 'box-shadow 0.2s, opacity 0.23s',
    display: 'block',
  },
  error: {
    color: '#e74c3c',
    marginTop: 10,
    marginBottom: 0,
    fontWeight: 500,
    fontSize: 14,
    textAlign: 'center',
    minHeight: 22,
  },
  success: {
    color: '#2ecc71',
    marginTop: 6,
    marginBottom: 0,
    fontWeight: 500,
    fontSize: 14,
    textAlign: 'center',
    minHeight: 22,
  },
  guidance: {
    color: '#3462db',
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.93,
  },
  showPassword: {
    position: 'absolute',
    right: 18,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 18,
    color: '#3462db',
    cursor: 'pointer',
    userSelect: 'none',
    zIndex: 2,
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
  '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } },
  // Responsive for mobile
  '@media (max-width:500px)': {
    card: {
      minWidth: '90vw',
      maxWidth: '96vw',
      padding: '32px 10px 24px 10px',
    }
  }
};

function LoginPage({ onLogin, onShowSignUp, logoSrc }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [focusedInput, setFocusedInput] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const passwordInputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const { data, error: supabaseError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);

    if (supabaseError) {
      setError(supabaseError.message ? supabaseError.message : MESSAGES.loginFailed);
    } else if (data?.user) {
      try {
        let profile = null;
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (profileError || !profileData) {
          setError(MESSAGES.userProfileFailed);
          return;
        }

        profile = profileData;

        let clinicName = '';
        if (profile.clinic_id) {
          const { data: clinicData, error: clinicError } = await supabase
            .from('clinics')
            .select('name')
            .eq('id', profile.clinic_id)
            .single();
          if (!clinicError && clinicData && clinicData.name) {
            clinicName = clinicData.name;
          }
        }

        const fullUser = {
          ...profile,
          name: profile.name,
          clinic_name: clinicName,
          supabase_id: data.user.id,
          supabase_email: data.user.email,
        };

        if (onLogin) onLogin(fullUser);
      } catch (err) {
        setError(MESSAGES.userProfileFailed);
      }
    } else {
      setError(MESSAGES.loginFailed);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setSuccess('');
    if (!email) {
      setError(MESSAGES.enterEmail);
      return;
    }
    setForgotLoading(true);
    const { data, error: forgotError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setForgotLoading(false);
    if (forgotError) {
      setError(forgotError.message || MESSAGES.passwordResetFailed);
    } else {
      setSuccess(MESSAGES.resetSent);
      // Auto-focus password after sending reset
      setTimeout(() => {
        if (passwordInputRef.current) {
          passwordInputRef.current.focus();
        }
      }, 400);
    }
  }

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit} aria-label="Login form">
        <div style={styles.logo}>
          {logoSrc
            ? <img src={logoSrc} alt="Logo" style={styles.logoImg}/>
            : <>🦷</>
          }
        </div>
        <div style={styles.title}>FinSys Clinics</div>
        <div style={styles.guidance}>
          Enter your email and password to login.<br/>
          Forgot your password? Click below and check your email!
        </div>
        <div style={styles.inputWrapper}>
          <input
            type="email"
            style={{
              ...styles.input,
              ...(focusedInput === 'email' ? styles.inputFocus : {})
            }}
            placeholder="Email"
            aria-label="Email Address"
            autoFocus
            value={email}
            onFocus={() => setFocusedInput('email')}
            onBlur={() => setFocusedInput(null)}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div style={styles.inputWrapper}>
          <input
            ref={passwordInputRef}
            type={showPw ? 'text' : 'password'}
            style={{
              ...styles.input,
              ...(focusedInput === 'password' ? styles.inputFocus : {})
            }}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onFocus={() => setFocusedInput('password')}
            onBlur={() => setFocusedInput(null)}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <span
            style={styles.showPassword}
            onClick={() => setShowPw(x => !x)}
            title={showPw ? "Hide password" : "Show password"}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? '🙈' : '👁️'}
          </span>
        </div>
        <button
          type="button"
          style={{
            ...styles.forgotLink,
            ...(email ? {} : styles.forgotLinkDisabled)
          }}
          tabIndex={0}
          onClick={email ? handleForgotPassword : undefined}
          disabled={!email || forgotLoading}
        >
          {forgotLoading ? MESSAGES.sending : MESSAGES.forgot}
        </button>
        {loading && <div style={styles.spinner} />}
        <div style={styles.error}>{error}</div>
        <div style={styles.success}>{success}</div>
        <button
          type="submit"
          style={{
            ...styles.button,
            ...(loading ? { opacity: 0.7, cursor: 'not-allowed' } : {})
          }}
          disabled={loading}
        >
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
              /> {MESSAGES.loggingIn}
            </span>
          ) : MESSAGES.login}
        </button>
        <button
          type="button"
          style={styles.buttonSecondary}
          onClick={onShowSignUp}
        >
          {MESSAGES.signUp}
        </button>
      </form>
      {/* Spinner & fade-in animation keyframes + responsive */}
      <style>
        {`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
          @media (max-width:500px) {
            .main-section-login-card {
              min-width: 90vw !important;
              max-width: 96vw !important;
              padding: 32px 10px 24px 10px !important;
            }
          }
        `}
      </style>
    </div>
  );
}

export default LoginPage;