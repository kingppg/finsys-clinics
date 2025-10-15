import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

// Helper to check if URL hash contains recovery type
function isRecoveryFlow() {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('type') === 'recovery' && params.get('access_token');
}

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // If not a recovery flow, show error
    if (!isRecoveryFlow()) {
      setError('Invalid or expired reset link. Please request a new password reset.');
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    if (!newPassword) {
      setError('Please enter a new password.');
      setSubmitting(false);
      return;
    }

    // The session should already be set by Supabase from the URL
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    setSubmitting(false);
    if (updateError) {
      setError(updateError.message || 'Failed to update password.');
    } else {
      // Sign out after password reset to force re-login and clear recovery hash
      await supabase.auth.signOut();
      setTimeout(() => { window.location.hash = ''; }, 100); // Make sure the hash is cleared
      setSuccess('Password updated successfully! You may now log in with your new password.');
    }
  }

  // For input focus highlight
  const [focusedInput, setFocusedInput] = useState(null);

  // Styles (unchanged from your previous version, but you can adjust as needed)
  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(120deg,#a3c9ff 0%, #f6f9fc 100%)',
    },
    card: {
      background: 'white',
      padding: 32,
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(52,98,219,0.13)',
      width: 340,
      maxWidth: '96vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      animation: 'fadeIn 0.7s',
      transition: 'width 0.2s',
      position: 'relative',
    },
    title: {
      color: '#3462db',
      marginBottom: 18,
      fontWeight: 700,
      fontSize: 22,
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    input: {
      width: '100%',
      marginBottom: 16,
      padding: 10,
      borderRadius: 8,
      border: '1px solid #d0d7de',
      fontSize: 16,
      boxSizing: 'border-box',
      outline: 'none',
      background: '#f6f9fc',
      transition: 'border 0.2s, background 0.2s',
    },
    inputFocus: {
      border: '1.5px solid #3462db',
      background: '#fff',
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
      marginTop: 4,
      cursor: 'pointer',
      marginBottom: 6,
      boxShadow: '0 2px 16px rgba(52,98,219,0.08)',
      transition: 'box-shadow 0.2s, opacity 0.23s',
    },
    feedback: {
      minHeight: 22,
      width: '100%',
      marginTop: 8,
      textAlign: 'center',
      wordBreak: 'break-word',
      fontSize: 14,
      fontWeight: 500,
      transition: 'color 0.2s',
    },
    error: {
      color: '#e74c3c',
    },
    success: {
      color: '#2ecc71',
    },
    loginLink: {
      color: '#3462db',
      textDecoration: 'underline',
      marginTop: 8,
      display: 'inline-block',
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit} aria-label="Reset Password form">
        <h2 style={styles.title}>Reset Password</h2>
        <input
          type="password"
          placeholder="Enter new password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          style={{
            ...styles.input,
            ...(focusedInput === 'password' ? styles.inputFocus : {})
          }}
          autoFocus
          onFocus={() => setFocusedInput('password')}
          onBlur={() => setFocusedInput(null)}
        />
        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? 'Updating...' : 'Update Password'}
        </button>
        <div style={{ ...styles.feedback, ...styles.error }}>
          {error}
        </div>
        <div style={{ ...styles.feedback, ...styles.success }}>
          {success && (
            <>
              {success} <br />
              <a
                href="/login"
                style={styles.loginLink}
                onClick={e => {
                  e.preventDefault();
                  window.location.hash = '';
                  window.location.href = '/login';
                }}
              >
                Go to Login
              </a>
            </>
          )}
        </div>
      </form>
      {/* Animation keyframes & mobile responsive */}
      <style>
        {`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
          @media (max-width: 480px) {
            form {
              width: 94vw !important;
              padding: 24px 6vw !important;
              min-width: 0 !important;
            }
          }
        `}
      </style>
    </div>
  );
}