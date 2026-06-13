import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase';
import { 
  collection, getDocs, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

const Members = () => {
  const [allMembers, setAllMembers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [currentMonthPaidSet, setCurrentMonthPaidSet] = useState(new Set());
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  
  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [currentEditingMember, setCurrentEditingMember] = useState(null);
  const [confirmData, setConfirmData] = useState({ message: '', onConfirm: null });
  
  // Form state
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    telegram: '',
    department: '',
    batchYear: '',
    role: 'member'
  });

  const BOT_TOKEN = "8784743959:AAEMA8yJqQYVcV3nOkdhyLQKgc5r6OX3FEI";

  const roleOptions = [
    { value: 'admin', label: 'Admin', icon: 'fa-crown', color: '#f59e0b', bg: '#fef3c7' },
    { value: 'member', label: 'Member', icon: 'fa-user', color: '#3b82f6', bg: '#dbeafe' },
    { value: 'viewer', label: 'Viewer', icon: 'fa-eye', color: '#10b981', bg: '#d1fae5' }
  ];

  const auth = getAuth();

  const showToast = useCallback((message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }, []);

  const getCurrentMonthInfo = useCallback(() => {
    const now = new Date();
    return {
      name: now.toLocaleString('default', { month: 'long' }),
      shortName: now.toLocaleString('default', { month: 'short' }),
      display: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`
    };
  }, []);

  const calculatePaidStatus = useCallback(() => {
    const currentMonth = getCurrentMonthInfo();
    const paidSet = new Set();
    allPayments.forEach(payment => {
      if (payment.status !== "approved") return;
      const targetId = payment.memberId || payment.uid;
      if (!targetId) return;
      if (payment.monthsPaid && Array.isArray(payment.monthsPaid)) {
        const covers = payment.monthsPaid.some(month => 
          month.toLowerCase().includes(currentMonth.shortName.toLowerCase())
        );
        if (covers) paidSet.add(targetId);
      }
    });
    return paidSet;
  }, [allPayments, getCurrentMonthInfo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));
      const membersList = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllMembers(membersList);

      const paymentsSnapshot = await getDocs(collection(db, "payments"));
      const paymentsList = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllPayments(paymentsList);
      
      const paidSet = calculatePaidStatus();
      setCurrentMonthPaidSet(paidSet);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast("Error loading members", true);
    } finally {
      setLoading(false);
    }
  }, [calculatePaidStatus, showToast]);

  // FIXED: Empty dependency array - runs only once on mount
  useEffect(() => {
    loadData();
  }, []);

  const deleteMemberById = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, "members", id));
      return true;
    } catch (error) {
      console.error('Error deleting member:', error);
      return false;
    }
  }, []);

  const getInitials = useCallback((name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'M';
  }, []);

  const getFilteredMembers = useCallback(() => {
    let filtered = [...allMembers];
    
    if (paymentStatusFilter === 'paid') {
      filtered = filtered.filter(m => currentMonthPaidSet.has(m.id));
    } else if (paymentStatusFilter === 'unpaid') {
      filtered = filtered.filter(m => !currentMonthPaidSet.has(m.id));
    }
    
    if (searchTerm) {
      filtered = filtered.filter(m => 
        m.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.phone?.includes(searchTerm)
      );
    }
    
    if (deptFilter !== 'all') {
      filtered = filtered.filter(m => m.department === deptFilter);
    }
    
    if (yearFilter !== 'all') {
      filtered = filtered.filter(m => m.batchYear === yearFilter);
    }
    
    return filtered;
  }, [allMembers, currentMonthPaidSet, paymentStatusFilter, searchTerm, deptFilter, yearFilter]);

  const sendTelegramReminder = useCallback(async (memberId, memberName, telegram, e) => {
    if (e) e.stopPropagation();
    
    if (!telegram || telegram.trim() === "") {
      showToast(`❌ ${memberName} has no Telegram username`, true);
      return false;
    }
    
    const month = getCurrentMonthInfo();
    const message = `🔔 JUMJ Payment Reminder\n\nDear ${memberName},\n\nYour payment for ${month.display} is pending.\nPlease complete your contribution.\n\nThank you!`;
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegram, text: message })
      });
      
      if (response.ok) {
        showToast(`✅ Reminder sent to ${memberName} via Telegram`);
        return true;
      } else {
        showToast(`❌ Failed to send reminder to ${memberName}`, true);
        return false;
      }
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      showToast(`❌ Failed to send reminder to ${memberName}`, true);
      return false;
    }
  }, [getCurrentMonthInfo, showToast]);

  const bulkSendReminders = useCallback(async () => {
    const selectedMembers = allMembers.filter(m => selectedMemberIds.has(m.id));
    const membersWithTelegram = selectedMembers.filter(m => m.telegram && m.telegram.trim());
    
    if (membersWithTelegram.length === 0) {
      showToast("❌ No selected members have Telegram username", true);
      return;
    }
    
    showToast(`📨 Sending reminders to ${membersWithTelegram.length} member(s)...`);
    
    let successCount = 0;
    for (const member of membersWithTelegram) {
      const success = await sendTelegramReminder(member.id, member.fullName, member.telegram, null);
      if (success) successCount++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    showToast(`✅ Sent ${successCount} of ${membersWithTelegram.length} reminders`);
    setSelectedMemberIds(new Set());
  }, [allMembers, selectedMemberIds, sendTelegramReminder, showToast]);

  const toggleSelectMember = useCallback((memberId) => {
    setSelectedMemberIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const filtered = getFilteredMembers();
    setSelectedMemberIds(prev => {
      const newSet = new Set(prev);
      filtered.forEach(m => newSet.add(m.id));
      return newSet;
    });
  }, [getFilteredMembers]);

  const deselectAll = useCallback(() => {
    setSelectedMemberIds(new Set());
  }, []);

  const openEditModal = useCallback((member, e) => {
    if (e) e.stopPropagation();
    setCurrentEditingMember(member);
    setEditForm({
      fullName: member.fullName || '',
      email: member.email || '',
      phone: member.phone || '',
      telegram: member.telegram || '',
      department: member.department || '',
      batchYear: member.batchYear || '',
      role: member.role || 'member'
    });
    setShowEditModal(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setCurrentEditingMember(null);
  }, []);

  const handleEditSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!currentEditingMember) return;
    
    try {
      await updateDoc(doc(db, "members", currentEditingMember.id), {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone,
        telegram: editForm.telegram,
        department: editForm.department,
        batchYear: editForm.batchYear,
        role: editForm.role
      });
      showToast("✅ Member updated successfully");
      closeEditModal();
      await loadData();
    } catch (error) {
      console.error('Error updating member:', error);
      showToast("❌ Error updating member", true);
    }
  }, [currentEditingMember, editForm, showToast, closeEditModal, loadData]);

  const handleSendResetEmail = useCallback(async (e) => {
    if (e) e.stopPropagation();
    if (!currentEditingMember) return;
    const email = editForm.email;
    if (email) {
      try {
        await sendPasswordResetEmail(auth, email);
        showToast(`📧 Password reset email sent to ${email}`);
      } catch (error) {
        showToast("❌ Failed to send reset email", true);
      }
    } else {
      showToast("❌ No email address", true);
    }
  }, [currentEditingMember, editForm.email, showToast, auth]);

  const showConfirm = useCallback((message, onConfirm) => {
    setConfirmData({ message, onConfirm: () => {
      onConfirm();
      setShowConfirmDialog(false);
    }});
    setShowConfirmDialog(true);
  }, []);

  const handleDeleteMember = useCallback(async (memberId, memberName, e) => {
    if (e) e.stopPropagation();
    showConfirm(`Delete "${memberName}"? This action cannot be undone.`, async () => {
      if (await deleteMemberById(memberId)) {
        showToast(`🗑️ Deleted ${memberName}`);
        setSelectedMemberIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(memberId);
          return newSet;
        });
        await loadData();
      } else {
        showToast("❌ Failed to delete member", true);
      }
    });
  }, [deleteMemberById, showConfirm, showToast, loadData]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedMemberIds.size === 0) {
      showToast("No members selected", true);
      return;
    }
    showConfirm(`Delete ${selectedMemberIds.size} member(s)? This action cannot be undone.`, async () => {
      let success = 0;
      for (const id of selectedMemberIds) {
        if (await deleteMemberById(id)) success++;
      }
      showToast(`🗑️ Deleted ${success} member(s)`);
      setSelectedMemberIds(new Set());
      await loadData();
    });
  }, [selectedMemberIds, deleteMemberById, showConfirm, showToast, loadData]);

  const exportToCSV = useCallback(() => {
    const filtered = getFilteredMembers();
    const rows = [["Full Name", "Email", "Phone", "Telegram", "Department", "Batch Year", "Role", "Payment Status"]];
    
    filtered.forEach(m => {
      const isPaid = currentMonthPaidSet.has(m.id);
      rows.push([
        `"${m.fullName || ""}"`,
        `"${m.email || ""}"`,
        `"${m.phone || ""}"`,
        `"${m.telegram || ""}"`,
        `"${m.department || ""}"`,
        `"${m.batchYear || ""}"`,
        `"${m.role || "member"}"`,
        isPaid ? "Paid" : "Unpaid"
      ]);
    });
    
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `members_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("✅ CSV exported successfully");
  }, [getFilteredMembers, currentMonthPaidSet, showToast]);

  const getDepartments = useCallback(() => {
    return [...new Set(allMembers.map(m => m.department).filter(Boolean))];
  }, [allMembers]);

  const getBatchYears = useCallback(() => {
    return [...new Set(allMembers.map(m => m.batchYear).filter(Boolean))].sort().reverse();
  }, [allMembers]);

  const filteredMembers = getFilteredMembers();
  const departments = getDepartments();
  const batchYears = getBatchYears();
  const totalMembers = allMembers.length;
  const paidCount = currentMonthPaidSet.size;
  const unpaidCount = totalMembers - paidCount;
  const currentMonth = getCurrentMonthInfo();

  if (loading) {
    return (
      <div className="members-page">
        <div className="app-container">
          <div className="members-header">
            <div className="header-title">
              <h1>Member Management</h1>
              <p>View, edit, and manage all registered members</p>
            </div>
          </div>
          <div className="stats-row">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-icon"></div>
                <div className="skeleton-text"></div>
                <div className="skeleton-text small"></div>
              </div>
            ))}
          </div>
          <div className="skeleton-filter-bar"></div>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-member-card">
              <div className="skeleton-avatar"></div>
              <div className="skeleton-details">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
                <div className="skeleton-line"></div>
              </div>
            </div>
          ))}
        </div>
        <style>{`
          .skeleton-card {
            flex: 0 0 auto;
            width: calc(25% - 9px);
            min-width: 140px;
            background: white;
            border-radius: 20px;
            padding: 16px;
            animation: skeletonPulse 1.5s ease-in-out infinite;
          }
          .skeleton-icon {
            width: 44px;
            height: 44px;
            background: #e2e8f0;
            border-radius: 14px;
            margin-bottom: 12px;
          }
          .skeleton-text {
            height: 24px;
            background: #e2e8f0;
            border-radius: 8px;
            margin-bottom: 8px;
          }
          .skeleton-text.small {
            height: 12px;
            width: 60%;
          }
          .skeleton-filter-bar {
            height: 120px;
            background: white;
            border-radius: 24px;
            margin-bottom: 16px;
            animation: skeletonPulse 1.5s ease-in-out infinite;
          }
          .skeleton-member-card {
            background: white;
            border-radius: 20px;
            padding: 16px;
            margin-bottom: 12px;
            display: flex;
            gap: 14px;
            animation: skeletonPulse 1.5s ease-in-out infinite;
          }
          .skeleton-avatar {
            width: 52px;
            height: 52px;
            background: #e2e8f0;
            border-radius: 18px;
          }
          .skeleton-details {
            flex: 1;
          }
          .skeleton-line {
            height: 16px;
            background: #e2e8f0;
            border-radius: 8px;
            margin-bottom: 8px;
          }
          .skeleton-line.short {
            width: 60%;
          }
          @keyframes skeletonPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="members-page">
      <div className="app-container">
        <div className="members-header">
          <div className="header-title">
            <h1>Member Management</h1>
            <p>Tap any card to select • Bulk actions available</p>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dbeafe' }}>
              <i className="fa fa-users" style={{ color: '#3b82f6' }}></i>
            </div>
            <h3>{totalMembers}</h3>
            <p>Total Members</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#d1fae5' }}>
              <i className="fa fa-check-circle" style={{ color: '#10b981' }}></i>
            </div>
            <h3>{paidCount}</h3>
            <p>Paid This Month</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fee2e2' }}>
              <i className="fa fa-clock" style={{ color: '#ef4444' }}></i>
            </div>
            <h3>{unpaidCount}</h3>
            <p>Unpaid</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fef3c7' }}>
              <i className="fa fa-calendar" style={{ color: '#f59e0b' }}></i>
            </div>
            <h3>{currentMonth.display.slice(0, 10)}</h3>
            <p>Current Month</p>
          </div>
        </div>

        <div className="action-bar-top">
          <div className="bulk-actions">
            <button className="btn-secondary" onClick={selectAllVisible}>
              <i className="fa fa-check-double"></i> Select All
            </button>
            <button className="btn-secondary" onClick={deselectAll}>
              <i className="fa fa-times"></i> Clear
            </button>
            <button className="btn-danger" onClick={handleBulkDelete}>
              <i className="fa fa-trash-alt"></i> Delete
            </button>
            {selectedMemberIds.size > 0 && (
              <button className="btn-telegram" onClick={bulkSendReminders}>
                <i className="fab fa-telegram"></i> Remind ({selectedMemberIds.size})
              </button>
            )}
          </div>
          <button className="btn-primary" onClick={exportToCSV}>
            <i className="fa fa-download"></i> Export CSV
          </button>
        </div>

        <div className="filter-bar">
          <div className="filter-row">
            <div className="filter-group search-group">
              <label><i className="fa fa-search"></i> Search Member</label>
              <input 
                type="text" 
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label><i className="fa fa-credit-card"></i> Payment Status</label>
              <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
                <option value="all">All Members</option>
                <option value="paid">Paid This Month</option>
                <option value="unpaid">Unpaid This Month</option>
              </select>
            </div>
            <div className="filter-group">
              <label><i className="fa fa-building"></i> Department</label>
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="all">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label><i className="fa fa-calendar"></i> Batch Year</label>
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="all">All Years</option>
                {batchYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button className="reset-filters" onClick={() => {
              setSearchTerm('');
              setPaymentStatusFilter('all');
              setDeptFilter('all');
              setYearFilter('all');
            }}>
              <i className="fa fa-undo"></i> Reset Filters
            </button>
          </div>
        </div>

        <div className="members-grid">
          {filteredMembers.length === 0 ? (
            <div className="empty-state">
              <i className="fa fa-users-slash"></i>
              <h3>No members found</h3>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredMembers.map(member => {
              const isPaid = currentMonthPaidSet.has(member.id);
              const isSelected = selectedMemberIds.has(member.id);
              const roleInfo = roleOptions.find(r => r.value === member.role) || roleOptions[1];
              
              return (
                <div 
                  key={member.id} 
                  className={`member-card ${isSelected ? 'selected' : ''} ${!isPaid ? 'unpaid' : ''}`}
                  onClick={() => toggleSelectMember(member.id)}
                >
                  {isSelected && (
                    <div className="selection-indicator">
                      <i className="fa fa-check"></i>
                    </div>
                  )}
                  
                  <div className="member-card-header">
                    <div className="member-avatar">{getInitials(member.fullName)}</div>
                    <div className="member-basic">
                      <h3>{member.fullName || "Unknown"}</h3>
                      <p>{member.email || "No email"}</p>
                    </div>
                    <div className={`payment-status ${isPaid ? 'status-paid' : 'status-unpaid'}`}>
                      {isPaid ? '✓ Paid' : '⚠ Unpaid'}
                    </div>
                  </div>
                  
                  <div className="member-details">
                    <div className="detail-item">
                      <i className="fa fa-phone"></i>
                      <span>{member.phone || "No phone"}</span>
                    </div>
                    <div className="detail-item">
                      <i className="fab fa-telegram"></i>
                      <span>{member.telegram || "No telegram"}</span>
                    </div>
                    <div className="detail-item">
                      <i className="fa fa-building"></i>
                      <span>{member.department || "No department"}</span>
                    </div>
                    <div className="detail-item">
                      <i className="fa fa-calendar"></i>
                      <span>{member.batchYear || "No batch"}</span>
                    </div>
                    <div className="detail-item role-item">
                      <i className={`fa ${roleInfo.icon}`} style={{ color: roleInfo.color }}></i>
                      <span style={{ color: roleInfo.color, fontWeight: '500' }}>{roleInfo.label}</span>
                    </div>
                  </div>
                  
                  <div className="member-footer">
                    {!isPaid && (
                      <button 
                        className="action-btn remind" 
                        onClick={(e) => sendTelegramReminder(member.id, member.fullName, member.telegram, e)}
                      >
                        <i className="fab fa-telegram"></i> Remind
                      </button>
                    )}
                    <button className="action-btn edit" onClick={(e) => openEditModal(member, e)}>
                      <i className="fa fa-pen"></i> Edit
                    </button>
                    <button className="action-btn delete" onClick={(e) => handleDeleteMember(member.id, member.fullName, e)}>
                      <i className="fa fa-trash"></i> Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={`bulk-actions-bar ${selectedMemberIds.size > 0 ? 'show' : ''}`}>
        <span className="bulk-selected">
          <i className="fa fa-check-circle"></i> {selectedMemberIds.size} member(s) selected
        </span>
        <div className="bulk-buttons">
          <button className="bulk-btn remind" onClick={bulkSendReminders}>
            <i className="fab fa-telegram"></i> Remind All
          </button>
          <button className="bulk-btn delete" onClick={handleBulkDelete}>
            <i className="fa fa-trash-alt"></i> Delete
          </button>
          <button className="bulk-btn close" onClick={deselectAll}>
            <i className="fa fa-times"></i> Close
          </button>
        </div>
      </div>

      <div className={`modal-overlay ${showEditModal ? 'show' : ''}`} onClick={closeEditModal}>
        <div className="edit-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><i className="fa fa-user-edit"></i> Edit Member</h2>
            <p>Update member information and role</p>
            <button className="close-modal" onClick={closeEditModal}>
              <i className="fa fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label><i className="fa fa-user"></i> Full Name</label>
                <input 
                  type="text" 
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div className="form-group">
                <label><i className="fa fa-envelope"></i> Email Address</label>
                <input 
                  type="email" 
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label><i className="fa fa-phone"></i> Phone Number</label>
                <input 
                  type="tel" 
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  placeholder="+251 XX XXX XXXX"
                />
              </div>
              <div className="form-group">
                <label><i className="fab fa-telegram"></i> Telegram Username</label>
                <input 
                  type="text" 
                  value={editForm.telegram}
                  onChange={(e) => setEditForm({...editForm, telegram: e.target.value})}
                  placeholder="@username"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label><i className="fa fa-building"></i> Department</label>
                  <input 
                    type="text" 
                    value={editForm.department}
                    onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                    placeholder="e.g., Computer Science"
                  />
                </div>
                <div className="form-group">
                  <label><i className="fa fa-calendar"></i> Batch Year</label>
                  <input 
                    type="text" 
                    value={editForm.batchYear}
                    onChange={(e) => setEditForm({...editForm, batchYear: e.target.value})}
                    placeholder="e.g., 2024"
                  />
                </div>
              </div>
              <div className="form-group">
                <label><i className="fa fa-shield-alt"></i> User Role</label>
                <select 
                  value={editForm.role}
                  onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                  className="role-select"
                >
                  {roleOptions.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.value === 'admin' ? 'Full access' : role.value === 'member' ? 'Standard access' : 'Read-only access'}
                    </option>
                  ))}
                </select>
                <small className="role-hint">
                  <i className="fa fa-info-circle"></i> 
                  {editForm.role === 'admin' ? 'Admins have full access to all features' : 
                    editForm.role === 'member' ? 'Members can make payments and view their profile' : 
                    'Viewers can only see information'}
                </small>
              </div>
              <div className="divider">
                <h4><i className="fa fa-key"></i> Account Security</h4>
                <button type="button" className="reset-password-btn" onClick={handleSendResetEmail}>
                  <i className="fa fa-paper-plane"></i> Send Password Reset Link
                </button>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeEditModal}>
                  <i className="fa fa-times"></i> Cancel
                </button>
                <button type="submit" className="btn-save">
                  <i className="fa fa-save"></i> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className={`confirm-overlay ${showConfirmDialog ? 'show' : ''}`} onClick={() => setShowConfirmDialog(false)}>
        <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon">
            <i className="fa fa-exclamation-triangle"></i>
          </div>
          <h3>Confirm Delete</h3>
          <p>{confirmData.message}</p>
          <div className="confirm-actions">
            <button className="confirm-cancel" onClick={() => setShowConfirmDialog(false)}>
              <i className="fa fa-times"></i> Cancel
            </button>
            <button className="confirm-delete" onClick={confirmData.onConfirm}>
              <i className="fa fa-trash"></i> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
 <style>{`
       /* ============================================
   MEMBERS PAGE - COMPLETE UNIFIED CSS
   Tap-to-Select • Bulk Actions • Glassmorphism
   ============================================ */

/* Import Font Awesome */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css');

/* ============================================
   GLOBAL STYLES
   ============================================ */
:root {
  --primary: #4f46e5;
  --primary-light: #818cf8;
  --primary-dark: #4338ca;
  --success: #10b981;
  --success-light: #34d399;
  --danger: #ef4444;
  --danger-light: #f87171;
  --warning: #f59e0b;
  --info: #06b6d4;
  --telegram: #3b82f6;
  
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #64748b;
  
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(255, 255, 255, 0.8);
  --blur-sm: blur(8px);
  --blur-md: blur(16px);
  --blur-lg: blur(24px);
  
  --shadow-sm: 0 4px 12px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 10px 30px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.12);
  --shadow-xl: 0 30px 70px rgba(15, 23, 42, 0.15);
  
  --transition-fast: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-bounce: all 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
}

