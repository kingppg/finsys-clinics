import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import './App.css';

// This component auto-redirects #access_token...&type=recovery or type=signup to the correct page
function RecoveryRedirector({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    // Handle password reset link
    if (hash && hash.includes('type=recovery')) {
      navigate('/reset-password' + hash, { replace: true });
      window.location.hash = '';
    }
    // Handle signup confirmation/verification link
    else if (hash && hash.includes('type=signup')) {
      navigate('/login', { replace: true });
      window.location.hash = '';
    }
  }, [navigate]);

  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  function handleLogin(userInfo) {
    setUser(userInfo);
  }

  function handleLogout() {
    setUser(null);
  }

  // Force redirect "/" to "/login" for unauthenticated users
  useEffect(() => {
    if (location.pathname === '/' && !user) {
      navigate('/login', { replace: true });
    }
  }, [location, user, navigate]);

  return (
    <div className="App" style={{ padding: 0, margin: '0 auto', textAlign: 'left', width: '100%' }}>
      <RecoveryRedirector>
        <Routes>
          <Route
            path="/login"
            element={
              !user ? (
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
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/"
            element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
          />
        </Routes>
      </RecoveryRedirector>
      <footer style={{
        textAlign: 'center',
        padding: '1rem',
        fontSize: '0.95em',
        color: '#555',
        marginTop: '2rem'
      }}>
        © 2025 Conquerors For Christ Mission, Inc. All rights reserved.
      </footer>
    </div>
  );
}

export default function AppWithRouter() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}