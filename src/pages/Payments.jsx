import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

const Payments = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    todayAmount: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const paymentsSnapshot = await getDocs(collection(db, "payments"));
      const paymentsList = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const pending = paymentsList.filter(p => p.status === "pending").length;
      const approved = paymentsList.filter(p => p.status === "approved").length;
      const rejected = paymentsList.filter(p => p.status === "rejected").length;
      
      setStats({ pending, approved, rejected, todayAmount: 0 });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="payments-container">
        <div className="loading-spinner">Loading payments...</div>
      </div>
    );
  }

  return (
    <div className="payments-container">
      <div className="payments-header">
        <h1>💰 Payment Management</h1>
        <p>Review and approve member contributions</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <h3>{stats.pending}</h3>
          <p>Pending</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <h3>{stats.approved}</h3>
          <p>Approved</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <h3>{stats.rejected}</h3>
          <p>Rejected</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <h3>{stats.todayAmount} ETB</h3>
          <p>Today</p>
        </div>
      </div>

      <div className="coming-soon">
        <i className="fa fa-tools"></i>
        <h2>Payment Management Dashboard</h2>
        <p>Full payment management features coming soon!</p>
      </div>

      <style>{`
        .payments-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .payments-header {
          margin-bottom: 30px;
        }
        .payments-header h1 {
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

export default Payments;
