import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import './App.css';

// This component auto-redirects #access_token...&type=recovery to /reset-password
function RecoveryRedirector({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      // Redirect to /reset-password and preserve the hash
      navigate('/reset-password' + hash, { replace: true });
    }
    // eslint-disable-next-line
  }, []);

  return children;
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
      <BrowserRouter>
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
      </BrowserRouter>
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

export default App;