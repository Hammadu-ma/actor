import React, { useState, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { 
  collection, getDocs, doc, updateDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';

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
    { value: 'admin', label: 'Admin', icon: 'fa-crown', color: '#f59e0b' },
    { value: 'member', label: 'Member', icon: 'fa-user', color: '#3b82f6' },
    { value: 'viewer', label: 'Viewer', icon: 'fa-eye', color: '#10b981' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const getCurrentMonthInfo = () => {
    const now = new Date();
    return {
      name: now.toLocaleString('default', { month: 'long' }),
      shortName: now.toLocaleString('default', { month: 'short' }),
      display: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`
    };
  };

  const calculatePaidStatus = () => {
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
  };

  const loadData = async () => {
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
  };

  const deleteMemberById = async (id) => {
    try {
      await deleteDoc(doc(db, "members", id));
      return true;
    } catch (error) {
      console.error('Error deleting member:', error);
      return false;
    }
  };

  const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'M';
  };

  const getFilteredMembers = () => {
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
  };

  const sendTelegramReminder = async (memberId, memberName, telegram, e) => {
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
  };

  const bulkSendReminders = async () => {
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
  };

  const toggleSelectMember = (memberId) => {
    const newSet = new Set(selectedMemberIds);
    if (newSet.has(memberId)) {
      newSet.delete(memberId);
    } else {
      newSet.add(memberId);
    }
    setSelectedMemberIds(newSet);
  };

  const selectAllVisible = () => {
    const filtered = getFilteredMembers();
    const newSet = new Set(selectedMemberIds);
    filtered.forEach(m => newSet.add(m.id));
    setSelectedMemberIds(newSet);
  };

  const deselectAll = () => {
    setSelectedMemberIds(new Set());
  };

  const openEditModal = (member, e) => {
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
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setCurrentEditingMember(null);
  };

  const handleEditSubmit = async (e) => {
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
  };

  const handleSendResetEmail = async (e) => {
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
  };

  const showConfirm = (message, onConfirm) => {
    setConfirmData({ message, onConfirm: () => {
      onConfirm();
      setShowConfirmDialog(false);
    }});
    setShowConfirmDialog(true);
  };

  const handleDeleteMember = async (memberId, memberName, e) => {
    if (e) e.stopPropagation();
    showConfirm(`Delete "${memberName}"? This action cannot be undone.`, async () => {
      if (await deleteMemberById(memberId)) {
        showToast(`🗑️ Deleted ${memberName}`);
        const newSet = new Set(selectedMemberIds);
        newSet.delete(memberId);
        setSelectedMemberIds(newSet);
        await loadData();
      } else {
        showToast("❌ Failed to delete member", true);
      }
    });
  };

  const handleBulkDelete = async () => {
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
  };

  const exportToCSV = () => {
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
  };

  const showToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'member-toast';
    toast.innerHTML = `<i class="fa ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  };

  const getDepartments = () => {
    return [...new Set(allMembers.map(m => m.department).filter(Boolean))];
  };

  const getBatchYears = () => {
    return [...new Set(allMembers.map(m => m.batchYear).filter(Boolean))].sort().reverse();
  };

  const filteredMembers = getFilteredMembers();
  const departments = getDepartments();
  const batchYears = getBatchYears();
  const totalMembers = allMembers.length;
  const paidCount = currentMonthPaidSet.size;
  const unpaidCount = totalMembers - paidCount;
  const currentMonth = getCurrentMonthInfo();

  if (loading) {
    return (
      <div className="member-dashboard">
        <div className="member-container">
          <div className="member-header">
            <h1>Members</h1>
            <p>Manage your community members</p>
          </div>
          <div className="member-stats-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="member-stat-skeleton">
                <div className="member-stat-skeleton-icon"></div>
                <div className="member-stat-skeleton-text"></div>
              </div>
            ))}
          </div>
          <div className="member-filter-skeleton"></div>
          {[1, 2, 3].map(i => (
            <div key={i} className="member-card-skeleton">
              <div className="member-card-skeleton-avatar"></div>
              <div className="member-card-skeleton-content">
                <div className="member-card-skeleton-line"></div>
                <div className="member-card-skeleton-line short"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="member-dashboard">
      <div className="member-container">
        {/* Header */}
        <div className="member-header">
          <div>
            <h1>Members</h1>
            <p>{totalMembers} total members • {unpaidCount} unpaid</p>
          </div>
          <button className="member-export-btn" onClick={exportToCSV}>
            <i className="fa fa-download"></i> Export
          </button>
        </div>

        {/* Stats Cards */}
        <div className="member-stats-grid">
          <div className="member-stat-card">
            <div className="member-stat-icon users">
              <i className="fa fa-users"></i>
            </div>
            <div className="member-stat-info">
              <h3>{totalMembers}</h3>
              <p>Total Members</p>
            </div>
          </div>
          <div className="member-stat-card">
            <div className="member-stat-icon paid">
              <i className="fa fa-check-circle"></i>
            </div>
            <div className="member-stat-info">
              <h3>{paidCount}</h3>
              <p>Paid</p>
            </div>
          </div>
          <div className="member-stat-card">
            <div className="member-stat-icon unpaid">
              <i className="fa fa-clock"></i>
            </div>
            <div className="member-stat-info">
              <h3>{unpaidCount}</h3>
              <p>Unpaid</p>
            </div>
          </div>
          <div className="member-stat-card">
            <div className="member-stat-icon month">
              <i className="fa fa-calendar"></i>
            </div>
            <div className="member-stat-info">
              <h3>{currentMonth.shortName}</h3>
              <p>Current Month</p>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="member-action-bar">
          <div className="member-bulk-actions">
            <button className="member-btn-secondary" onClick={selectAllVisible}>
              <i className="fa fa-check-double"></i> Select All
            </button>
            <button className="member-btn-secondary" onClick={deselectAll}>
              <i className="fa fa-times"></i> Clear
            </button>
            <button className="member-btn-danger" onClick={handleBulkDelete}>
              <i className="fa fa-trash-alt"></i> Delete
            </button>
            {selectedMemberIds.size > 0 && (
              <button className="member-btn-telegram" onClick={bulkSendReminders}>
                <i className="fab fa-telegram"></i> Remind ({selectedMemberIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="member-filters">
          <div className="member-search">
            <i className="fa fa-search"></i>
            <input 
              type="text" 
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="member-filter-select"
            value={paymentStatusFilter} 
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select 
            className="member-filter-select"
            value={deptFilter} 
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          <select 
            className="member-filter-select"
            value={yearFilter} 
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="all">All Years</option>
            {batchYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button className="member-filter-reset" onClick={() => {
            setSearchTerm('');
            setPaymentStatusFilter('all');
            setDeptFilter('all');
            setYearFilter('all');
          }}>
            <i className="fa fa-undo"></i>
          </button>
        </div>

        {/* Members List - Small Cards */}
        <div className="member-list">
          {filteredMembers.length === 0 ? (
            <div className="member-empty">
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
                  className={`member-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelectMember(member.id)}
                >
                  {isSelected && (
                    <div className="member-card-check">
                      <i className="fa fa-check"></i>
                    </div>
                  )}
                  
                  <div className="member-card-avatar">
                    {getInitials(member.fullName)}
                  </div>
                  
                  <div className="member-card-info">
                    <div className="member-card-name">
                      <h3>{member.fullName || "Unknown"}</h3>
                      <span className={`member-card-status ${isPaid ? 'paid' : 'unpaid'}`}>
                        {isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    <div className="member-card-details">
                      <span><i className="fa fa-envelope"></i> {member.email?.split('@')[0] || "No email"}</span>
                      <span><i className="fa fa-building"></i> {member.department || "No dept"}</span>
                    </div>
                    <div className="member-card-actions">
                      {!isPaid && (
                        <button className="member-action remind" onClick={(e) => sendTelegramReminder(member.id, member.fullName, member.telegram, e)}>
                          <i className="fab fa-telegram"></i>
                        </button>
                      )}
                      <button className="member-action edit" onClick={(e) => openEditModal(member, e)}>
                        <i className="fa fa-pen"></i>
                      </button>
                      <button className="member-action delete" onClick={(e) => handleDeleteMember(member.id, member.fullName, e)}>
                        <i className="fa fa-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <div className={`member-bulk-bar ${selectedMemberIds.size > 0 ? 'show' : ''}`}>
        <span className="member-bulk-count">
          <i className="fa fa-check-circle"></i> {selectedMemberIds.size} selected
        </span>
        <div className="member-bulk-buttons">
          <button className="member-bulk-remind" onClick={bulkSendReminders}>
            <i className="fab fa-telegram"></i> Remind
          </button>
          <button className="member-bulk-delete" onClick={handleBulkDelete}>
            <i className="fa fa-trash-alt"></i> Delete
          </button>
          <button className="member-bulk-close" onClick={deselectAll}>
            <i className="fa fa-times"></i> Close
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="member-modal-overlay" onClick={closeEditModal}>
          <div className="member-modal" onClick={e => e.stopPropagation()}>
            <div className="member-modal-header">
              <h2>Edit Member</h2>
              <button className="member-modal-close" onClick={closeEditModal}>
                <i className="fa fa-times"></i>
              </button>
            </div>
            <div className="member-modal-body">
              <form onSubmit={handleEditSubmit}>
                <div className="member-form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                    required
                  />
                </div>
                <div className="member-form-group">
                  <label>Email</label>
                  <input 
                    type="email" 
                    value={editForm.email}
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    required
                  />
                </div>
                <div className="member-form-row">
                  <div className="member-form-group">
                    <label>Phone</label>
                    <input 
                      type="tel" 
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                    />
                  </div>
                  <div className="member-form-group">
                    <label>Telegram</label>
                    <input 
                      type="text" 
                      value={editForm.telegram}
                      onChange={(e) => setEditForm({...editForm, telegram: e.target.value})}
                      placeholder="@username"
                    />
                  </div>
                </div>
                <div className="member-form-row">
                  <div className="member-form-group">
                    <label>Department</label>
                    <input 
                      type="text" 
                      value={editForm.department}
                      onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                    />
                  </div>
                  <div className="member-form-group">
                    <label>Batch Year</label>
                    <input 
                      type="text" 
                      value={editForm.batchYear}
                      onChange={(e) => setEditForm({...editForm, batchYear: e.target.value})}
                    />
                  </div>
                </div>
                <div className="member-form-group">
                  <label>Role</label>
                  <select 
                    value={editForm.role}
                    onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                  >
                    {roleOptions.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div className="member-form-divider">
                  <button type="button" className="member-reset-password" onClick={handleSendResetEmail}>
                    <i className="fa fa-key"></i> Send Password Reset
                  </button>
                </div>
                <div className="member-modal-actions">
                  <button type="button" className="member-btn-cancel" onClick={closeEditModal}>Cancel</button>
                  <button type="submit" className="member-btn-save">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="member-confirm-overlay" onClick={() => setShowConfirmDialog(false)}>
          <div className="member-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="member-confirm-icon">
              <i className="fa fa-exclamation-triangle"></i>
            </div>
            <h3>Confirm Delete</h3>
            <p>{confirmData.message}</p>
            <div className="member-confirm-actions">
              <button className="member-confirm-cancel" onClick={() => setShowConfirmDialog(false)}>Cancel</button>
              <button className="member-confirm-delete" onClick={confirmData.onConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ============================================
           MODERN MINIMAL 2026 DESIGN
           Small cards, clean layout
        ============================================ */

        .member-dashboard {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f8fafc;
          min-height: 100vh;
        }

        .member-container {
          max-width: 100%;
          margin: 0 auto;
          padding: 20px 16px 100px;
        }

        /* Header */
        .member-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .member-header h1 {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .member-header p {
          color: #64748b;
          font-size: 13px;
        }

        .member-export-btn {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .member-export-btn:hover {
          background: #f1f5f9;
        }

        /* Stats Cards */
        .member-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        @media (max-width: 640px) {
          .member-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .member-stat-card {
          background: white;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          border: 1px solid #eef2f8;
        }

        .member-stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }

        .member-stat-icon.users {
          background: #eef2ff;
          color: #4f46e5;
        }

        .member-stat-icon.paid {
          background: #dcfce7;
          color: #10b981;
        }

        .member-stat-icon.unpaid {
          background: #fee2e2;
          color: #ef4444;
        }

        .member-stat-icon.month {
          background: #fef3c7;
          color: #f59e0b;
        }

        .member-stat-info h3 {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }

        .member-stat-info p {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        /* Action Bar */
        .member-action-bar {
          margin-bottom: 16px;
        }

        .member-bulk-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .member-btn-secondary {
          background: #f1f5f9;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          color: #475569;
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .member-btn-secondary:active {
          transform: scale(0.96);
        }

        .member-btn-danger {
          background: #fee2e2;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          color: #dc2626;
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .member-btn-danger:active {
          transform: scale(0.96);
        }

        .member-btn-telegram {
          background: #e0f2fe;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          color: #0284c7;
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Filters */
        .member-filters {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .member-search {
          flex: 1;
          min-width: 180px;
          position: relative;
        }

        .member-search i {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 13px;
        }

        .member-search input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 13px;
          font-family: inherit;
          background: white;
          transition: all 0.2s;
        }

        .member-search input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
        }

        .member-filter-select {
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 13px;
          font-family: inherit;
          background: white;
          color: #334155;
          cursor: pointer;
        }

        .member-filter-select:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .member-filter-reset {
          width: 40px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }

        .member-filter-reset:hover {
          background: #f1f5f9;
        }

        /* Member List - Small Compact Cards */
        .member-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .member-card {
          background: white;
          border-radius: 14px;
          padding: 14px;
          display: flex;
          gap: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid #eef2f8;
          position: relative;
        }

        .member-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .member-card.selected {
          background: #f0f9ff;
          border-color: #3b82f6;
        }

        .member-card-check {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 22px;
          height: 22px;
          background: #3b82f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 10px;
          box-shadow: 0 2px 6px rgba(59,130,246,0.3);
        }

        .member-card-avatar {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          color: white;
          flex-shrink: 0;
        }

        .member-card-info {
          flex: 1;
        }

        .member-card-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }

        .member-card-name h3 {
          font-size: 15px;
          font-weight: 600;
          color: #0f172a;
        }

        .member-card-status {
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
        }

        .member-card-status.paid {
          background: #dcfce7;
          color: #10b981;
        }

        .member-card-status.unpaid {
          background: #fee2e2;
          color: #ef4444;
        }

        .member-card-details {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 10px;
        }

        .member-card-details span {
          font-size: 11px;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .member-card-details span i {
          font-size: 10px;
          color: #94a3b8;
        }

        .member-card-actions {
          display: flex;
          gap: 8px;
        }

        .member-action {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .member-action.remind {
          background: #e0f2fe;
          color: #0284c7;
        }

        .member-action.remind:hover {
          background: #bae6fd;
        }

        .member-action.edit {
          background: #f1f5f9;
          color: #475569;
        }

        .member-action.edit:hover {
          background: #e2e8f0;
        }

        .member-action.delete {
          background: #fee2e2;
          color: #dc2626;
        }

        .member-action.delete:hover {
          background: #fecaca;
        }

        /* Bulk Bar */
        .member-bulk-bar {
          position: fixed;
          bottom: 20px;
          left: 16px;
          right: 16px;
          background: #1e293b;
          border-radius: 60px;
          padding: 10px 20px;
          display: none;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          z-index: 200;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        .member-bulk-bar.show {
          display: flex;
        }

        .member-bulk-count {
          background: rgba(255,255,255,0.15);
          padding: 5px 12px;
          border-radius: 40px;
          font-size: 12px;
          font-weight: 500;
          color: white;
        }

        .member-bulk-buttons {
          display: flex;
          gap: 8px;
        }

        .member-bulk-remind,
        .member-bulk-delete,
        .member-bulk-close {
          padding: 6px 14px;
          border-radius: 40px;
          border: none;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .member-bulk-remind {
          background: #3b82f6;
          color: white;
        }

        .member-bulk-delete {
          background: #ef4444;
          color: white;
        }

        .member-bulk-close {
          background: #475569;
          color: white;
        }

        /* Modal */
        .member-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .member-modal {
          background: white;
          border-radius: 24px;
          width: 90%;
          max-width: 500px;
          max-height: 85vh;
          overflow: hidden;
        }

        .member-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 20px;
          border-bottom: 1px solid #eef2f8;
        }

        .member-modal-header h2 {
          font-size: 18px;
          font-weight: 600;
        }

        .member-modal-close {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: #f1f5f9;
          cursor: pointer;
        }

        .member-modal-body {
          padding: 20px;
          overflow-y: auto;
        }

        .member-form-group {
          margin-bottom: 16px;
        }

        .member-form-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 6px;
          color: #334155;
        }

        .member-form-group input,
        .member-form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 13px;
          font-family: inherit;
        }

        .member-form-group input:focus,
        .member-form-group select:focus {
          outline: none;
          border-color: #3b82f6;
        }

        .member-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .member-form-divider {
          margin: 16px 0;
          padding-top: 12px;
          border-top: 1px solid #eef2f8;
        }

        .member-reset-password {
          width: 100%;
          padding: 10px;
          border-radius: 10px;
          background: #fef3c7;
          color: #b45309;
          border: none;
          font-weight: 500;
          cursor: pointer;
        }

        .member-modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }

        .member-modal-actions button {
          flex: 1;
          padding: 10px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .member-btn-cancel {
          background: #f1f5f9;
          color: #475569;
        }

        .member-btn-save {
          background: #10b981;
          color: white;
        }

        /* Confirm Dialog */
        .member-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1100;
        }

        .member-confirm-dialog {
          background: white;
          border-radius: 24px;
          padding: 24px;
          width: 90%;
          max-width: 320px;
          text-align: center;
        }

        .member-confirm-icon i {
          font-size: 48px;
          color: #ef4444;
          margin-bottom: 12px;
        }

        .member-confirm-dialog h3 {
          font-size: 18px;
          margin-bottom: 8px;
        }

        .member-confirm-dialog p {
          font-size: 13px;
          color: #64748b;
          margin-bottom: 20px;
        }

        .member-confirm-actions {
          display: flex;
          gap: 10px;
        }

        .member-confirm-actions button {
          flex: 1;
          padding: 10px;
          border-radius: 30px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .member-confirm-cancel {
          background: #f1f5f9;
          color: #475569;
        }

        .member-confirm-delete {
          background: #ef4444;
          color: white;
        }

        /* Toast */
        .member-toast {
          position: fixed;
          bottom: 90px;
          left: 16px;
          right: 16px;
          background: #1e293b;
          color: white;
          text-align: center;
          padding: 12px;
          border-radius: 60px;
          z-index: 1200;
          font-size: 13px;
          animation: memberToastIn 0.3s ease;
        }

        @keyframes memberToastIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Empty State */
        .member-empty {
          text-align: center;
          padding: 60px 20px;
          color: #94a3b8;
          background: white;
          border-radius: 20px;
        }

        .member-empty i {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .member-empty h3 {
          font-size: 16px;
          margin-bottom: 6px;
          color: #64748b;
        }

        /* Skeletons */
        .member-stat-skeleton {
          background: white;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          animation: memberPulse 1.5s infinite;
        }

        .member-stat-skeleton-icon {
          width: 48px;
          height: 48px;
          background: #e2e8f0;
          border-radius: 14px;
        }

        .member-stat-skeleton-text {
          width: 80px;
          height: 20px;
          background: #e2e8f0;
          border-radius: 8px;
        }

        .member-filter-skeleton {
          height: 44px;
          background: white;
          border-radius: 12px;
          margin-bottom: 20px;
          animation: memberPulse 1.5s infinite;
        }

        .member-card-skeleton {
          background: white;
          border-radius: 14px;
          padding: 14px;
          display: flex;
          gap: 14px;
          margin-bottom: 10px;
          animation: memberPulse 1.5s infinite;
        }

        .member-card-skeleton-avatar {
          width: 48px;
          height: 48px;
          background: #e2e8f0;
          border-radius: 14px;
        }

        .member-card-skeleton-content {
          flex: 1;
        }

        .member-card-skeleton-line {
          height: 14px;
          background: #e2e8f0;
          border-radius: 6px;
          margin-bottom: 8px;
        }

        .member-card-skeleton-line.short {
          width: 60%;
        }

        @keyframes memberPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        /* Responsive */
        @media (max-width: 640px) {
          .member-container {
            padding: 16px 12px 100px;
          }

          .member-card-details {
            flex-direction: column;
            gap: 6px;
          }

          .member-bulk-bar {
            flex-direction: column;
            border-radius: 24px;
            text-align: center;
          }

          .member-bulk-buttons {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default Members;