/* ============================================
   MEMBERS PAGE MAIN CONTAINER
   ============================================ */
.members-page {
  min-height: 100vh;
  background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
  position: relative;
}

.members-page::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 0% 0%, rgba(79, 70, 229, 0.06) 0%, transparent 40%),
    radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.06) 0%, transparent 40%);
  pointer-events: none;
  z-index: -1;
}

/* App Container */
.members-page .app-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 20px 100px;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}

@media (min-width: 1280px) {
  .members-page .app-container {
    max-width: 1280px;
  }
}

/* ============================================
   HEADER SECTION
   ============================================ */
.members-page .members-header {
  margin-bottom: 32px;
  padding: 8px 0;
}

.members-page .header-title h1 {
  font-size: 36px;
  font-weight: 800;
  background: linear-gradient(135deg, #0f172a 0%, var(--primary) 50%, var(--info) 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}

.members-page .header-title p {
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-page .header-title p::before {
  content: '👆';
  font-size: 14px;
}

/* ============================================
   STATS CARDS
   ============================================ */
.members-page .stats-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 12px;
  margin-bottom: 32px;
  -webkit-overflow-scrolling: touch;
}

.members-page .stats-row::-webkit-scrollbar {
  display: none;
}

.members-page .stat-card {
  flex: 0 0 auto;
  width: calc(25% - 12px);
  min-width: 150px;
  background: var(--glass-bg);
  backdrop-filter: var(--blur-md);
  border-radius: 28px;
  padding: 20px 18px;
  scroll-snap-align: start;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--glass-border);
  transition: var(--transition-bounce);
  position: relative;
  overflow: hidden;
}

.members-page .stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--primary), var(--info));
  opacity: 0;
  transition: var(--transition-base);
}

