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
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      name: monthNames[now.getMonth()],
      shortName: shortMonthNames[now.getMonth()],
      monthNumber: now.getMonth() + 1,
      year: now.getFullYear(),
      display: `${monthNames[now.getMonth()]} ${now.getFullYear()}`
    };
  };

  // Helper function to check if a payment covers the current month
  const coversCurrentMonth = (payment, currentMonth) => {
    if (payment.status !== "approved") return false;
    if (!payment.monthsPaid || !Array.isArray(payment.monthsPaid)) return false;
    
    // Check each month in monthsPaid array
    return payment.monthsPaid.some(monthPaid => {
      // Try different formats: "Jan 2024", "January 2024", "Jan", "January"
      const monthPaidLower = monthPaid.toLowerCase();
      const currentMonthShortLower = currentMonth.shortName.toLowerCase();
      const currentMonthFullLower = currentMonth.name.toLowerCase();
      const currentYearStr = currentMonth.year.toString();
      
      // Check if month matches (either short or full name) AND year matches
      return (monthPaidLower.includes(currentMonthShortLower) || 
              monthPaidLower.includes(currentMonthFullLower)) &&
             monthPaidLower.includes(currentYearStr);
    });
  };

  const calculatePaidStatus = (paymentsList, membersList) => {
    const currentMonth = getCurrentMonthInfo();
    const paidSet = new Set();
    
    console.log("Current Month:", currentMonth);
    
    paymentsList.forEach(payment => {
      if (payment.status !== "approved") return;
      
      const memberId = payment.memberId || payment.uid;
      if (!memberId) return;
      
      const isPaid = coversCurrentMonth(payment, currentMonth);
      
      if (isPaid) {
        console.log(`Member ${memberId} paid for ${currentMonth.display}`);
        paidSet.add(memberId);
      }
    });
    
    return paidSet;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load members
      const membersSnapshot = await getDocs(collection(db, "members"));
      const membersList = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllMembers(membersList);

      // Load payments
      const paymentsSnapshot = await getDocs(collection(db, "payments"));
      const paymentsList = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllPayments(paymentsList);
      
      // Calculate paid status based on actual payment records
      const paidSet = calculatePaidStatus(paymentsList, membersList);
      setCurrentMonthPaidSet(paidSet);
      
      console.log("Paid members count:", paidSet.size);
      console.log("Paid member IDs:", Array.from(paidSet));
      
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
    toast.className = 'toast';
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
      <div className="app-container">
        <div className="payments-header">
          <div className="header-title">
            <h1>Members</h1>
            <p>Manage your community members</p>
          </div>
        </div>
        <div className="stats-row">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-skeleton">
              <div className="stat-skeleton-icon"></div>
              <div className="stat-skeleton-text"></div>
            </div>
          ))}
        </div>
        <div className="filter-skeleton"></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="card-skeleton">
            <div className="card-skeleton-avatar"></div>
            <div className="card-skeleton-content">
              <div className="card-skeleton-line"></div>
              <div className="card-skeleton-line short"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="payments-header">
        <div className="header-title">
          <h1>Members</h1>
          <p>{totalMembers} total members • {paidCount} paid • {unpaidCount} unpaid this month</p>
        </div>
        <button className="btn-primary" onClick={exportToCSV}>
          <i className="fa fa-download"></i> Export CSV
        </button>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon users">
            <i className="fa fa-users"></i>
          </div>
          <div className="stat-info">
            <h3>{totalMembers}</h3>
            <p>Total Members</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon paid">
            <i className="fa fa-check-circle"></i>
          </div>
          <div className="stat-info">
            <h3>{paidCount}</h3>
            <p>Paid This Month</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon unpaid">
            <i className="fa fa-clock"></i>
          </div>
          <div className="stat-info">
            <h3>{unpaidCount}</h3>
            <p>Pending Payment</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon month">
            <i className="fa fa-calendar"></i>
          </div>
          <div className="stat-info">
            <h3>{currentMonth.shortName}</h3>
            <p>Current Month</p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="filter-bar">
        <div className="filter-row">
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
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-group search-group">
            <label><i className="fa fa-search"></i> Search</label>
            <input 
              type="text" 
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label><i className="fa fa-filter"></i> Payment Status</label>
            <select 
              value={paymentStatusFilter} 
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="filter-group">
            <label><i className="fa fa-building"></i> Department</label>
            <select 
              value={deptFilter} 
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label><i className="fa fa-graduation-cap"></i> Batch Year</label>
            <select 
              value={yearFilter} 
              onChange={(e) => setYearFilter(e.target.value)}
            >
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
            <i className="fa fa-undo"></i> Reset
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className="payment-cards">
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
                className={`payment-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSelectMember(member.id)}
              >
                {isSelected && (
                  <input
                    type="checkbox"
                    className="card-checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                
                <div className="card-header">
                  <div className="member-avatar">
                    {getInitials(member.fullName)}
                  </div>
                  <div className="member-info">
                    <h4>{member.fullName || "Unknown"}</h4>
                    <p>{member.department || "No department"} • {member.batchYear || "No batch"}</p>
                  </div>
                  <div className={`status-badge ${isPaid ? 'paid' : 'unpaid'}`}>
                    {isPaid ? 'Paid' : 'Unpaid'}
                  </div>
                </div>
                
                <div className="card-details">
                  <span><i className="fa fa-envelope"></i> {member.email?.split('@')[0] || "No email"}</span>
                  {member.telegram && (
                    <span><i className="fab fa-telegram"></i> {member.telegram}</span>
                  )}
                  {member.phone && (
                    <span><i className="fa fa-phone"></i> {member.phone}</span>
                  )}
                </div>
                
                <div className="card-footer">
                  <div className="timestamp">
                    <i className="fa fa-user-tag"></i> {roleInfo.label}
                  </div>
                  <div className="action-buttons">
                    {!isPaid && (
                      <button 
                        className="action-btn remind" 
                        onClick={(e) => sendTelegramReminder(member.id, member.fullName, member.telegram, e)}
                      >
                        <i className="fab fa-telegram"></i> <span>Remind</span>
                      </button>
                    )}
                    <button 
                      className="action-btn edit" 
                      onClick={(e) => openEditModal(member, e)}
                    >
                      <i className="fa fa-pen"></i> <span>Edit</span>
                    </button>
                    <button 
                      className="action-btn delete" 
                      onClick={(e) => handleDeleteMember(member.id, member.fullName, e)}
                    >
                      <i className="fa fa-trash"></i> <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bulk Actions Bar */}
      <div className={`bulk-actions-bar ${selectedMemberIds.size > 0 ? 'show' : ''}`}>
        <span className="bulk-selected">
          <i className="fa fa-check-circle"></i> {selectedMemberIds.size} selected
        </span>
        <div className="bulk-buttons">
          <button className="bulk-btn telegram" onClick={bulkSendReminders}>
            <i className="fab fa-telegram"></i> Remind All
          </button>
          <button className="bulk-btn delete" onClick={handleBulkDelete}>
            <i className="fa fa-trash-alt"></i> Delete All
          </button>
          <button className="bulk-btn close" onClick={deselectAll}>
            <i className="fa fa-times"></i> Close
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      <div className={`modal-overlay ${showEditModal ? 'show' : ''}`} onClick={closeEditModal}>
        <div className="history-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>
              <i className="fa fa-user-edit"></i> Edit Member
            </h2>
            <button className="close-modal" onClick={closeEditModal}>
              <i className="fa fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    type="tel" 
                    value={editForm.phone}
                    onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                    placeholder="+251XXXXXXXXX"
                  />
                </div>
                <div className="form-group">
                  <label>Telegram Username</label>
                  <input 
                    type="text" 
                    value={editForm.telegram}
                    onChange={(e) => setEditForm({...editForm, telegram: e.target.value})}
                    placeholder="@username"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department</label>
                  <input 
                    type="text" 
                    value={editForm.department}
                    onChange={(e) => setEditForm({...editForm, department: e.target.value})}
                    placeholder="e.g., Computer Science"
                  />
                </div>
                <div className="form-group">
                  <label>Batch Year</label>
                  <input 
                    type="text" 
                    value={editForm.batchYear}
                    onChange={(e) => setEditForm({...editForm, batchYear: e.target.value})}
                    placeholder="e.g., 2024"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>User Role</label>
                <select 
                  value={editForm.role}
                  onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                >
                  {roleOptions.map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-divider">
                <button type="button" className="reset-password-btn" onClick={handleSendResetEmail}>
                  <i className="fa fa-key"></i> Send Password Reset Email
                </button>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeEditModal}>Cancel</button>
                <button type="submit" className="btn-save">
                  <i className="fa fa-save"></i> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <div className={`confirm-overlay ${showConfirmDialog ? 'show' : ''}`} onClick={() => setShowConfirmDialog(false)}>
        <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon">
            <i className="fa fa-exclamation-triangle"></i>
          </div>
          <h3>Confirm Delete</h3>
          <p>{confirmData.message}</p>
          <div className="confirm-actions">
            <button className="confirm-cancel" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </button>
            <button className="confirm-delete" onClick={confirmData.onConfirm}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Members;
