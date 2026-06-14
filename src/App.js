// App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from './config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Payments from './pages/Payments.jsx';
import Members from './pages/Members.jsx';
import Reminders from './pages/Reminders.jsx';
import Login from './pages/Login.jsx';  // Import Login from separate file
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
    await signOut(auth);
    window.location.reload();
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
        <button
          className="nav-item"
          onClick={() => setShowAdminMenu(true)}
        >
          <i className="fa fa-user-circle"></i>
          <span>Admin</span>
        </button>
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

// Unauthorized Component
const Unauthorized = () => {
  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  return (
    <div className="unauthorized-container">
      <div className="unauthorized-card">
        <div className="unauthorized-icon">
          <i className="fa fa-shield-alt"></i>
        </div>
        <h1>Access Denied</h1>
        <p>You don't have permission to access this application.</p>
        <p className="unauthorized-message">This portal is only accessible to administrators.</p>
        <div className="unauthorized-details">
          <i className="fa fa-info-circle"></i>
          <span>If you believe this is an error, please contact the system administrator.</span>
        </div>
        <button onClick={handleLogout} className="btn-primary">
          <i className="fa fa-sign-out-alt"></i> Sign Out
        </button>
      </div>
    </div>
  );
};

// Loading Component
const LoadingScreen = () => (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Loading...</p>
  </div>
);

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "members", firebaseUser.uid));
          
          if (!userDoc.exists()) {
            await signOut(auth);
            setIsAdmin(false);
            setUser(null);
          } else {
            const userRole = userDoc.data().role || 'viewer';
            setIsAdmin(userRole === 'admin');
            
            if (userRole !== 'admin') {
              await signOut(auth);
              setUser(null);
            }
          }
        } catch (error) {
          console.error("Error:", error);
          await signOut(auth);
          setIsAdmin(false);
          setUser(null);
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Login />;
  }

  if (!isAdmin) {
    return <Unauthorized />;
  }

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