.members-page .stat-card:hover::before {
  opacity: 1;
}

.members-page .stat-card:hover {
  transform: translateY(-6px) scale(1.02);
  box-shadow: var(--shadow-lg);
  border-color: rgba(79, 70, 229, 0.2);
}

.members-page .stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  margin-bottom: 16px;
  transition: var(--transition-base);
}

.members-page .stat-card:hover .stat-icon {
  transform: scale(1.05) rotate(5deg);
}

.members-page .stat-card h3 {
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 4px;
  background: linear-gradient(135deg, var(--text-primary), var(--primary-dark));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.members-page .stat-card p {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ============================================
   ACTION BAR
   ============================================ */
.members-page .action-bar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.members-page .bulk-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.members-page .btn-secondary {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  border: 1px solid var(--glass-border);
  padding: 12px 20px;
  border-radius: 40px;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
}

.members-page .btn-secondary:hover {
  background: white;
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--primary-light);
}

.members-page .btn-secondary:active {
  transform: translateY(0) scale(0.98);
}

.members-page .btn-danger {
  background: rgba(239, 68, 68, 0.1);
  backdrop-filter: var(--blur-sm);
  border: 1px solid rgba(239, 68, 68, 0.2);
  padding: 12px 20px;
  border-radius: 40px;
  color: var(--danger);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-page .btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  transform: translateY(-2px);
  border-color: var(--danger);
}

.members-page .btn-danger:active {
  transform: translateY(0) scale(0.98);
}

.members-page .btn-telegram {
  background: rgba(59, 130, 246, 0.1);
  backdrop-filter: var(--blur-sm);
  border: 1px solid rgba(59, 130, 246, 0.2);
  padding: 12px 20px;
  border-radius: 40px;
  color: var(--telegram);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-page .btn-telegram:hover {
  background: rgba(59, 130, 246, 0.15);
  transform: translateY(-2px);
}

.members-page .btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  border: none;
  padding: 12px 24px;
  border-radius: 40px;
  color: white;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  position: relative;
  overflow: hidden;
}

.members-page .btn-primary::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.members-page .btn-primary:hover::before {
  width: 300px;
  height: 300px;
}

.members-page .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
}

