import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

const Reminders = () => {
  const [loading, setLoading] = useState(true);
  const [unpaidCount, setUnpaidCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));
      const membersList = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const paymentsSnapshot = await getDocs(collection(db, "payments"));
      const paymentsList = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const paidMemberIds = new Set();
      paymentsList.forEach(payment => {
        if (payment.status === "approved") {
          paidMemberIds.add(payment.memberId || payment.uid);
        }
      });
      
      const unpaid = membersList.filter(m => !paidMemberIds.has(m.id));
      setUnpaidCount(unpaid.length);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendTestReminder = () => {
    alert("Test reminder feature - Full implementation coming soon!");
  };

  if (loading) {
    return (
      <div className="reminders-container">
        <div className="loading-spinner">Loading reminders...</div>
      </div>
    );
  }

  return (
    <div className="reminders-container">
      <div className="reminders-header">
        <h1>🔔 Smart Reminders</h1>
        <p>Automated payment reminder system</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📢</div>
          <h3>{unpaidCount}</h3>
          <p>Need Reminders</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✉️</div>
          <h3>Telegram</h3>
          <p>Auto-send enabled</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <h3>Monthly</h3>
          <p>Schedule active</p>
        </div>
      </div>

      <div className="coming-soon">
        <i className="fa fa-bell"></i>
        <h2>Smart Reminder System</h2>
        <p>Automated payment reminders coming soon!</p>
        
        <div className="features">
          <div className="feature">
            <i className="fa fa-telegram"></i>
            <h4>Telegram Integration</h4>
            <p>Send automatic reminders via Telegram</p>
          </div>
          <div className="feature">
            <i className="fa fa-calendar"></i>
            <h4>Schedule Manager</h4>
            <p>Set custom reminder schedules</p>
          </div>
          <div className="feature">
            <i className="fa fa-chart-line"></i>
            <h4>Analytics</h4>
            <p>Track reminder effectiveness</p>
          </div>
        </div>

        <button className="test-btn" onClick={sendTestReminder}>
          📱 Test Reminder System
        </button>
      </div>

      <style>{`
        .reminders-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .reminders-header {
          margin-bottom: 30px;
        }
        .reminders-header h1 {
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
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 30px;
          margin: 40px 0;
        }
        .feature {
          background: rgba(255,255,255,0.1);
          padding: 20px;
          border-radius: 16px;
          backdrop-filter: blur(10px);
        }
        .feature i {
          font-size: 32px;
          margin-bottom: 15px;
        }
        .feature h4 {
          margin-bottom: 10px;
          font-size: 18px;
        }
        .feature p {
          font-size: 14px;
          opacity: 0.9;
        }
        .test-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 12px 30px;
          border-radius: 25px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 20px;
          transition: transform 0.2s;
        }
        .test-btn:hover {
          transform: translateY(-2px);
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

export default Reminders;
