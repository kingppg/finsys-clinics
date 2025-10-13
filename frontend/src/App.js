import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import './App.css';

function App() {
  // Holds logged-in user info (null if not logged in)
  const [user, setUser] = useState(null);

  // Called when login is successful
  function handleLogin(userInfo) {
    console.log('Logged in user info:', userInfo);
    setUser(userInfo);
  }

  // Optional: handle logout
  function handleLogout() {
    setUser(null);
  }

  return (
    <div className="App" style={{ padding: 0, margin: '0 auto', textAlign: 'left', width: '100%' }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              !user ? (
                <LoginPage
                  onLogin={handleLogin}
                  onShowSignUp={() => window.location.replace('/signup')}
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