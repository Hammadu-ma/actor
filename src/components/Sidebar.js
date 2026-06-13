import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

const Sidebar = ({ collapsed, isMobile, mobileOpen, onClose, onToggle }) => {
  const location = useLocation();
  const [adminName, setAdminName] = useState('Admin');
  const [adminAvatar, setAdminAvatar] = useState('A');

  const navItems = [
    { path: '/payments', name: 'Payments', icon: 'fa-credit-card' },
    { path: '/members', name: 'Members', icon: 'fa-users' },
    { path: '/unpaid', name: 'Unpaid', icon: 'fa-exclamation-triangle' },
    { path: '/reminders', name: 'Reminders', icon: 'fa-bell' }
  ];

  useEffect(() => {
    loadAdminInfo();
  }, []);

  const loadAdminInfo = async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const adminDoc = await getDoc(doc(db, "members", user.uid));
        if (adminDoc.exists()) {
          const adminData = adminDoc.data();
          const name = adminData.fullName || 'Admin';
          setAdminName(name);
          setAdminAvatar(name.charAt(0).toUpperCase());
        }
      } catch (error) {
        console.error('Error loading admin info:', error);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const sidebarClasses = `
    modern-sidebar 
    ${collapsed && !isMobile ? 'collapsed' : ''} 
    ${isMobile && mobileOpen ? 'mobile-open' : ''}
  `;

  if (!isMobile && !mobileOpen && isMobile) return null;

  return (
    <>
      {isMobile && mobileOpen && <div className="sidebar-overlay" onClick={onClose} />}
      
      <aside className={sidebarClasses}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <i className="fa fa-crown"></i>
            </div>
            {(!collapsed || isMobile) && (
              <div className="logo-text">
                <h2>JUMJ</h2>
                <p>Admin Portal</p>
              </div>
            )}
          </div>
          <div className="sidebar-buttons">
            {!isMobile && (
              <button className="sidebar-toggle" onClick={onToggle}>
                <i className={`fa fa-chevron-${collapsed ? 'right' : 'left'}`}></i>
              </button>
            )}
            {isMobile && (
              <button className="sidebar-close" onClick={onClose}>
                <i className="fa fa-times"></i>
              </button>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={isMobile ? onClose : undefined}
            >
              <i className={`fa ${item.icon}`}></i>
              {(!collapsed || isMobile) && <span>{item.name}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-info">
            <div className="admin-avatar">{adminAvatar}</div>
            {(!collapsed || isMobile) && (
              <div className="admin-details">
                <span>{adminName}</span>
                <small>Administrator</small>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <i className="fa fa-sign-out-alt"></i>
            {(!collapsed || isMobile) && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;