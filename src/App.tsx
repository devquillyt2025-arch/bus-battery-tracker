/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Bus, Battery, Wrench, Trash2, Edit2, Plus, Clock, Save, X, Lock, LogOut, Eye, EyeOff, Zap, Settings, FileText, Download, Search } from 'lucide-react';
import { api, ApiError } from './api';
import type { TrackerRecord } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const isAuthorized = adminPassword !== null;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState<((password: string) => void) | null>(null);
  const [authChecking, setAuthChecking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [records, setRecords] = useState<TrackerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteHistoryConfirm, setDeleteHistoryConfirm] = useState<{recordId: string, historyIndex: number} | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    busNumber: '',
    battery1: '',
    battery1Date: '',
    battery2: '',
    battery2Date: '',
    starter: '',
    starterDate: '',
    alternator: '',
    alternatorDate: '',
    fanBelt: '',
    fanBeltDate: '',
    note: ''
  });

  const fetchRecords = useCallback(async () => {
    try {
      setRecords(await api.listRecords());
    } catch (error) {
      console.error("Error loading records:", error);
      setErrorMsg("Failed to load records.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load records, then poll so other users' changes show up
  useEffect(() => {
    fetchRecords();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchRecords();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRecords();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchRecords]);

  // A 401 means the server-side password changed; drop back to locked
  const handleApiError = (error: unknown, message: string) => {
    console.error(message, error);
    if (error instanceof ApiError && error.status === 401) {
      setAdminPassword(null);
      setErrorMsg("Session expired. Please enter the password again.");
    } else {
      setErrorMsg(message);
    }
  };

  const executeWithAuth = (action: (password: string) => void) => {
    if (adminPassword !== null) {
      action(adminPassword);
    } else {
      setPendingAction(() => action);
      setShowAuthModal(true);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const password = authPassword;
    setAuthChecking(true);
    try {
      await api.verifyPassword(password);
      setAdminPassword(password);
      setShowAuthModal(false);
      setAuthPassword('');
      setAuthError('');
      if (pendingAction) {
        pendingAction(password);
        setPendingAction(null);
      }
    } catch (error) {
      setAuthError(error instanceof ApiError && error.status === 401 ? 'Incorrect password' : (error as Error).message);
    } finally {
      setAuthChecking(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.busNumber.trim()) return;
    
    executeWithAuth(async (password) => {
      setErrorMsg(null);

      try {
        if (editingId) {
          // Server snapshots the previous values into history
          await api.updateRecord(editingId, formData, password);
          setEditingId(null);
        } else {
          await api.createRecord(formData, password);
        }
        await fetchRecords();
        
        setFormData({
          busNumber: '',
          battery1: '',
          battery1Date: '',
          battery2: '',
          battery2Date: '',
          starter: '',
          starterDate: '',
          alternator: '',
          alternatorDate: '',
          fanBelt: '',
          fanBeltDate: '',
          note: ''
        });
        setIsModalOpen(false);
      } catch (error) {
        handleApiError(error, "Failed to save record.");
      }
    });
  };

  const handleAddNewRecord = () => {
    executeWithAuth(() => {
      setEditingId(null);
      setFormData({
        busNumber: '',
        battery1: '',
        battery1Date: '',
        battery2: '',
        battery2Date: '',
        starter: '',
        starterDate: '',
        alternator: '',
        alternatorDate: '',
        fanBelt: '',
        fanBeltDate: '',
        note: ''
      });
      setIsModalOpen(true);
    });
  };

  const handleEdit = (record: TrackerRecord) => {
    executeWithAuth(() => {
      setEditingId(record.id);
      setIsModalOpen(true);
      setFormData({
        busNumber: record.busNumber,
        battery1: record.battery1 || record.battery || '',
        battery1Date: record.battery1Date || '',
        battery2: record.battery2 || '',
        battery2Date: record.battery2Date || '',
        starter: record.starter || '',
        starterDate: record.starterDate || '',
        alternator: record.alternator || '',
        alternatorDate: record.alternatorDate || '',
        fanBelt: record.fanBelt || '',
        fanBeltDate: record.fanBeltDate || '',
        note: record.note || ''
      });
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsModalOpen(false);
    setFormData({
      busNumber: '',
      battery1: '',
      battery1Date: '',
      battery2: '',
      battery2Date: '',
      starter: '',
      starterDate: '',
      alternator: '',
      alternatorDate: '',
      fanBelt: '',
      fanBeltDate: '',
      note: ''
    });
  };

  const requestDelete = (id: string) => {
    executeWithAuth(() => {
      setDeleteConfirmId(id);
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId || adminPassword === null) return;
    setErrorMsg(null);
    try {
      await api.deleteRecord(deleteConfirmId, adminPassword);
      await fetchRecords();
    } catch (error) {
      handleApiError(error, "Failed to delete record.");
    }
    setDeleteConfirmId(null);
  };

  const requestDeleteHistory = (recordId: string, historyIndex: number) => {
    executeWithAuth(() => {
      setDeleteHistoryConfirm({ recordId, historyIndex });
    });
  };

  const confirmDeleteHistory = async () => {
    if (!deleteHistoryConfirm || adminPassword === null) return;
    setErrorMsg(null);
    try {
      await api.deleteHistory(deleteHistoryConfirm.recordId, deleteHistoryConfirm.historyIndex, adminPassword);
      await fetchRecords();
    } catch (error) {
      handleApiError(error, "Failed to delete history record.");
    }
    setDeleteHistoryConfirm(null);
  };

  const filteredRecords = records.filter(record => 
    record.busNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text("KSRTC Arsikere Depot Battery & Maintenance Tracker", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 30);
    
    // Define columns
    const tableColumn = ["Sl. No.", "Bus No", "Battery 1", "Battery 2", "Starter", "Alternator", "Fan Belt", "Note"];
    const tableRows: any[] = [];
    
    filteredRecords.forEach((record, index) => {
      const recordUpdateDate = new Date(record.lastUpdated ?? record.timestamp).toLocaleDateString();
      
      const formatField = (val: string | undefined, date: string | undefined, fallbackDate: string) => {
        return (val || '-') + `\n${date || fallbackDate}`;
      };

      // Current state row
      const currentData = [
        index + 1,
        record.busNumber,
        formatField(record.battery1 || record.battery, record.battery1Date, recordUpdateDate),
        formatField(record.battery2, record.battery2Date, recordUpdateDate),
        formatField(record.starter, record.starterDate, recordUpdateDate),
        formatField(record.alternator, record.alternatorDate, recordUpdateDate),
        formatField(record.fanBelt, record.fanBeltDate, recordUpdateDate),
        (record.note || '-') + `\n${recordUpdateDate}`
      ];
      tableRows.push(currentData);

      // History rows
      if (Array.isArray(record.history) && record.history.length > 0) {
        record.history.forEach(snapshot => {
          const snapshotDate = new Date(snapshot.snapshotTimestamp).toLocaleDateString();
          const historyData = [
            '', // No Sl. No for history row
            `${record.busNumber} [Old]`,
            formatField(snapshot.battery1, snapshot.battery1Date, snapshotDate),
            formatField(snapshot.battery2, snapshot.battery2Date, snapshotDate),
            formatField(snapshot.starter, snapshot.starterDate, snapshotDate),
            formatField(snapshot.alternator, snapshot.alternatorDate, snapshotDate),
            formatField(snapshot.fanBelt, snapshot.fanBeltDate, snapshotDate),
            (snapshot.note || '-') + `\n${snapshotDate}`
          ];
          tableRows.push(historyData);
        });
      }
    });
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      willDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index >= 2) {
          if (data.cell.text && data.cell.text.length > 0) {
            data.cell.customLines = [...data.cell.text];
            data.cell.text = [];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index >= 2 && data.cell.customLines) {
          const lines = data.cell.customLines;
          
          const getPad = (val: any, dir: string) => {
            if (val && typeof val === 'object') return val[dir] || 1.5;
            if (typeof val === 'number') return val;
            return 1.5;
          };
          const paddingLeft = getPad(data.cell.styles.cellPadding, 'left');
          const paddingTop = getPad(data.cell.styles.cellPadding, 'top');
          
          const x = data.cell.x + paddingLeft;
          let currentY = data.cell.y + paddingTop;
          
          if (lines.length >= 2) {
            const dateLine = lines[lines.length - 1];
            const valueLines = lines.slice(0, lines.length - 1);
            
            doc.setFontSize(9);
            doc.setTextColor(40, 40, 40);
            valueLines.forEach((line: string) => {
              doc.text(line, x, currentY, { baseline: 'top' });
              currentY += 3.5;
            });
            
            currentY += 0.5; // slight spacing
            doc.setFontSize(7);
            doc.setTextColor(140, 140, 140);
            doc.text(dateLine, x, currentY, { baseline: 'top' });
          } else if (lines.length === 1) {
            doc.setFontSize(9);
            doc.setTextColor(40, 40, 40);
            doc.text(lines[0], x, currentY, { baseline: 'top' });
          }
        }
      }
    });
    
    doc.save("KSRTC_Arsikere_Depot_Battery_Tracker.pdf");
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="busNumber" className="block text-sm font-medium text-neutral-700 mb-1">
          Bus Number
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Bus size={18} className="text-neutral-400" />
          </div>
          <input
            type="text"
            id="busNumber"
            name="busNumber"
            value={formData.busNumber}
            onChange={handleInputChange}
            className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
            placeholder="e.g. G-1042"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Battery 1
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Battery size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              name="battery1"
              value={formData.battery1}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
              placeholder="e.g. BAT-1"
            />
          </div>
          <div className="relative w-36 sm:w-40">
            <input
              type="date"
              name="battery1Date"
              value={formData.battery1Date}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Battery 2
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Battery size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              name="battery2"
              value={formData.battery2}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
              placeholder="e.g. BAT-2"
            />
          </div>
          <div className="relative w-36 sm:w-40">
            <input
              type="date"
              name="battery2Date"
              value={formData.battery2Date}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Starter
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Wrench size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              name="starter"
              value={formData.starter}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
              placeholder="e.g. ST-882"
            />
          </div>
          <div className="relative w-36 sm:w-40">
            <input
              type="date"
              name="starterDate"
              value={formData.starterDate}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Alternator
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Zap size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              name="alternator"
              value={formData.alternator}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
              placeholder="e.g. ALT-102"
            />
          </div>
          <div className="relative w-36 sm:w-40">
            <input
              type="date"
              name="alternatorDate"
              value={formData.alternatorDate}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Fan Belt
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Settings size={18} className="text-neutral-400" />
            </div>
            <input
              type="text"
              name="fanBelt"
              value={formData.fanBelt}
              onChange={handleInputChange}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
              placeholder="e.g. FB-405"
            />
          </div>
          <div className="relative w-36 sm:w-40">
            <input
              type="date"
              name="fanBeltDate"
              value={formData.fanBeltDate}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-neutral-700 mb-1">
          Note (Optional)
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FileText size={18} className="text-neutral-400" />
          </div>
          <input
            type="text"
            id="note"
            name="note"
            value={formData.note}
            onChange={handleInputChange}
            className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
            placeholder="e.g. Replaced during regular service"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {editingId ? (
          <>
            <Save size={18} />
            Update Record
          </>
        ) : (
          <>
            <Plus size={18} />
            Save Record
          </>
        )}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      {/* Form Modal Popup */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                {editingId ? <Edit2 size={24} className="text-blue-600" /> : <Plus size={24} className="text-blue-600" />}
                {editingId ? 'Edit Record' : 'Add New Record'}
              </h2>
              <button 
                onClick={cancelEdit} 
                className="text-neutral-400 hover:text-neutral-600 bg-neutral-100 hover:bg-neutral-200 p-2 rounded-full transition-colors" 
                aria-label="Cancel edit"
              >
                <X size={20} />
              </button>
            </div>
            {formContent}
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm">
                <Battery size={24} />
              </div>
              <h1 className="text-xl font-semibold text-neutral-900 hidden sm:block">KSRTC Arsikere Depot Battery Tracker</h1>
              <h1 className="text-xl font-semibold text-neutral-900 sm:hidden">Arsikere Depot Tracker</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleDownloadPdf}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200"
              >
                <Download size={16} />
                <span className="hidden sm:inline font-medium">Export PDF</span>
              </button>
              {isAuthorized && (
                <button 
                  onClick={() => setAdminPassword(null)}
                  className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg border border-neutral-200"
                >
                  <Lock size={16} />
                  <span className="hidden sm:inline">Lock Session</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {errorMsg && (
          <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-center justify-between border border-red-100">
            <p>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} className="hover:bg-red-100 p-1 rounded-md transition-colors"><X size={20} /></button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-8">
          {/* Records List Section */}
          <div className="col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col h-full min-h-[500px]">
              <div className="p-6 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Clock size={20} className="text-neutral-500" />
                    Maintenance Records
                  </h2>
                  <button 
                    onClick={handleAddNewRecord}
                    className="flex items-center gap-2 text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors px-3 py-1.5 rounded-lg border border-transparent shadow-sm"
                  >
                    <Plus size={16} />
                    <span className="font-medium">Add New</span>
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-neutral-400" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by bus number..."
                    className="w-full sm:w-64 pl-9 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-auto bg-neutral-50/50 p-6">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 py-12">
                    <div className="bg-neutral-100 p-4 rounded-full mb-4">
                      <Battery size={32} className="text-neutral-400" />
                    </div>
                    <p className="text-lg font-medium text-neutral-700">No records found</p>
                    <p className="text-sm mt-1 max-w-sm">
                      {searchQuery ? "No records match your search criteria." : "Add a new battery replacement record using the form to get started."}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden lg:block w-full overflow-x-auto bg-white rounded-xl shadow-sm border border-neutral-200">
                      <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                            <th className="px-4 py-3 font-medium text-center">Sl. No.</th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Bus size={14}/> Bus Number</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Battery size={14}/> Battery 1</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Battery size={14}/> Battery 2</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Wrench size={14}/> Starter</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Zap size={14}/> Alternator</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><Settings size={14}/> Fan Belt</div></th>
                            <th className="px-4 py-3 font-medium"><div className="flex items-center gap-1.5"><FileText size={14}/> Note</div></th>
                            <th className="px-4 py-3 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {filteredRecords.map((record, index) => {
                            const recordUpdateDate = new Date(record.lastUpdated ?? record.timestamp).toLocaleDateString();
                            return (
                              <React.Fragment key={record.id}>
                                <tr className={`hover:bg-neutral-50/80 transition-colors ${editingId === record.id ? 'bg-blue-50/40' : 'bg-white'}`}>
                                  <td className="px-4 py-4 text-center font-semibold text-neutral-900">#{index + 1}</td>
                                  <td className="px-4 py-4 font-semibold text-neutral-900">{record.busNumber}</td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-neutral-800">{record.battery1 || record.battery || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{record.battery1Date || recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-neutral-800">{record.battery2 || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{record.battery2Date || recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-neutral-800">{record.starter || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{record.starterDate || recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-neutral-800">{record.alternator || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{record.alternatorDate || recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-neutral-800">{record.fanBelt || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{record.fanBeltDate || recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="text-neutral-800 max-w-[150px] truncate" title={record.note}>{record.note || '-'}</div>
                                    <div className="text-[9px] text-neutral-400 mt-0.5">{recordUpdateDate}</div>
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1 mb-1">
                                      <button onClick={() => handleEdit(record)} className="text-neutral-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-100 transition-colors">
                                        <Edit2 size={16} />
                                      </button>
                                      <button onClick={() => requestDelete(record.id)} className="text-neutral-400 hover:text-red-600 p-1.5 rounded hover:bg-red-100 transition-colors">
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-neutral-400">
                                      {new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                  </td>
                                </tr>
                                {Array.isArray(record.history) && record.history.map((snapshot, i) => (
                                  <tr key={`history-${record.id}-${i}`} className="bg-neutral-50/50 hover:bg-neutral-100/50 transition-colors">
                                    <td className="px-4 py-3 text-center">
                                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider bg-neutral-200/50 px-1.5 py-0.5 rounded">Old</span>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-neutral-500">{record.busNumber}</td>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-neutral-500">{snapshot.battery1 || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{snapshot.battery1Date || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-neutral-500">{snapshot.battery2 || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{snapshot.battery2Date || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-neutral-500">{snapshot.starter || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{snapshot.starterDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-neutral-500">{snapshot.alternator || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{snapshot.alternatorDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-neutral-500">{snapshot.fanBelt || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{snapshot.fanBeltDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-neutral-500 max-w-[150px] truncate" title={snapshot.note}>{snapshot.note || '-'}</div>
                                      <div className="text-[10px] text-neutral-400 mt-0.5">{new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button onClick={() => requestDeleteHistory(record.id, i)} className="text-neutral-400 hover:text-red-600 p-1.5 rounded hover:bg-red-100 transition-colors inline-flex">
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="lg:hidden space-y-4">
                      {filteredRecords.map((record, index) => {
                        const recordUpdateDate = new Date(record.lastUpdated ?? record.timestamp).toLocaleDateString();

                        return (
                          <div key={record.id} className="flex flex-col gap-2">
                            <div className={`bg-white border ${editingId === record.id ? 'border-blue-400 ring-1 ring-blue-400' : 'border-neutral-200'} rounded-xl p-4 shadow-sm relative z-10`}>
                              <div className="flex justify-between items-start mb-4 pb-3 border-b border-neutral-100">
                                <div>
                                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-0.5">Sl. No. #{index + 1}</p>
                                  <div className="flex items-center gap-1.5 text-neutral-900 font-bold text-lg">
                                    <Bus size={18} className="text-blue-600" />
                                    {record.busNumber}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleEdit(record)} className="text-neutral-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                                    <Edit2 size={18} />
                                  </button>
                                  <button onClick={() => requestDelete(record.id)} className="text-neutral-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                              
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-3">
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Battery size={12} /> Battery 1</p>
                                    <p className="text-neutral-800 font-medium text-sm">{record.battery1 || record.battery || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{record.battery1Date || recordUpdateDate}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Battery size={12} /> Battery 2</p>
                                    <p className="text-neutral-800 font-medium text-sm">{record.battery2 || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{record.battery2Date || recordUpdateDate}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Wrench size={12} /> Starter</p>
                                    <p className="text-neutral-800 font-medium text-sm">{record.starter || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{record.starterDate || recordUpdateDate}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Zap size={12} /> Alternator</p>
                                    <p className="text-neutral-800 font-medium text-sm">{record.alternator || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{record.alternatorDate || recordUpdateDate}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Settings size={12} /> Fan Belt</p>
                                    <p className="text-neutral-800 font-medium text-sm">{record.fanBelt || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{record.fanBeltDate || recordUpdateDate}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1"><FileText size={12} /> Note</p>
                                    <p className="text-neutral-800 text-sm line-clamp-2" title={record.note}>{record.note || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{recordUpdateDate}</p>
                                  </div>
                                </div>
                            </div>
                            
                            {/* History Snapshots Mobile */}
                            {Array.isArray(record.history) && record.history.map((snapshot, i) => (
                              <div key={`history-${record.id}-${i}`} className="bg-neutral-50 border-l-2 border-neutral-200 p-4 ml-2 sm:ml-4 shadow-sm relative opacity-90 mt-2">
                                <div className="mb-3 pb-2 border-b border-neutral-200 flex justify-between items-center">
                                  <div>
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider bg-neutral-200/50 px-1.5 py-0.5 rounded mr-2">Old History</span>
                                    <span className="text-xs font-semibold text-neutral-600">{record.busNumber}</span>
                                  </div>
                                  <button onClick={() => requestDeleteHistory(record.id, i)} className="text-neutral-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-3">
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Battery size={10} /> Battery 1</p>
                                    <p className="text-neutral-600 font-medium text-xs mt-0.5">{snapshot.battery1 || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{snapshot.battery1Date || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Battery size={10} /> Battery 2</p>
                                    <p className="text-neutral-600 font-medium text-xs mt-0.5">{snapshot.battery2 || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{snapshot.battery2Date || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Wrench size={10} /> Starter</p>
                                    <p className="text-neutral-600 font-medium text-xs mt-0.5">{snapshot.starter || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{snapshot.starterDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Zap size={10} /> Alternator</p>
                                    <p className="text-neutral-600 font-medium text-xs mt-0.5">{snapshot.alternator || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{snapshot.alternatorDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><Settings size={10} /> Fan Belt</p>
                                    <p className="text-neutral-600 font-medium text-xs mt-0.5">{snapshot.fanBelt || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{snapshot.fanBeltDate || new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider flex items-center gap-1"><FileText size={10} /> Note</p>
                                    <p className="text-neutral-500 text-xs line-clamp-1 mt-0.5" title={snapshot.note}>{snapshot.note || '-'}</p>
                                    <p className="text-[9px] text-neutral-400 mt-0.5">{new Date(snapshot.snapshotTimestamp).toLocaleDateString()}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">Delete Record</h3>
            <p className="text-neutral-600 mb-6">Are you sure you want to delete this maintenance record? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete History Confirmation Modal */}
      {deleteHistoryConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">Delete History</h3>
            <p className="text-neutral-600 mb-6">Are you sure you want to delete this old history snapshot? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteHistoryConfirm(null)}
                className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteHistory}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
                <Lock size={20} className="text-blue-600" />
                Authentication Required
              </h3>
              <button onClick={() => { setShowAuthModal(false); setPendingAction(null); setAuthPassword(''); setAuthError(''); }} className="text-neutral-400 hover:text-neutral-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-neutral-600 mb-4">Please enter the master password to perform this action.</p>
            
            <form onSubmit={handleAuthSubmit}>
              <div className="mb-4">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-shadow pr-10"
                    placeholder="Enter password"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {authError && (
                  <p className="text-red-500 text-sm font-medium mt-2">{authError}</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => { setShowAuthModal(false); setPendingAction(null); setAuthPassword(''); setAuthError(''); }}
                  className="px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={authChecking}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                >
                  {authChecking ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

