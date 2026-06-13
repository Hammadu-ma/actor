import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase';
import { 
  collection, getDocs, doc, updateDoc, 
  serverTimestamp, query, orderBy 
} from 'firebase/firestore';

const Payments = () => {
  const [allPayments, setAllPayments] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('all');
  
  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentMemberHistory, setCurrentMemberHistory] = useState(null);
  const [yearFilter, setYearFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');

  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    todayAmount: 0
  });

  // Define showToast first (used by other functions)
  const showToast = useCallback((message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, []);

  // Define calculateStats
  const calculateStats = useCallback((payments) => {
    const pending = payments.filter(p => p.status === "pending").length;
    const approved = payments.filter(p => p.status === "approved").length;
    const rejected = payments.filter(p => p.status === "rejected").length;
    
    const today = new Date().toDateString();
    const todayAmount = payments
      .filter(p => p.status === "approved" && p.submittedAtDate?.toDateString() === today)
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    setStats({ pending, approved, rejected, todayAmount });
  }, []);

  // Define loadData BEFORE useEffect
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));
      const membersList = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllMembers(membersList);

      const paymentsQuery = query(collection(db, "payments"), orderBy("submittedAt", "desc"));
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsList = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        submittedAtDate: doc.data().submittedAt?.toDate?.() || new Date()
      }));
      setAllPayments(paymentsList);
      
      calculateStats(paymentsList);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast("Error loading payments", true);
    } finally {
      setLoading(false);
    }
  }, [calculateStats, showToast]);

  // useEffect AFTER loadData is defined
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Define remaining functions with useCallback
  const getFilteredPayments = useCallback(() => {
    let filtered = [...allPayments];
    
    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.memberName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (dateRange !== 'all') {
      const now = new Date();
      filtered = filtered.filter(p => {
        const date = p.submittedAtDate;
        if (dateRange === 'today') return date.toDateString() === now.toDateString();
        if (dateRange === 'week') {
          const weekAgo = new Date(now.setDate(now.getDate() - 7));
          return date >= weekAgo;
        }
        if (dateRange === 'month') {
          const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
          return date >= monthAgo;
        }
        return true;
      });
    }
    
    return {
      pending: filtered.filter(p => p.status === "pending"),
      approved: filtered.filter(p => p.status === "approved"),
      rejected: filtered.filter(p => p.status === "rejected")
    };
  }, [allPayments, searchTerm, dateRange]);

  const handleApprove = useCallback(async (paymentId) => {
    try {
      await updateDoc(doc(db, "payments", paymentId), { 
        status: "approved", 
        approvedAt: serverTimestamp() 
      });
      showToast("✅ Payment approved");
      setSelectedPaymentIds(new Set());
      await loadData();
    } catch (error) {
      showToast("❌ Error approving payment", true);
    }
  }, [showToast, loadData]);

  const handleReject = useCallback(async (paymentId) => {
    try {
      await updateDoc(doc(db, "payments", paymentId), { 
        status: "rejected" 
      });
      showToast("❌ Payment rejected");
      setSelectedPaymentIds(new Set());
      await loadData();
    } catch (error) {
      showToast("❌ Error rejecting payment", true);
    }
  }, [showToast, loadData]);

  const bulkApprove = useCallback(async () => {
    for (const id of selectedPaymentIds) {
      await updateDoc(doc(db, "payments", id), { 
        status: "approved", 
        approvedAt: serverTimestamp() 
      });
    }
    showToast(`✅ Approved ${selectedPaymentIds.size} payments`);
    setSelectedPaymentIds(new Set());
    await loadData();
  }, [selectedPaymentIds, showToast, loadData]);

  const bulkReject = useCallback(async () => {
    for (const id of selectedPaymentIds) {
      await updateDoc(doc(db, "payments", id), { 
        status: "rejected" 
      });
    }
    showToast(`❌ Rejected ${selectedPaymentIds.size} payments`);
    setSelectedPaymentIds(new Set());
    await loadData();
  }, [selectedPaymentIds, showToast, loadData]);

  const toggleSelectPayment = useCallback((paymentId) => {
    setSelectedPaymentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  }, []);

  const showMemberHistory = useCallback((memberId, memberName) => {
    const memberPayments = allPayments.filter(p => 
      p.memberId === memberId || p.uid === memberId
    );
    const member = allMembers.find(m => m.id === memberId);
    
    setCurrentMemberHistory({
      id: memberId,
      name: memberName,
      payments: memberPayments,
      member: member
    });
    setYearFilter('all');
    setMonthFilter('all');
    setShowHistoryModal(true);
  }, [allPayments, allMembers]);

  const getFilteredHistory = useCallback(() => {
    if (!currentMemberHistory) return [];
    
    let filtered = [...currentMemberHistory.payments];
    
    if (yearFilter !== 'all') {
      filtered = filtered.filter(p => 
        p.monthsPaid?.some(m => m.includes(yearFilter))
      );
    }
    
    if (monthFilter !== 'all') {
      filtered = filtered.filter(p => 
        p.monthsPaid?.some(m => m.startsWith(monthFilter))
      );
    }
    
    return filtered.sort((a, b) => 
      (b.submittedAt?.toDate?.() || 0) - (a.submittedAt?.toDate?.() || 0)
    );
  }, [currentMemberHistory, yearFilter, monthFilter]);

  const getInitials = useCallback((name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'M';
  }, []);

  const formatRelativeTime = useCallback((date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }, []);

  const closeHistoryModal = useCallback(() => {
    setShowHistoryModal(false);
    setCurrentMemberHistory(null);
  }, []);

  const filtered = getFilteredPayments();

  // Loading Skeleton
  if (loading) {
    return (
      <div className="app-container">
        <div className="payments-header">
          <div className="header-title">
            <h1>Payment Management</h1>
            <p>Review, approve, and explore member contribution history</p>
          </div>
        </div>
        
        {/* Stats Skeleton */}
        <div className="stats-row">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-skeleton">
              <div className="stat-skeleton-icon"></div>
              <div className="stat-skeleton-text"></div>
            </div>
          ))}
        </div>
        
        {/* Filter Skeleton */}
        <div className="filter-skeleton"></div>
        
        {/* Kanban Board Skeleton */}
        <div className="kanban-board">
          {[1, 2, 3].map(column => (
            <div key={column} className="kanban-column-skeleton">
              <div className="column-header-skeleton"></div>
              <div className="payment-cards-skeleton">
                <div className="card-skeleton"></div>
                <div className="card-skeleton"></div>
                <div className="card-skeleton"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="payments-header">
        <div className="header-title">
          <h1>Payment Management</h1>
          <p>Review, approve, and explore member contribution history</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon pending-icon">
            <i className="fa fa-clock"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.pending}</h3>
            <p>Pending</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon approved-icon">
            <i className="fa fa-check-circle"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.approved}</h3>
            <p>Approved</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon rejected-icon">
            <i className="fa fa-times-circle"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.rejected}</h3>
            <p>Rejected</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon today-icon">
            <i className="fa fa-chart-line"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.todayAmount} ETB</h3>
            <p>Today</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group search-group">
            <label><i className="fa fa-search"></i> Search</label>
            <input 
              type="text" 
              placeholder="Member name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label><i className="fa fa-calendar"></i> Date Range</label>
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
          <button className="reset-filters" onClick={() => {
            setSearchTerm('');
            setDateRange('all');
          }}>
            <i className="fa fa-undo"></i> Reset
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board">
        {/* Pending Column */}
        <div className="kanban-column">
          <div className="column-header pending">
            <div className="column-title">
              <i className="fa fa-clock"></i>
              <span>Pending Review</span>
              <span className="column-count">{filtered.pending.length}</span>
            </div>
          </div>
          <div className="payment-cards">
            {filtered.pending.length === 0 ? (
              <div className="empty-state">
                <i className="fa fa-inbox"></i>
                <p>No pending payments</p>
              </div>
            ) : (
              filtered.pending.map(payment => (
                <div key={payment.id} className={`payment-card ${selectedPaymentIds.has(payment.id) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    className="card-checkbox"
                    checked={selectedPaymentIds.has(payment.id)}
                    onChange={() => toggleSelectPayment(payment.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="card-header">
                    <div className="member-avatar">{getInitials(payment.memberName)}</div>
                    <div className="member-info">
                      <h4>{payment.memberName || "Unknown"}</h4>
                      <p>{payment.memberDepartment || "No department"}</p>
                    </div>
                    <div className="amount">{payment.amount || 0} ETB</div>
                  </div>
                  <div className="months-tags">
                    {(payment.monthsPaid || []).map((month, idx) => (
                      <span key={idx} className="month-tag">📅 {month}</span>
                    ))}
                  </div>
                  <div className="card-footer">
                    <div className="timestamp">
                      <i className="fa fa-paper-plane"></i> 
                      {payment.submittedAtDate ? formatRelativeTime(payment.submittedAtDate) : 'Pending'}
                    </div>
                    <div className="action-buttons">
                      <button 
                        className="action-btn approve" 
                        onClick={() => handleApprove(payment.id)}
                      >
                        <i className="fa fa-check"></i> Approve
                      </button>
                      <button 
                        className="action-btn reject" 
                        onClick={() => handleReject(payment.id)}
                      >
                        <i className="fa fa-times"></i> Reject
                      </button>
                      <button 
                        className="action-btn history" 
                        onClick={() => showMemberHistory(payment.memberId || payment.uid, payment.memberName)}
                      >
                        <i className="fa fa-history"></i> History
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Approved Column */}
        <div className="kanban-column">
          <div className="column-header approved">
            <div className="column-title">
              <i className="fa fa-check-circle"></i>
              <span>Approved</span>
              <span className="column-count">{filtered.approved.length}</span>
            </div>
          </div>
          <div className="payment-cards">
            {filtered.approved.length === 0 ? (
              <div className="empty-state">
                <i className="fa fa-inbox"></i>
                <p>No approved payments</p>
              </div>
            ) : (
              filtered.approved.map(payment => (
                <div key={payment.id} className="payment-card approved-card">
                  <div className="card-header">
                    <div className="member-avatar">{getInitials(payment.memberName)}</div>
                    <div className="member-info">
                      <h4>{payment.memberName || "Unknown"}</h4>
                      <p>{payment.memberDepartment || "No department"}</p>
                    </div>
                    <div className="amount">{payment.amount || 0} ETB</div>
                  </div>
                  <div className="months-tags">
                    {(payment.monthsPaid || []).map((month, idx) => (
                      <span key={idx} className="month-tag">📅 {month}</span>
                    ))}
                  </div>
                  <div className="card-footer">
                    <div className="timestamp approved">
                      <i className="fa fa-check-circle"></i> Approved
                    </div>
                    <div className="action-buttons">
                      <button 
                        className="action-btn history" 
                        onClick={() => showMemberHistory(payment.memberId || payment.uid, payment.memberName)}
                      >
                        <i className="fa fa-history"></i> History
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rejected Column */}
        <div className="kanban-column">
          <div className="column-header rejected">
            <div className="column-title">
              <i className="fa fa-times-circle"></i>
              <span>Rejected</span>
              <span className="column-count">{filtered.rejected.length}</span>
            </div>
          </div>
          <div className="payment-cards">
            {filtered.rejected.length === 0 ? (
              <div className="empty-state">
                <i className="fa fa-inbox"></i>
                <p>No rejected payments</p>
              </div>
            ) : (
              filtered.rejected.map(payment => (
                <div key={payment.id} className="payment-card rejected-card">
                  <div className="card-header">
                    <div className="member-avatar">{getInitials(payment.memberName)}</div>
                    <div className="member-info">
                      <h4>{payment.memberName || "Unknown"}</h4>
                      <p>{payment.memberDepartment || "No department"}</p>
                    </div>
                    <div className="amount">{payment.amount || 0} ETB</div>
                  </div>
                  <div className="months-tags">
                    {(payment.monthsPaid || []).map((month, idx) => (
                      <span key={idx} className="month-tag">📅 {month}</span>
                    ))}
                  </div>
                  <div className="card-footer">
                    <div className="timestamp rejected">
                      <i className="fa fa-times-circle"></i> Rejected
                    </div>
                    <div className="action-buttons">
                      <button 
                        className="action-btn history" 
                        onClick={() => showMemberHistory(payment.memberId || payment.uid, payment.memberName)}
                      >
                        <i className="fa fa-history"></i> History
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <div className={`bulk-actions-bar ${selectedPaymentIds.size > 0 ? 'show' : ''}`}>
        <span className="bulk-selected">
          <i className="fa fa-check-circle"></i> {selectedPaymentIds.size} selected
        </span>
        <div className="bulk-buttons">
          <button className="bulk-btn approve" onClick={bulkApprove}>
            <i className="fa fa-check"></i> Approve All
          </button>
          <button className="bulk-btn reject" onClick={bulkReject}>
            <i className="fa fa-times"></i> Reject All
          </button>
          <button className="bulk-btn close" onClick={() => setSelectedPaymentIds(new Set())}>
            <i className="fa fa-times"></i> Close
          </button>
        </div>
      </div>

      {/* History Modal */}
      <div className={`modal-overlay ${showHistoryModal ? 'show' : ''}`} onClick={closeHistoryModal}>
        <div className="history-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Payment History</h2>
            <button className="close-modal" onClick={closeHistoryModal}>
              <i className="fa fa-times"></i>
            </button>
          </div>
          
          {currentMemberHistory && (
            <>
              <div className="member-profile-card">
                <div className="member-avatar-large">{getInitials(currentMemberHistory.name)}</div>
                <div className="member-stats">
                  <div className="stat-badge">
                    <div className="label">This Month</div>
                    <div className="value success">
                      {currentMemberHistory.payments
                        .filter(p => p.status === "approved")
                        .filter(p => {
                          if (!p.monthsPaid) return false;
                          const now = new Date();
                          const currentShort = now.toLocaleString('default', { month: 'short' });
                          return p.monthsPaid.some(m => m.includes(currentShort));
                        })
                        .reduce((sum, p) => sum + (p.amount || 0), 0)} ETB
                    </div>
                  </div>
                  <div className="stat-badge">
                    <div className="label">Total Paid</div>
                    <div className="value">
                      {currentMemberHistory.payments
                        .filter(p => p.status === "approved")
                        .reduce((sum, p) => sum + (p.amount || 0), 0)} ETB
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="history-filters">
                <div className="year-filter">
                  <div 
                    className={`year-chip ${yearFilter === 'all' ? 'active' : ''}`} 
                    onClick={() => setYearFilter('all')}
                  >
                    All Years
                  </div>
                  {[...new Set(currentMemberHistory.payments.map(p => {
                    if (!p.monthsPaid) return null;
                    const yearMatch = p.monthsPaid[0]?.match(/\d{4}/);
                    return yearMatch ? yearMatch[0] : null;
                  }).filter(y => y))].sort().reverse().map(year => (
                    <div 
                      key={year}
                      className={`year-chip ${yearFilter === year ? 'active' : ''}`} 
                      onClick={() => setYearFilter(year)}
                    >
                      {year}
                    </div>
                  ))}
                </div>
                <div className="month-filter">
                  <div 
                    className={`month-chip ${monthFilter === 'all' ? 'active' : ''}`} 
                    onClick={() => setMonthFilter('all')}
                  >
                    All Months
                  </div>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                    <div 
                      key={month}
                      className={`month-chip ${monthFilter === month ? 'active' : ''}`} 
                      onClick={() => setMonthFilter(month)}
                    >
                      {month}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="history-list">
                {getFilteredHistory().length === 0 ? (
                  <div className="empty-state">
                    <i className="fa fa-calendar"></i>
                    <p>No payments for selected filters</p>
                  </div>
                ) : (
                  getFilteredHistory().map(payment => {
                    const monthsDisplay = payment.monthsPaid?.join(", ") || `${payment.paymentMonthCount || 0} month(s)`;
                    const statusText = payment.status === "approved" ? "Approved" : (payment.status === "pending" ? "Pending" : "Rejected");
                    const date = payment.submittedAtDate?.toLocaleDateString() || "Pending";
                    return (
                      <div key={payment.id} className="history-item">
                        <div className="history-month">
                          <span className="month-name">{monthsDisplay}</span>
                          <span className="year-name">{date}</span>
                        </div>
                        <div>
                          <div className={`history-amount ${payment.status}`}>
                            {payment.amount || 0} ETB
                          </div>
                          <span className="history-status">{statusText}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              <div className="total-section">
                <span className="total-label">Total Paid (filtered)</span>
                <span className="total-amount">
                  {getFilteredHistory()
                    .filter(p => p.status === "approved")
                    .reduce((sum, p) => sum + (p.amount || 0), 0)} ETB
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Payments;