import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

const Members = () => {
  const [loading, setLoading] = useState(true);
  const [totalMembers, setTotalMembers] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));
      setTotalMembers(membersSnapshot.size);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="members-container">
        <div className="loading-spinner">Loading members...</div>
      </div>
    );
  }

  return (
    <div className="members-container">
      <div className="members-header">
        <h1>👥 Member Management</h1>
        <p>Manage and organize all registered members</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <h3>{totalMembers}</h3>
          <p>Total Members</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <h3>0</h3>
          <p>Paid This Month</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏰</div>
          <h3>{totalMembers}</h3>
          <p>Unpaid</p>
        </div>
      </div>

      <div className="coming-soon">
        <i className="fa fa-users"></i>
        <h2>Member Management Dashboard</h2>
        <p>Full member management features coming soon!</p>
        <div className="feature-list">
          <span>✓ View all members</span>
          <span>✓ Edit member details</span>
          <span>✓ Send reminders</span>
          <span>✓ Export data</span>
        </div>
      </div>

      <style>{`
        .members-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .members-header {
          margin-bottom: 30px;
        }
        .members-header h1 {
          font-size: 28px;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stat-icon {
          font-size: 32px;
          margin-bottom: 10px;
        }
        .stat-card h3 {
          font-size: 28px;
          margin: 10px 0;
        }
        .coming-soon {
          text-align: center;
          padding: 60px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 20px;
          color: white;
        }
        .coming-soon i {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .feature-list {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 30px;
          flex-wrap: wrap;
        }
        .feature-list span {
          background: rgba(255,255,255,0.2);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
        }
        .loading-spinner {
          text-align: center;
          padding: 50px;
          font-size: 18px;
          color: #667eea;
        }
      `}</style>
    </div>
  );
};

export default Members;