.members-page .btn-primary:active {
  transform: translateY(0) scale(0.98);
}

/* ============================================
   FILTER BAR
   ============================================ */
.members-page .filter-bar {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-md);
  border-radius: 32px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--glass-border);
  transition: var(--transition-base);
}

.members-page .filter-bar:hover {
  box-shadow: var(--shadow-lg);
}

.members-page .filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.members-page .filter-group {
  flex: 1;
  min-width: 160px;
}

.members-page .filter-group label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.members-page .filter-group input,
.members-page .filter-group select {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.9);
  transition: var(--transition-base);
}

.members-page .filter-group input:hover,
.members-page .filter-group select:hover {
  border-color: var(--primary-light);
}

.members-page .filter-group input:focus,
.members-page .filter-group select:focus {
  border-color: var(--primary);
  background: white;
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
  transform: translateY(-1px);
}

.members-page .search-group {
  flex: 2;
  min-width: 200px;
}

.members-page .search-group input {
  padding-left: 48px;
  background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%2394a3b8"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>');
  background-repeat: no-repeat;
  background-position: 18px center;
  background-size: 20px;
}

.members-page .reset-filters {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  border: 1px solid var(--glass-border);
  padding: 14px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.members-page .reset-filters:hover {
  background: white;
  transform: translateY(-2px);
  border-color: var(--primary);
}

.members-page .reset-filters:active {
  transform: translateY(0) scale(0.98);
}

/* ============================================
   MEMBERS GRID & CARDS
   ============================================ */
.members-page .members-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Member Card - Tap to Select */
.members-page .member-card {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-md);
  border-radius: 32px;
  padding: 20px;
  transition: var(--transition-bounce);
  border: 1px solid var(--glass-border);
  position: relative;
  cursor: pointer;
  animation: cardFadeIn 0.4s ease-out;
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.members-page .member-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: var(--shadow-lg);
  border-color: rgba(79, 70, 229, 0.3);
  background: rgba(255, 255, 255, 0.95);
}

