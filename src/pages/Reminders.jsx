import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase'; // Removed 'auth' as it's not used
import { 
  collection, getDocs // Removed doc, getDoc as they're not used
} from 'firebase/firestore';

const Reminders = () => {
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
  const [autoScheduleInterval, setAutoScheduleInterval] = useState(null); // Moved to state

  const BOT_TOKEN = "8784743959:AAEMA8yJqQYVcV3nOkdhyLQKgc5r6OX3FEI";

  const templates = {
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
  };

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

  const showToast = useCallback((message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, []);

  const loadData = useCallback(async () => {
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
    } catch (error) {
      console.error('Error loading data:', error);
      showToast("Error loading data", true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadLogs = useCallback(() => {
    const logs = JSON.parse(localStorage.getItem("reminder_logs") || "[]");
    setReminderLogs(logs);
  }, []);

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

  useEffect(() => {
    loadData();
    loadLogs();
    loadScheduleSettings();
    return () => {
      if (autoScheduleInterval) clearInterval(autoScheduleInterval);
    };
  }, [loadData, loadLogs, loadScheduleSettings, autoScheduleInterval]); // Added all dependencies

  // Other functions (sendTestReminder, previewMessage, clearLogs) remain the same
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

  // Fixed: Changed '==' to '===' in the JSX where needed
  // In your template selection, ensure proper equality checks
  // The rest of your JSX remains the same...

  if (loading) {
    return (
      <div className="reminders-page">
        <div className="app-container">
          <div className="loading">Loading reminder scheduler...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="reminders-page">
      <div className="app-container">
        <div className="reminder-header">
          <div className="header-title">
            <h1><i className="fa fa-bell"></i> Smart Reminder Scheduler</h1>
            <p>Automatically send payment reminders to unpaid members every month</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card" onClick={sendAllReminders}>
            <div className="stat-icon" style={{ background: '#fef3c7' }}>
              <i className="fa fa-users" style={{ color: '#f59e0b' }}></i>
            </div>
            <h3>{unpaidMembers.length}</h3>
            <p>Unpaid Members</p>
            <div className="stat-note">Click to send reminders</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#dbeafe' }}>
              <i className="fab fa-telegram" style={{ color: '#3b82f6' }}></i>
            </div>
            <h3>{withTelegram.length}</h3>
            <p>Will Receive Reminders</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#fee2e2' }}>
              <i className="fa fa-ban" style={{ color: '#ef4444' }}></i>
            </div>
            <h3>{withoutTelegram}</h3>
            <p>No Telegram (Cannot reach)</p>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#d1fae5' }}>
              <i className="fa fa-calendar" style={{ color: '#10b981' }}></i>
            </div>
            <h3>{currentMonth.name}</h3>
            <p>Current Month</p>
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
        <h3 style={{ marginBottom: '16px' }}><i className="fa fa-file-alt"></i> Reminder Templates</h3>
        <div className="templates-grid">
          {Object.entries(templates).map(([id, tpl]) => (
            <div 
              key={id}
              className={`template-card ${currentTemplate === id ? 'active' : ''}`}
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
        <div className="action-buttons">
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
              <div className="log-item">No reminders sent yet</div>
            ) : (
              reminderLogs.slice(0, 50).map((log, index) => (
                <div key={index} className="log-item">
                  <div>
                    <strong>{log.member}</strong> - {log.month}
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                  <div className={`log-${log.status}`}>
                    {log.status === "success" ? "✅ Sent" : "❌ Failed"}
                    {log.reason && ` (${log.reason})`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Test Modal */}
      <div className={`modal-overlay ${showTestModal ? 'show' : ''}`} onClick={() => setShowTestModal(false)}>
        <div className="test-modal" onClick={e => e.stopPropagation()}>
          <h3 style={{ marginBottom: '16px' }}>Test Reminder</h3>
          <p style={{ marginBottom: '16px' }}>Send a test reminder to:</p>
          <input 
            type="text" 
            placeholder="Telegram username (e.g., @username)" 
            value={testTelegram}
            onChange={(e) => setTestTelegram(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => setShowTestModal(false)} style={{ flex: 1 }}>Cancel</button>
            <button className="btn-primary" onClick={sendTestReminder} style={{ flex: 1 }}>Send Test</button>
          </div>
        </div>
      </div>

      <style>{`
        .reminders-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
        }

        .app-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px 24px 100px;
        }

        .reminder-header {
          margin-bottom: 32px;
        }

        .header-title h1 {
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #0f172a, #8b5cf6);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }

        .header-title p {
          color: #64748b;
          margin-top: 4px;
          font-size: 14px;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .stat-card {
          background: white;
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: transform 0.2s;
          border: 1px solid rgba(0,0,0,0.05);
          cursor: pointer;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 25px -12px rgba(0,0,0,0.1);
        }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin-bottom: 16px;
        }

        .stat-card h3 {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .stat-card p {
          color: #64748b;
          font-size: 13px;
        }

        .stat-note {
          font-size: 11px;
          color: #10b981;
          margin-top: 8px;
        }

        .schedule-card {
          background: white;
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 24px;
          border: 1px solid #eef2f8;
          background: linear-gradient(135deg, #fff, #f8fafc);
        }

        .schedule-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }

        .schedule-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .schedule-title i {
          font-size: 28px;
          color: #8b5cf6;
        }

        .schedule-title h2 {
          font-size: 20px;
          font-weight: 700;
        }

        .schedule-title p {
          color: #64748b;
          font-size: 13px;
          margin-top: 4px;
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 60px;
          height: 32px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #cbd5e1;
          transition: 0.3s;
          border-radius: 34px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 24px;
          width: 24px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        input:checked + .toggle-slider {
          background-color: #8b5cf6;
        }

        input:checked + .toggle-slider:before {
          transform: translateX(28px);
        }

        .schedule-config {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eef2f8;
          display: none;
        }

        .schedule-config.show {
          display: grid;
        }

        .config-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .config-group label {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
        }

        .config-group select {
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
        }

        .config-group select:focus {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139,92,246,0.1);
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .template-card {
          background: white;
          border-radius: 20px;
          padding: 20px;
          border: 1px solid #eef2f8;
          transition: all 0.2s;
          cursor: pointer;
        }

        .template-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.08);
          border-color: #8b5cf6;
        }

        .template-card.active {
          border: 2px solid #8b5cf6;
          background: #faf5ff;
        }

        .template-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .template-name {
          font-weight: 700;
          font-size: 16px;
        }

        .template-badge {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 600;
        }

        .badge-1 { background: #fef3c7; color: #d97706; }
        .badge-2 { background: #fee2e2; color: #dc2626; }
        .badge-3 { background: #dbeafe; color: #2563eb; }

        .template-preview {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
          margin-top: 12px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
        }

        .action-buttons {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #8b5cf6, #6d28d9);
          border: none;
          padding: 14px 28px;
          border-radius: 40px;
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -8px rgba(139,92,246,0.4);
        }

        .btn-secondary {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 14px 28px;
          border-radius: 40px;
          color: #475569;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-secondary:hover {
          background: #f8fafc;
          border-color: #8b5cf6;
        }

        .btn-danger {
          background: #fee2e2;
          border: none;
          padding: 14px 28px;
          border-radius: 40px;
          color: #dc2626;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .logs-section {
          background: white;
          border-radius: 24px;
          padding: 24px;
          margin-top: 24px;
        }

        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .last-run-info {
          font-size: 12px;
          color: #64748b;
        }

        .logs-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .log-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border-bottom: 1px solid #eef2f8;
          font-size: 13px;
        }

        .log-success { color: #10b981; }
        .log-error { color: #ef4444; }
        .log-pending { color: #f59e0b; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }

        .modal-overlay.show {
          opacity: 1;
          visibility: visible;
        }

        .test-modal {
          background: white;
          border-radius: 32px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow: auto;
          padding: 24px;
        }

        .toast {
          position: fixed;
          bottom: 100px;
          left: 20px;
          right: 20px;
          background: #1e293b;
          color: white;
          text-align: center;
          padding: 12px;
          border-radius: 60px;
          z-index: 10001;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          font-size: 18px;
          color: #64748b;
        }

        @media (max-width: 768px) {
          .app-container { padding: 16px 16px 80px; }
          .action-buttons { flex-direction: column; }
          .btn-primary, .btn-secondary, .btn-danger { justify-content: center; }
          .stats-row { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
};

export default Reminders;
