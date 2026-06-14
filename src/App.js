import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from './config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Payments from './pages/Payments.jsx';
import Members from './pages/Members.jsx';
import Reminders from './pages/Reminders.jsx';
import AdminPage from './pages/AdminPage.jsx';
import Login from './pages/Login.jsx';
import './styles/bottomNav.css';

// Loading Component
const LoadingScreen = () => (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Loading...</p>
  </div>
);

// Unauthorized Component
const Unauthorized = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
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

// Mobile Top Header
const MobileHeader = () => {
  const location = useLocation();
  const getTitle = () => {
    const path = location.pathname;
    if (path.includes('payments')) return 'Payment Management';
    if (path.includes('members')) return 'Member Management';
    if (path.includes('reminders')) return 'Reminders';
    if (path.includes('admin')) return 'Admin Portal';
    return 'Dashboard';
  };

  const getSubtitle = () => {
    const path = location.pathname;
    if (path.includes('payments')) return 'Review and approve contributions';
    if (path.includes('members')) return 'Manage member information';
    if (path.includes('reminders')) return 'Send payment alerts';
    if (path.includes('admin')) return 'Account settings and preferences';
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

// Bottom Navigation Component
const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/payments', name: 'Payments', icon: 'fa-credit-card' },
    { path: '/members', name: 'Members', icon: 'fa-users' },
    { path: '/reminders', name: 'Reminders', icon: 'fa-bell' },
    { path: '/admin', name: 'Admin', icon: 'fa-user-circle' }
  ];

  const handleNavigation = (path) => {
    if (location.pathname === path) return;
    navigate(path);
  };

  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.path}
          className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => handleNavigation(item.path)}
        >
          <i className={`fa ${item.icon}`}></i>
          <span>{item.name}</span>
        </button>
      ))}
    </nav>
  );
};

// Main App Component
function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.email);
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "members", firebaseUser.uid));
          
          if (!userDoc.exists()) {
            console.log("User not in members collection");
            await signOut(auth);
            setUser(null);
            setIsAdmin(false);
          } else {
            const userRole = userDoc.data().role || 'viewer';
            const adminStatus = userRole === 'admin';
            console.log("User role:", userRole, "Is admin:", adminStatus);
            
            if (adminStatus) {
              setUser(firebaseUser);
              setIsAdmin(true);
            } else {
              console.log("Not admin, signing out");
              await signOut(auth);
              setUser(null);
              setIsAdmin(false);
            }
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          await signOut(auth);
          setUser(null);
          setIsAdmin(false);
        }
      } else {
        console.log("No user logged in");
        setUser(null);
        setIsAdmin(false);
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
            <Route path="/" element={<Navigate to="/payments" replace />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/members" element={<Members />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </Router>
  );
}

export default App;