.members-page .member-card:active {
  transform: scale(0.99);
}

/* Selected State */
.members-page .member-card.selected {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(6, 182, 212, 0.08));
  border: 2px solid var(--primary);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.15), 0 20px 40px rgba(79, 70, 229, 0.2);
}

/* Unpaid Card Left Border Accent */
.members-page .member-card.unpaid {
  border-left: 4px solid var(--danger);
}

/* Selection Indicator Badge */
.members-page .selection-indicator {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--primary), var(--info));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
  animation: indicatorPop 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
  z-index: 10;
}

@keyframes indicatorPop {
  0% {
    transform: scale(0) rotate(-180deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.2) rotate(0deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

/* Card Header */
.members-page .member-card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.members-page .member-avatar {
  width: 60px;
  height: 60px;
  border-radius: 24px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
  transition: var(--transition-base);
  box-shadow: 0 10px 20px rgba(79, 70, 229, 0.3);
}

.members-page .member-card.selected .member-avatar {
  transform: scale(1.05);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
}

.members-page .member-basic {
  flex: 1;
}

.members-page .member-basic h3 {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.members-page .member-card.selected .member-basic h3 {
  color: var(--primary);
}

.members-page .member-basic p {
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-word;
}

/* Payment Status */
.members-page .payment-status {
  padding: 5px 12px;
  border-radius: 30px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.members-page .status-paid {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(52, 211, 153, 0.1));
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.members-page .status-unpaid {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(248, 113, 113, 0.08));
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Member Details */
.members-page .member-details {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.members-page .detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.members-page .detail-item i {
  width: 20px;
  font-size: 14px;
  color: var(--primary-light);
}

.members-page .member-card.selected .detail-item {
  color: var(--text-primary);
}

.members-page .member-card.selected .detail-item i {
  color: var(--primary);
}

/* Footer Buttons */
.members-page .member-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.members-page .action-btn {
  padding: 8px 18px;
  border-radius: 40px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-base);
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}

.members-page .action-btn.remind {
  background: var(--telegram);
  color: white;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.members-page .action-btn.remind:hover {
  transform: translateY(-2px);
  background: #2563eb;
}

.members-page .action-btn.edit {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
}

.members-page .action-btn.edit:hover {
  background: white;
  transform: translateY(-2px);
}

.members-page .action-btn.delete {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.members-page .action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  transform: translateY(-2px);
}

/* ============================================
   BULK ACTIONS FLOATING BAR
   ============================================ */
.members-page .bulk-actions-bar {
  position: fixed;
  bottom: 100px;
  left: 20px;
  right: 20px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(25px);
  border-radius: 80px;
  padding: 12px 24px;
  display: none;
  gap: 16px;
  z-index: 200;
  box-shadow: var(--shadow-xl);
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  transition: var(--transition-bounce);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

@media (min-width: 768px) {
  .members-page .bulk-actions-bar {
    left: auto;
    right: 20px;
    width: auto;
    min-width: 360px;
  }
}

.members-page .bulk-actions-bar.show {
  display: flex;
  animation: slideUp 0.4s cubic-bezier(0.34, 1.2, 0.64, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(100px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.members-page .bulk-selected {
  background: rgba(255, 255, 255, 0.15);
  padding: 8px 18px;
  border-radius: 60px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
}

.members-page .bulk-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.members-page .bulk-btn {
  padding: 8px 20px;
  border-radius: 60px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  transition: var(--transition-base);
  font-family: inherit;
}

.members-page .bulk-btn.remind {
  background: var(--telegram);
  color: white;
}

.members-page .bulk-btn.remind:hover {
  transform: translateY(-2px);
  background: #2563eb;
}

.members-page .bulk-btn.delete {
  background: var(--danger);
  color: white;
}

.members-page .bulk-btn.delete:hover {
  transform: translateY(-2px);
  background: #dc2626;
}

.members-page .bulk-btn.close {
  background: #475569;
  color: white;
}

.members-page .bulk-btn.close:hover {
  transform: translateY(-2px);
  background: #334155;
}

/* ============================================
   EDIT MODAL - BOTTOM SHEET
   ============================================ */
.members-page .modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: var(--transition-base);
}

.members-page .modal-overlay.show {
  opacity: 1;
  visibility: visible;
}

.members-page .edit-modal {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(30px);
  border-radius: 40px 40px 0 0;
  width: 100%;
  max-width: 550px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: sheetSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.15);
}

@keyframes sheetSlideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.members-page .edit-modal .modal-header {
  padding: 24px 28px 20px;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: white;
  position: relative;
  flex-shrink: 0;
}

.members-page .edit-modal .modal-header h2 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 6px;
  letter-spacing: -0.3px;
}

.members-page .edit-modal .modal-header h2 i {
  margin-right: 10px;
}

.members-page .edit-modal .modal-header p {
  font-size: 13px;
  opacity: 0.8;
}

.members-page .edit-modal .close-modal {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-base);
}

.members-page .edit-modal .close-modal:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

.members-page .edit-modal .close-modal:active {
  transform: scale(0.95);
}

.members-page .edit-modal .modal-body {
  padding: 24px;
  overflow-y: auto;
}

.members-page .edit-modal .form-group {
  margin-bottom: 20px;
}

.members-page .edit-modal .form-group label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.members-page .edit-modal .form-group label i {
  margin-right: 6px;
}

.members-page .edit-modal .form-group input,
.members-page .edit-modal .form-group select {
  width: 100%;
  padding: 14px 18px;
  border: 1.5px solid rgba(0, 0, 0, 0.06);
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  background: rgba(255, 255, 255, 0.95);
  font-family: inherit;
  transition: var(--transition-base);
}

.members-page .edit-modal .form-group input:focus,
.members-page .edit-modal .form-group select:focus {
  border-color: var(--primary);
  background: white;
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
  transform: translateY(-1px);
}

.members-page .edit-modal .form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.members-page .edit-modal .role-hint {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.members-page .edit-modal .role-hint i {
  margin-right: 4px;
}

.members-page .edit-modal .divider {
  margin: 20px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding-top: 20px;
}

.members-page .edit-modal .divider h4 {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}

.members-page .edit-modal .reset-password-btn {
  width: 100%;
  padding: 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #b45309;
  border: none;
  font-weight: 700;
  cursor: pointer;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: inherit;
}

.members-page .edit-modal .reset-password-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.members-page .edit-modal .reset-password-btn:active {
  transform: translateY(0) scale(0.97);
}

.members-page .edit-modal .modal-actions {
  display: flex;
  gap: 14px;
  margin-top: 24px;
}

.members-page .edit-modal .modal-actions button {
  flex: 1;
  padding: 14px;
  border-radius: 40px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.members-page .edit-modal .btn-save {
  background: linear-gradient(135deg, var(--success), #059669);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.members-page .edit-modal .btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
}

.members-page .edit-modal .btn-save:active {
  transform: translateY(0) scale(0.97);
}

.members-page .edit-modal .btn-cancel {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
}

.members-page .edit-modal .btn-cancel:hover {
  background: white;
  transform: translateY(-2px);
}

.members-page .edit-modal .btn-cancel:active {
  transform: translateY(0) scale(0.97);
}

/* ============================================
   CONFIRMATION DIALOG
   ============================================ */
.members-page .confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  opacity: 0;
  visibility: hidden;
  transition: var(--transition-base);
}

.members-page .confirm-overlay.show {
  opacity: 1;
  visibility: visible;
}

.members-page .confirm-dialog {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px);
  border-radius: 48px;
  padding: 32px 28px;
  width: 90%;
  max-width: 360px;
  text-align: center;
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-xl);
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.members-page .confirm-dialog .confirm-icon i {
  font-size: 64px;
  color: var(--danger);
  margin-bottom: 20px;
  display: inline-block;
  animation: shake 0.5s ease;
}

@keyframes shake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

.members-page .confirm-dialog h3 {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.members-page .confirm-dialog p {
  color: var(--text-tertiary);
  font-size: 14px;
  margin-bottom: 28px;
  line-height: 1.5;
}

.members-page .confirm-actions {
  display: flex;
  gap: 12px;
}

.members-page .confirm-actions button {
  flex: 1;
  padding: 14px;
  border-radius: 60px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
}

.members-page .confirm-cancel {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  color: var(--text-secondary);
  border: 1px solid var(--glass-border);
}

.members-page .confirm-cancel:hover {
  background: white;
  transform: translateY(-2px);
}

.members-page .confirm-cancel:active {
  transform: translateY(0) scale(0.97);
}

.members-page .confirm-delete {
  background: linear-gradient(135deg, var(--danger), #dc2626);
  color: white;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.members-page .confirm-delete:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.4);
}

.members-page .confirm-delete:active {
  transform: translateY(0) scale(0.97);
}

/* ============================================
   TOAST NOTIFICATION
   ============================================ */
.members-page .toast {
  position: fixed;
  bottom: 100px;
  left: 20px;
  right: 20px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(20px);
  color: white;
  text-align: center;
  padding: 16px;
  border-radius: 80px;
  z-index: 1001;
  font-weight: 600;
  font-size: 14px;
  animation: toastSlideUp 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
  box-shadow: var(--shadow-xl);
  border: 1px solid rgba(255, 255, 255, 0.1);
  letter-spacing: 0.3px;
}

@media (min-width: 768px) {
  .members-page .toast {
    left: auto;
    right: 20px;
    min-width: 320px;
    width: auto;
  }
}

@keyframes toastSlideUp {
  from {
    transform: translateY(100px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ============================================
   EMPTY STATE
   ============================================ */
.members-page .empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
  background: var(--glass-bg);
  backdrop-filter: var(--blur-md);
  border-radius: 40px;
  border: 1px solid var(--glass-border);
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.members-page .empty-state i {
  font-size: 80px;
  margin-bottom: 20px;
  display: block;
  opacity: 0.7;
}

.members-page .empty-state h3 {
  font-size: 20px;
  margin-bottom: 10px;
  color: var(--text-secondary);
  font-weight: 700;
}

.members-page .empty-state p {
  font-size: 14px;
}

/* ============================================
   SKELETON LOADER
   ============================================ */
.members-page .skeleton-card {
  flex: 0 0 auto;
  width: calc(25% - 12px);
  min-width: 140px;
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  border-radius: 28px;
  padding: 20px;
  animation: skeletonPulse 1.5s ease-in-out infinite;
  border: 1px solid var(--glass-border);
}

.members-page .skeleton-icon {
  width: 56px;
  height: 56px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 20px;
  margin-bottom: 16px;
}

.members-page .skeleton-text {
  height: 24px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  margin-bottom: 8px;
}

.members-page .skeleton-text.small {
  height: 12px;
  width: 60%;
}

.members-page .skeleton-filter-bar {
  height: 140px;
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  border-radius: 32px;
  margin-bottom: 20px;
  animation: skeletonPulse 1.5s ease-in-out infinite;
  border: 1px solid var(--glass-border);
}

.members-page .skeleton-member-card {
  background: var(--glass-bg);
  backdrop-filter: var(--blur-sm);
  border-radius: 32px;
  padding: 20px;
  margin-bottom: 16px;
  display: flex;
  gap: 16px;
  animation: skeletonPulse 1.5s ease-in-out infinite;
  border: 1px solid var(--glass-border);
}

.members-page .skeleton-avatar {
  width: 60px;
  height: 60px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 24px;
  flex-shrink: 0;
}

.members-page .skeleton-details {
  flex: 1;
}

.members-page .skeleton-line {
  height: 16px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  margin-bottom: 8px;
}

.members-page .skeleton-line.short {
  width: 60%;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ============================================
   RESPONSIVE DESIGN
   ============================================ */
@media (max-width: 768px) {
  .members-page .app-container {
    padding: 16px 16px 100px;
  }

  .members-page .stat-card {
    min-width: 130px;
    padding: 16px;
  }

  .members-page .stat-card h3 {
    font-size: 24px;
  }

  .members-page .filter-group {
    min-width: 100%;
  }

  .members-page .edit-modal .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .members-page .member-details {
    flex-direction: column;
    gap: 10px;
  }

  .members-page .member-footer {
    flex-wrap: wrap;
  }

  .members-page .action-btn {
    flex: 1;
    justify-content: center;
  }

  .members-page .bulk-actions-bar {
    bottom: 80px;
    flex-direction: column;
    border-radius: 32px;
  }

  .members-page .bulk-buttons {
    width: 100%;
  }

  .members-page .bulk-btn {
    flex: 1;
    text-align: center;
  }

  .members-page .member-card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .members-page .payment-status {
    align-self: flex-start;
  }

  .members-page .action-bar-top {
    flex-direction: column;
    align-items: stretch;
  }

  .members-page .btn-primary {
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .members-page .member-details {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .members-page .member-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .members-page .payment-status {
    margin-left: 0;
  }
  
  .members-page .member-footer {
    flex-direction: column;
  }
  
  .members-page .action-btn {
    width: 100%;
    justify-content: center;
  }
  
  .members-page .bulk-actions {
    flex-wrap: wrap;
  }

  .members-page .action-bar-top {
    flex-direction: column;
    align-items: stretch;
  }

  .members-page .btn-primary {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .members-page .stat-card {
    min-width: 110px;
    padding: 14px;
  }

  .members-page .stat-card h3 {
    font-size: 20px;
  }

  .members-page .stat-icon {
    width: 48px;
    height: 48px;
    font-size: 22px;
  }

  .members-page .member-avatar {
    width: 50px;
    height: 50px;
    font-size: 20px;
  }

  .members-page .member-basic h3 {
    font-size: 15px;
  }

  .members-page .action-btn {
    padding: 8px 12px;
    font-size: 11px;
  }

  .members-page .edit-modal .modal-header h2 {
    font-size: 20px;
  }

  .members-page .header-title h1 {
    font-size: 28px;
  }
}

/* ============================================
   PERFORMANCE & ACCESSIBILITY
   ============================================ */
.members-page .stat-card,
.members-page .member-card,
.members-page .btn-primary,
.members-page .btn-secondary,
.members-page .btn-danger,
.members-page .action-btn,
.members-page .bulk-btn {
  will-change: transform;
}

.members-page *:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
      `}</style>
export default Members;