// pages/AdminPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

const AdminPage = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/payments');
  };

  return (
    <div className="app-container">
      {/* Header */}
      <div className="payments-header">
        <div className="header-title">
          <h1>Admin Portal</h1>
          <p>Manage your account and system preferences</p>
        </div>
      </div>

      {/* Stats Row - Admin Info Card */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#eef2ff' }}>
            <i className="fa fa-user-shield" style={{ color: 'var(--primary)' }}></i>
          </div>
          <div className="stat-info">
            <h3>Administrator</h3>
            <p>Account Role</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7' }}>
            <i className="fa fa-calendar" style={{ color: 'var(--success)' }}></i>
          </div>
          <div className="stat-info">
            <h3>{new Date(auth.currentUser?.metadata?.creationTime).toLocaleDateString()}</h3>
            <p>Member Since</p>
          </div>
        </div>
      </div>

      {/* User Info Section */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group" style={{ width: '100%' }}>
            <label><i className="fa fa-envelope"></i> Email Address</label>
            <input 
              type="text" 
              value={auth.currentUser?.email || ''} 
              readOnly
              style={{ background: 'var(--bg-tertiary)', cursor: 'default' }}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons-group" style={{ marginTop: '24px' }}>
        <button className="btn-primary" onClick={handleGoToDashboard}>
          <i className="fa fa-tachometer-alt"></i> Go to Dashboard
        </button>
        <button className="btn-danger" onClick={handleLogout}>
          <i className="fa fa-sign-out-alt"></i> Logout
        </button>
      </div>
    </div>
  );
};

export default AdminPage;