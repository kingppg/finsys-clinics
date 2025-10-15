import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import './App.css';

// Helper to detect Supabase recovery hash
function isSupabaseRecoveryHash() {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('type') === 'recovery' && params.get('access_token');
}

function RecoveryRedirector({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      // Always make sure we land on the reset page for Supabase recovery
      if (window.location.pathname !== '/reset-password') {
        navigate('/reset-password' + hash, { replace: true });
      }
      // Don't clear the hash or you'll lose the access_token for Supabase!
      // window.location.hash = '';
    } else if (hash && hash.includes('type=signup')) {
      navigate('/login', { replace: true });
      window.location.hash = '';
    }
  }, [navigate]);

  return children;
}

function AppRoutes({ user, handleLogin, handleLogout }) {
  return (
    <RecoveryRedirector>
      <Routes>
        <Route
          path="/login"
          element={
            isSupabaseRecoveryHash() ? (
              <Navigate to={`/reset-password${window.location.hash}`} replace />
            ) : !user ? (
              <LoginPage
                onLogin={handleLogin}
                onShowSignUp={() => window.location.replace('/signup')}
                logoSrc="/FinSys.jpg"
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/signup"
          element={
            !user ? (
              <SignUpPage onBackToLogin={() => window.location.replace('/login')} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />
        <Route
          path="/dashboard"
          element={
            user ? (
              <Dashboard user={user} onLogout={handleLogout} />
            ) : isSupabaseRecoveryHash() ? (
              <Navigate to={`/reset-password${window.location.hash}`} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/"
          element={<RootRedirect user={user} />}
        />
        {/* Fallback for any unknown route */}
        <Route path="*" element={<Navigate to={user ? '/dashboard' : isSupabaseRecoveryHash() ? `/reset-password${window.location.hash}` : '/login'} replace />} />
      </Routes>
    </RecoveryRedirector>
  );
}

function RootRedirect({ user }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (isSupabaseRecoveryHash()) {
      navigate(`/reset-password${window.location.hash}`, { replace: true });
    } else if (user) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);
  return null;
}

function App() {
  const [user, setUser] = useState(null);

  function handleLogin(userInfo) {
    setUser(userInfo);
  }

  function handleLogout() {
    setUser(null);
  }

  return (
    <div className="App" style={{ padding: 0, margin: '0 auto', textAlign: 'left', width: '100%' }}>
      <AppRoutes user={user} handleLogin={handleLogin} handleLogout={handleLogout} />
      <footer
        style={{
          textAlign: 'center',
          padding: '1rem',
          fontSize: '0.95em',
          color: '#555',
          marginTop: '2rem',
        }}
      >
        © 2025 Conquerors For Christ Mission, Inc. All rights reserved.
      </footer>
    </div>
  );
}

export default App;