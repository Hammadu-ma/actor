// pages/Unauthorized.jsx
import React from 'react';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="unauthorized-screen">
      <div className="unauthorized-container">
        {/* Icon */}
        <div className="unauthorized-icon">
          <i className="fa fa-shield-alt"></i>
        </div>
        
        <h1>Access Denied</h1>
        <p className="unauthorized-message">
          You don't have permission to access this application.
        </p>
        <p className="unauthorized-submessage">
          This portal is only accessible to administrators.
        </p>
        
        <div className="unauthorized-details">
          <i className="fa fa-info-circle"></i>
          <span>If you believe this is an error, please contact the system administrator.</span>
        </div>
        
        <button onClick={handleLogout} className="unauthorized-btn">
          <i className="fa fa-sign-out-alt"></i> Sign Out
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;