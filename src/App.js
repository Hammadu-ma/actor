import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Payments from './pages/Payments.jsx';  // Changed from .js to .jsx
import Members from './pages/Members.jsx';    // Changed from .js to .jsx
import Reminders from './pages/Reminders.jsx'; // Changed from .js to .jsx
import './styles/bottomNav.css';

// Bottom Navigation Component
const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const navItems = [
    { path: '/payments', name: 'Payments', icon: 'fa-credit-card' },
    { path: '/members', name: 'Members', icon: 'fa-users' },
    { path: '/reminders', name: 'Reminders', icon: 'fa-bell' }
  ];

  const handleLogout = async () => {
    const { auth } = await import('./config/firebase');
    await auth.signOut();
    window.location.href = '/login.html';
  };

  return (
    <>
      <nav className="bottom-nav">
        {navItems.map(item => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <i className={`fa ${item.icon}`}></i>
            <span>{item.name}</span>
          </button>
        ))}
      </nav>

      {/* Admin Menu Modal - Bottom Sheet */}
      {showAdminMenu && (
        <div className="admin-overlay" onClick={() => setShowAdminMenu(false)}>
          <div className="admin-sheet" onClick={e => e.stopPropagation()}>
            <div className="admin-sheet-header">
              <div className="admin-avatar-large">A</div>
              <h3>Admin Portal</h3>
              <p>JUMJ Management System</p>
            </div>
            <div className="admin-sheet-actions">
              <button className="admin-sheet-btn" onClick={handleLogout}>
                <i className="fa fa-sign-out-alt"></i>
                <span>Logout</span>
              </button>
              <button className="admin-sheet-btn" onClick={() => setShowAdminMenu(false)}>
                <i className="fa fa-times"></i>
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Mobile Top Header
const MobileHeader = () => {
  const location = useLocation();
  const getTitle = () => {
    const path = location.pathname;
    if (path.includes('payments')) return 'Payment Management';
    if (path.includes('members')) return 'Member Management';
    if (path.includes('reminders')) return 'Reminders';
    return 'Dashboard';
  };

  const getSubtitle = () => {
    const path = location.pathname;
    if (path.includes('payments')) return 'Review and approve contributions';
    if (path.includes('members')) return 'Manage member information';
    if (path.includes('reminders')) return 'Send payment alerts';
    return 'Manage your portal';
  };

  return (
    <div className="mobile-header">
      <div className="header-content">
        <div className="logo-icon-small">
          <i className="fa fa-crown"></i>
        </div>
        <div className="header-text">
          <h1>{getTitle()}</h1>
          <p>{getSubtitle()}</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <div className="app-bottom-nav">
        <MobileHeader />
        <div className="main-content-bottom">
          <Routes>
            <Route path="/" element={<Navigate to="/payments" />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/members" element={<Members />} />
            <Route path="/reminders" element={<Reminders />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </Router>
  );
}

export default App;
