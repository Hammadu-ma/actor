import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db, auth } from '../config/firebase';
import { 
  collection, getDocs, doc, getDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const Reminders = () => {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [allMembers, setAllMembers] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTemplate, setCurrentTemplate] = useState(1);
  const [reminderLogs, setReminderLogs] = useState([]);
  const [autoScheduleEnabled, setAutoScheduleEnabled] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    day: 10,
    time: "18:00",
    frequency: "escalating"
  });
  const [showTestModal, setShowTestModal] = useState(false);
  const [testTelegram, setTestTelegram] = useState("");
  const [autoScheduleInterval, setAutoScheduleInterval] = useState(null);
  const dataLoadedRef = useRef(false);

  const BOT_TOKEN = "8784743959:AAEMA8yJqQYVcV3nOkdhyLQKgc5r6OX3FEI";

  // Wrap templates with useMemo to prevent recreation on every render
  const templates = useMemo(() => ({
    1: {
      name: "Friendly Reminder",
      badge: "1st Reminder",
      badgeClass: "badge-1",
      message: `🔔 JUMJ Friendly Reminder\n\nDear {name},\n\nThis is a gentle reminder that your monthly contribution for {month} is now due.\n\n📅 Due Date: End of {month}\n💰 Amount: 50 ETB per month\n\nPlease complete your payment at your earliest convenience.\n\nThank you for your support! 💙\n\n- JUMJ Social Affairs`
    },
    2: {
      name: "Urgent Reminder",
      badge: "2nd Reminder",
      badgeClass: "badge-2",
      message: `⚠️ JUMJ URGENT Reminder\n\nDear {name},\n\nOur records show that your payment for {month} is still pending.\n\n📅 Due Date: {dueDate}\n💰 Pending Amount: 50 ETB\n\nThis is your {reminderNumber} reminder. Please settle your contribution as soon as possible to avoid any issues.\n\nThank you for your cooperation.\n\n- JUMJ Social Affairs`
    },
    3: {
      name: "Final Warning",
      badge: "Final Notice",
      badgeClass: "badge-3",
      message: `🚨 JUMJ FINAL NOTICE\n\nDear {name},\n\nThis is your FINAL reminder for the payment of {month}.\n\n⚠️ Payment is now OVERDUE\n💰 Amount Due: 50 ETB\n📅 Due Date: Passed\n\nPlease complete your payment immediately. If you have already paid, please ignore this message.\n\nContact admin if you have any questions.\n\n- JUMJ Social Affairs`
    }
  }), []);

  // Wrap functions with useCallback to prevent infinite loops
  const getCurrentMonthInfo = useCallback(() => {
    const now = new Date();
    return {
      name: now.toLocaleString('default', { month: 'long' }),
      shortName: now.toLocaleString('default', { month: 'short' }),
      year: now.getFullYear(),
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    };
  }, []);

  const showToast = useCallback((message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, []);

  // Load data function - stable reference
  const loadData = useCallback(async () => {
    // Prevent multiple loads
    if (dataLoadedRef.current && allMembers.length > 0) return;
    
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
      dataLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading data:', error);
      showToast("Error loading data", true);
    } finally {
      setLoading(false);
    }
  }, [showToast, allMembers.length]);

  // Load logs - stable reference
  const loadLogs = useCallback(() => {
    const logs = JSON.parse(localStorage.getItem("reminder_logs") || "[]");
    setReminderLogs(logs);
  }, []);

  // Calculate paid status - depends on allPayments
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

  const getReminderMessage = useCallback((member, reminderCount = 1) => {
    let template = templates[currentTemplate];
    if (!template) template = templates[1];
    
    let message = template.message;
    const month = getCurrentMonthInfo();
    
    message = message.replace(/{name}/g, member.fullName || "Member");
    message = message.replace(/{month}/g, month.name);
    message = message.replace(/{dueDate}/g, `${month.name} ${month.dueDate}, ${month.year}`);
    message = message.replace(/{reminderNumber}/g, reminderCount === 1 ? "1st" : reminderCount === 2 ? "2nd" : "3rd");
    
    return message;
  }, [currentTemplate, getCurrentMonthInfo, templates]);

  const sendReminder = useCallback(async (member, reminderCount = 1) => {
    if (!member.telegram || member.telegram.trim() === "") {
      return { success: false, reason: "No Telegram" };
    }
    
    const message = getReminderMessage(member, reminderCount);
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: member.telegram, text: message })
      });
      
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, reason: "Telegram API error" };
      }
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }, [getReminderMessage]);

  const sendAllReminders = useCallback(async () => {
    const paidSet = calculatePaidStatus();
    const unpaidMembers = allMembers.filter(m => !paidSet.has(m.id));
    const withTelegram = unpaidMembers.filter(m => m.telegram && m.telegram.trim());
    
    if (withTelegram.length === 0) {
      showToast("No unpaid members with Telegram to remind", true);
      return;
    }
    
    showToast(`Sending reminders to ${withTelegram.length} members...`);
    
    let sent = 0;
    let failed = 0;
    const logs = [];
    const currentMonth = getCurrentMonthInfo();
    
    for (const member of withTelegram) {
      const result = await sendReminder(member, 1);
      if (result.success) {
        sent++;
        logs.push({
          timestamp: new Date().toISOString(),
          member: member.fullName,
          status: "success",
          month: currentMonth.name
        });
      } else {
        failed++;
        logs.push({
          timestamp: new Date().toISOString(),
          member: member.fullName,
          status: "failed",
          reason: result.reason,
          month: currentMonth.name
        });
      }
      await new Promise(r => setTimeout(r, 100));
    }
    
    const existingLogs = JSON.parse(localStorage.getItem("reminder_logs") || "[]");
    const newLogs = [...logs, ...existingLogs].slice(0, 100);
    localStorage.setItem("reminder_logs", JSON.stringify(newLogs));
    setReminderLogs(newLogs);
    
    showToast(`✅ Sent ${sent} reminders, Failed: ${failed}`);
  }, [allMembers, calculatePaidStatus, sendReminder, showToast, getCurrentMonthInfo]);

  const checkAndSendScheduledReminders = useCallback(async () => {
    const saved = localStorage.getItem("reminder_schedule");
    if (!saved) return;
    
    const config = JSON.parse(saved);
    if (!config.enabled) return;
    
    const now = new Date();
    const currentDay = now.getDate();
    const currentHour = now.getHours();
    const scheduledHour = parseInt(config.time.split(":")[0]);
    const lastRun = config.lastRun ? new Date(config.lastRun) : null;
    
    const shouldRunToday = currentDay === config.day;
    const shouldRunHour = currentHour === scheduledHour;
    const alreadyRunToday = lastRun && lastRun.toDateString() === now.toDateString();
    
    if (shouldRunToday && shouldRunHour && !alreadyRunToday) {
      await sendAllReminders();
      config.lastRun = now.toISOString();
      localStorage.setItem("reminder_schedule", JSON.stringify(config));
    }
  }, [sendAllReminders]);

  const startAutoScheduler = useCallback(() => {
    if (autoScheduleInterval) clearInterval(autoScheduleInterval);
    const interval = setInterval(() => {
      checkAndSendScheduledReminders();
    }, 60 * 60 * 1000);
    setAutoScheduleInterval(interval);
    checkAndSendScheduledReminders();
  }, [autoScheduleInterval, checkAndSendScheduledReminders]);

  const stopAutoScheduler = useCallback(() => {
    if (autoScheduleInterval) {
      clearInterval(autoScheduleInterval);
      setAutoScheduleInterval(null);
    }
  }, [autoScheduleInterval]);

  const loadScheduleSettings = useCallback(() => {
    const saved = localStorage.getItem("reminder_schedule");
    if (saved) {
      const config = JSON.parse(saved);
      setAutoScheduleEnabled(config.enabled);
      setScheduleConfig({
        day: config.day || 10,
        time: config.time || "18:00",
        frequency: config.frequency || "escalating"
      });
      if (config.enabled) {
        startAutoScheduler();
      }
    }
  }, [startAutoScheduler]);

  const saveScheduleSettings = useCallback(() => {
    const config = {
      enabled: autoScheduleEnabled,
      day: scheduleConfig.day,
      time: scheduleConfig.time,
      frequency: scheduleConfig.frequency,
      lastRun: new Date().toISOString()
    };
    localStorage.setItem("reminder_schedule", JSON.stringify(config));
    
    if (autoScheduleEnabled) {
      startAutoScheduler();
      showToast("Auto-reminder schedule enabled");
    } else {
      stopAutoScheduler();
      showToast("Auto-reminder schedule disabled");
    }
  }, [autoScheduleEnabled, scheduleConfig, startAutoScheduler, stopAutoScheduler, showToast]);

  // FIRST useEffect - Admin check (MUST be first)
  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate('/');
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, "members", user.uid));
        const role = userDoc.data()?.role;
        
        if (role !== 'admin') {
          navigate('/');
        }
      } catch (error) {
        console.error("Auth error:", error);
        navigate('/');
      } finally {
        setCheckingAuth(false);
      }
    };
    
    checkAdmin();
  }, [navigate]);

  // SECOND useEffect - Load data after auth check
  useEffect(() => {
    if (!checkingAuth) {
      const init = async () => {
        await loadData();
        loadLogs();
        loadScheduleSettings();
      };
      init();
    }
    
    return () => {
      if (autoScheduleInterval) clearInterval(autoScheduleInterval);
    };
  }, [checkingAuth, loadData, loadLogs, loadScheduleSettings, autoScheduleInterval]);

  const sendTestReminder = async () => {
    if (!testTelegram) {
      showToast("Please enter a Telegram username", true);
      return;
    }
    
    const message = getReminderMessage({ fullName: "Test User" }, 1);
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: testTelegram, text: message })
      });
      
      if (response.ok) {
        showToast("Test reminder sent successfully!");
        setShowTestModal(false);
        setTestTelegram("");
      } else {
        showToast("Failed to send. Check username format.", true);
      }
    } catch (error) {
      showToast("Error: " + error.message, true);
    }
  };

  const previewMessage = () => {
    const template = templates[currentTemplate];
    const month = getCurrentMonthInfo();
    let preview = template.message;
    preview = preview.replace(/{name}/g, "[Member Name]");
    preview = preview.replace(/{month}/g, month.name);
    preview = preview.replace(/{dueDate}/g, `${month.name} ${month.dueDate}, ${month.year}`);
    preview = preview.replace(/{reminderNumber}/g, "1st");
    
    alert("Message Preview:\n\n" + preview);
  };

  const clearLogs = () => {
    if (window.confirm("Clear all reminder logs?")) {
      localStorage.removeItem("reminder_logs");
      setReminderLogs([]);
      showToast("Logs cleared");
    }
  };

  const paidSet = calculatePaidStatus();
  const unpaidMembers = allMembers.filter(m => !paidSet.has(m.id));
  const withTelegram = unpaidMembers.filter(m => m.telegram && m.telegram.trim());
  const withoutTelegram = unpaidMembers.length - withTelegram.length;
  const currentMonth = getCurrentMonthInfo();

  // Conditional returns - ONLY at the end, after all hooks
  if (checkingAuth) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Verifying access...</p>
      </div>
    );
  }

  // Loading Skeleton
  if (loading) {
    return (
      <div className="app-container">
        <div className="payments-header">
          <div className="header-title">
            <h1><i className="fa fa-bell"></i> Smart Reminder Scheduler</h1>
            <p>Automatically send payment reminders to unpaid members every month</p>
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
        
        {/* Schedule Card Skeleton */}
        <div className="schedule-skeleton"></div>
        
        {/* Templates Grid Skeleton */}
        <div className="templates-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="template-skeleton"></div>
          ))}
        </div>
        
        {/* Action Buttons Skeleton */}
        <div className="action-buttons-skeleton">
          <div className="btn-skeleton"></div>
          <div className="btn-skeleton"></div>
          <div className="btn-skeleton"></div>
          <div className="btn-skeleton"></div>
        </div>
        
        {/* Logs Skeleton */}
        <div className="logs-skeleton">
          <div className="logs-header-skeleton"></div>
          <div className="log-item-skeleton"></div>
          <div className="log-item-skeleton"></div>
          <div className="log-item-skeleton"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="payments-header">
        <div className="header-title">
          <h1><i className="fa fa-bell"></i> Smart Reminder Scheduler</h1>
          <p>Automatically send payment reminders to unpaid members every month</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card clickable" onClick={sendAllReminders}>
          <div className="stat-icon unpaid-icon">
            <i className="fa fa-users"></i>
          </div>
          <div className="stat-info">
            <h3>{unpaidMembers.length}</h3>
            <p>Unpaid Members</p>
            <small className="stat-note">Click to send reminders</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon telegram-icon">
            <i className="fab fa-telegram"></i>
          </div>
          <div className="stat-info">
            <h3>{withTelegram.length}</h3>
            <p>Will Receive Reminders</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon no-telegram-icon">
            <i className="fa fa-ban"></i>
          </div>
          <div className="stat-info">
            <h3>{withoutTelegram}</h3>
            <p>No Telegram</p>
            <small>Cannot reach</small>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon month-icon">
            <i className="fa fa-calendar"></i>
          </div>
          <div className="stat-info">
            <h3>{currentMonth.shortName}</h3>
            <p>Current Month</p>
          </div>
        </div>
      </div>

      {/* Auto-Schedule Card */}
      <div className="schedule-card">
        <div className="schedule-header">
          <div className="schedule-title">
            <i className="fa fa-calendar-check"></i>
            <div>
              <h2>Automated Monthly Reminders</h2>
              <p>Schedule reminders to be sent automatically every month</p>
            </div>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={autoScheduleEnabled}
              onChange={(e) => {
                setAutoScheduleEnabled(e.target.checked);
                setTimeout(saveScheduleSettings, 100);
              }}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div className={`schedule-config ${autoScheduleEnabled ? 'show' : ''}`}>
          <div className="config-group">
            <label><i className="fa fa-calendar"></i> Send Day of Month</label>
            <select 
              value={scheduleConfig.day}
              onChange={(e) => {
                setScheduleConfig({...scheduleConfig, day: parseInt(e.target.value)});
                setTimeout(saveScheduleSettings, 100);
              }}
            >
              <option value="1">1st - First day of month</option>
              <option value="5">5th - Early reminder</option>
              <option value="10">10th - Standard reminder</option>
              <option value="15">15th - Mid-month reminder</option>
              <option value="20">20th - Urgent reminder</option>
              <option value="25">25th - Final warning</option>
            </select>
          </div>
          <div className="config-group">
            <label><i className="fa fa-clock"></i> Reminder Time</label>
            <select 
              value={scheduleConfig.time}
              onChange={(e) => {
                setScheduleConfig({...scheduleConfig, time: e.target.value});
                setTimeout(saveScheduleSettings, 100);
              }}
            >
              <option value="09:00">09:00 AM - Morning</option>
              <option value="12:00">12:00 PM - Noon</option>
              <option value="15:00">03:00 PM - Afternoon</option>
              <option value="18:00">06:00 PM - Evening</option>
              <option value="20:00">08:00 PM - Night</option>
            </select>
          </div>
          <div className="config-group">
            <label><i className="fa fa-repeat"></i> Reminder Frequency</label>
            <select 
              value={scheduleConfig.frequency}
              onChange={(e) => {
                setScheduleConfig({...scheduleConfig, frequency: e.target.value});
                setTimeout(saveScheduleSettings, 100);
              }}
            >
              <option value="once">Once per month (first reminder only)</option>
              <option value="escalating">Escalating (1st, 2nd, 3rd reminder)</option>
              <option value="weekly">Weekly until paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reminder Templates */}
      <div className="section-header">
        <h3><i className="fa fa-file-alt"></i> Reminder Templates</h3>
      </div>
      <div className="templates-grid">
        {Object.entries(templates).map(([id, tpl]) => (
          <div 
            key={id}
            className={`template-card ${currentTemplate === parseInt(id) ? 'active' : ''}`}
            onClick={() => setCurrentTemplate(parseInt(id))}
          >
            <div className="template-header">
              <span className="template-name">{tpl.name}</span>
              <span className={`template-badge ${tpl.badgeClass}`}>{tpl.badge}</span>
            </div>
            <div className="template-preview">{tpl.message.substring(0, 100)}...</div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons-group">
        <button className="btn-primary" onClick={sendAllReminders}>
          <i className="fa fa-paper-plane"></i> Send Reminders Now
        </button>
        <button className="btn-secondary" onClick={() => setShowTestModal(true)}>
          <i className="fa fa-flask"></i> Test Reminder
        </button>
        <button className="btn-secondary" onClick={previewMessage}>
          <i className="fa fa-eye"></i> Preview Message
        </button>
        <button className="btn-danger" onClick={clearLogs}>
          <i className="fa fa-trash"></i> Clear Logs
        </button>
      </div>

      {/* Recent Activity Logs */}
      <div className="logs-section">
        <div className="logs-header">
          <h3><i className="fa fa-history"></i> Reminder History</h3>
          <span className="last-run-info">
            {localStorage.getItem("reminder_schedule") && JSON.parse(localStorage.getItem("reminder_schedule")).lastRun && 
              `Last auto-run: ${new Date(JSON.parse(localStorage.getItem("reminder_schedule")).lastRun).toLocaleString()}`
            }
          </span>
        </div>
        <div className="logs-list">
          {reminderLogs.length === 0 ? (
            <div className="empty-state">
              <i className="fa fa-bell-slash"></i>
              <p>No reminders sent yet</p>
            </div>
          ) : (
            reminderLogs.slice(0, 50).map((log, index) => (
              <div key={index} className="log-item">
                <div className="log-info">
                  <strong>{log.member}</strong>
                  <span className="log-month">{log.month}</span>
                  <div className="log-date">{new Date(log.timestamp).toLocaleString()}</div>
                </div>
                <div className={`log-status ${log.status}`}>
                  {log.status === "success" ? "✅ Sent" : "❌ Failed"}
                  {log.reason && ` (${log.reason})`}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Test Modal */}
      <div className={`modal-overlay ${showTestModal ? 'show' : ''}`} onClick={() => setShowTestModal(false)}>
        <div className="history-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Test Reminder</h2>
            <button className="close-modal" onClick={() => setShowTestModal(false)}>
              <i className="fa fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            <p>Send a test reminder to:</p>
            <input 
              type="text" 
              placeholder="Telegram username (e.g., @username)" 
              value={testTelegram}
              onChange={(e) => setTestTelegram(e.target.value)}
              className="test-input"
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowTestModal(false)}>Cancel</button>
              <button className="btn-save" onClick={sendTestReminder}>Send Test</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reminders;