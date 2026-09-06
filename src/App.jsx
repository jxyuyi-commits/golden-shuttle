import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layout, Plus, X, CheckCircle2, Circle, AlertCircle, ArrowLeft, ArrowUp, ArrowDown, Save, Calculator, Clock, Settings, Check, FileText, Upload, Trash2, ChevronDown, ChevronUp, Edit2, Database, GripVertical } from 'lucide-react';

import { API } from './api/client';
import {
  fetchTasks, createTask, updateTask, deleteTask, updateTaskStatus, fetchTaskVersions,
  fetchStyles, fetchStyleByNo,
  fetchSettings, saveSettings,
  fetchSizeGroups, saveSizeGroups, deleteSizeGroup,
  fetchMeasurementTemplates, saveMeasurementTemplate, deleteMeasurementTemplate,
  uploadDesignFile, openFileLocally, createDrawing, fetchDrawings,
} from './api';
import { loadPdfJs, renderPdfThumb, isImageFile } from './utils/pdf';
import { autoSign, formatTime } from './utils/format';
import useTasks from './hooks/useTasks';
import useSettings from './hooks/useSettings';

import SmartSelect from './components/common/SmartSelect';
import PdfThumb from './components/common/PdfThumb';
import OperationLogsModal from './components/common/OperationLogsModal';
import MeasurementModal from './components/measurement/MeasurementModal';
import MeasurementTemplateManager from './components/measurement/MeasurementTemplateManager';
import SizeTable from './components/size-table/SizeTable';
import NewTaskModal from './components/task/NewTaskModal';
import DetailView from './components/task/DetailView';
import KanbanView from './components/task/KanbanView';
import SizeGroupManager from './components/settings/SizeGroupManager';
import CategoryManager from './components/settings/CategoryManager';
import SettingListEditor from './components/settings/SettingListEditor';
import SettingsView from './components/settings/SettingsView';

const App = () => {
  const [view, setView] = useState('kanban'); // kanban | detail | settings
  const [detailTab, setDetailTab] = useState('base'); // base | size
  const [editingTask, setEditingTask] = useState(null);
  const [isStyleEditing, setIsStyleEditing] = useState(false);
  const [filters, setFilters] = useState({ keyword: '', category: '', sample_type: '', designer: '', priority: '' });
  const [showSidebar, setShowSidebar] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [pdfSyncState, setPdfSyncState] = useState(null); // null | 'syncing' | 'ok' | { error }

  // 业务数据 hooks
  const { tasks, loadTasks } = useTasks();
  const { settings, loadSettings, saveSetting } = useSettings();

  // 看板/列表增强状态
  const [kanbanGroupBy, setKanbanGroupBy] = useState('status'); // status | sample_type | priority
  const [displayMode, setDisplayMode] = useState('kanban'); // kanban | list
  const [activeDropdown, setActiveDropdown] = useState(null); // 'views' | 'cols' | null
  const [listColumns, setListColumns] = useState([
    { id: 'image', label: '图片', visible: true },
    { id: 'action', label: '操作', visible: true },
    { id: 'style_no', label: '款号', visible: true },
    { id: 'title', label: '款名', visible: true },
    { id: 'order_no', label: '版单号', visible: true },
    { id: 'category', label: '类别', visible: true },
    { id: 'brand', label: '品牌', visible: true },
    { id: 'year', label: '年份', visible: true },
    { id: 'season', label: '季节', visible: true },
    { id: 'month', label: '月份', visible: true },
    { id: 'sample_type', label: '版次', visible: true },
    { id: 'sample_color', label: '样衣色', visible: true },
    { id: 'size', label: '样衣码', visible: true },
    { id: 'sample_count', label: '件数', visible: true },
    { id: 'designer', label: '设计师', visible: true },
    { id: 'priority', label: '优先级', visible: true },
    { id: 'status_text', label: '状态', visible: true },
    { id: 'audit_status', label: '审核状态', visible: true },
    { id: 'order_date', label: '下单日期', visible: false },
    { id: 'due_date', label: '要求日期', visible: false },
    { id: 'done_date', label: '完成日期', visible: false },
    { id: 'patterner', label: '版师', visible: false },
    { id: 'sewer', label: '样衣工', visible: false },
    { id: 'fabric', label: '面料', visible: false },
    { id: 'description', label: '描述', visible: false },
    { id: 'remarks', label: '备注', visible: false },
    { id: 'created_at', label: '创建时间', visible: false },
    { id: 'updated_at', label: '更新时间', visible: true },
  ]);
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' });
  const [savedViews, setSavedViews] = useState([
    {
      id: 'default', name: '默认视图', columns: [
        { id: 'image', visible: true }, { id: 'action', visible: true }, { id: 'style_no', visible: true }, { id: 'title', visible: true },
        { id: 'order_no', visible: true }, { id: 'category', visible: true }, { id: 'sample_type', visible: true },
        { id: 'designer', visible: true }, { id: 'priority', visible: true }, { id: 'status_text', visible: true },
        { id: 'updated_at', visible: true }
      ]
    }
  ]);
  const [activeViewId, setActiveViewId] = useState('default');

  // 初始加载业务数据
  useEffect(() => { loadTasks(); loadSettings(); }, [loadTasks, loadSettings]);

  // 新建任务弹窗组件集成在底部
  // 详见 NewTaskModal

  // 进入详情
  const handleEnterDetail = (task) => {
    const parsed = JSON.parse(JSON.stringify(task));
    // 确保 size_data 在内存里是数组（从 DB 读出时可能是 JSON 字符串）
    if (typeof parsed.size_data === 'string') {
      try { parsed.size_data = JSON.parse(parsed.size_data); } catch { parsed.size_data = []; }
    }
    if (!Array.isArray(parsed.size_data)) parsed.size_data = [];
    setEditingTask(parsed);
    setIsStyleEditing(false);
    setDetailTab('base');
    setView('detail');
  };

  // 更新字段：status 与时间线解耦（status 由用户独立控制看板列，时间线只忠实记录过程）
  const setField = (key, value) => setEditingTask(prev => ({ ...prev, [key]: value }));

  // 更新时间线节点字段（纯记录，不反向驱动看板 status）
  const setNodeField = (index, field, value) => {
    setEditingTask(prev => {
      const nodes = [...(prev.progress_nodes || [])];
      nodes[index] = { ...nodes[index], [field]: value };
      return { ...prev, progress_nodes: nodes };
    });
  };

  // 保存详情
  const handleSave = () => {
    if (!editingTask?.id) return;
    setSaveStatus('saving');
    // 关键：所有数组字段必须序列化为字符串，否则服务端 PATCH 会 500
    const toStr = (v) => Array.isArray(v) ? JSON.stringify(v) : (typeof v === 'string' ? v : '[]');
    const payload = {
      ...editingTask,
      size_data: toStr(editingTask.size_data),
      progress_nodes: toStr(editingTask.progress_nodes),
    };
    updateTask(editingTask.id, payload)
      .then(() => {
        setSaveStatus('saved');
        loadTasks();
        setTimeout(() => { setSaveStatus('idle'); }, 1500);
      })
      .catch(err => { setSaveStatus('idle'); alert('保存失败: ' + err.message); });
  };

  // 删除当前单据
  const handleDelete = () => {
    if (!editingTask?.id) return;
    if (!window.confirm(`确定要彻底删除该打样单[单号: ${editingTask.order_no || '未分配'}]吗？\n此操作不可恢复！`)) return;

    deleteTask(editingTask.id)
      .then(() => {
        loadTasks();
        setView('kanban');
      })
      .catch(err => alert('删除失败: ' + err.message));
  };

  // PDF 上传并更新 pdf_url；同步进入图纸资料库（设计稿分类，工作成果可追溯版本）
  const pdfSyncTimer = useRef(null);
  const persistPdfUrl = (url) => {
    if (!editingTask?.id) return;
    setField('pdf_url', url);
    updateTask(editingTask.id, { pdf_url: url })
      .then(loadTasks)
      .catch(err => console.error('保存设计稿引用失败:', err));
  };
  const handlePdfUpload = async (file) => {
    if (!file) return;
    if (pdfSyncTimer.current) { clearTimeout(pdfSyncTimer.current); pdfSyncTimer.current = null; }
    setPdfSyncState(null);
    try {
      const { url } = await uploadDesignFile(file);
      setField('pdf_url', url);
      setPdfSyncState('syncing');
      try {
        await createDrawing({ task_id: editingTask.id, url, category: '设计稿', filename: file.name });
        setPdfSyncState('ok');
        persistPdfUrl(url);
        pdfSyncTimer.current = setTimeout(() => setPdfSyncState(null), 3000);
      } catch (e) {
        console.error('设计稿同步图纸资料失败:', e);
        setPdfSyncState({ error: e.message });
      }
    } catch (err) {
      setPdfSyncState(null);
      alert('上传失败: ' + err.message);
    }
  };

  // 从图纸资料库选择设计稿（导入引用 + 立即持久化）
  const handlePdfSelect = (url) => {
    setPdfSyncState(null);
    persistPdfUrl(url);
  };

  // 移除设计稿（仅移除详情引用，图纸库文件保留）
  const handlePdfRemove = () => {
    setPdfSyncState(null);
    persistPdfUrl('');
  };

  const years = ['2023', '2024', '2025', '2026', '2027'];
  const seasons = ['春', '夏', '秋', '冬'];
  const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const columns = [
    { id: 'todo', name: '待处理', color: '#94a3b8' },
    { id: 'doing', name: '打版中', color: '#38bdf8' },
    { id: 'done', name: '已完结', color: '#4ade80' }
  ];

  return (
    <div className="app" style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#020617',
      color: '#fff',
      overflow: 'hidden',
      minWidth: 1280 // 设置最小宽度，防止窄屏下控件强行压缩变形导致堆叠
    }}>

      {/* ═══ 看板与列表 共享布局 ═══════════════════════════════════════════ */}
      {/* ═══ 看板与列表 共享布局 ═══════════════════════════════════════════ */}
      {view === 'kanban' && (
        <KanbanView
          tasks={tasks}
          filters={filters}
          setFilters={setFilters}
          settings={settings}
          displayMode={displayMode}
          setDisplayMode={setDisplayMode}
          kanbanGroupBy={kanbanGroupBy}
          setKanbanGroupBy={setKanbanGroupBy}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          listColumns={listColumns}
          setListColumns={setListColumns}
          sortConfig={sortConfig}
          setSortConfig={setSortConfig}
          savedViews={savedViews}
          setSavedViews={setSavedViews}
          activeViewId={activeViewId}
          setActiveViewId={setActiveViewId}
          onOpenSidebar={() => setShowSidebar(true)}
          onNewTask={() => setShowNewModal(true)}
          onTaskClick={handleEnterDetail}
        />
      )}

      {/* ═══ 详情视图 ═══════════════════════════════════════════ */}
      {view === 'detail' && editingTask && (
        <DetailView
          task={editingTask}
          settings={settings}
          detailTab={detailTab}
          isStyleEditing={isStyleEditing}
          saveStatus={saveStatus}
          onBack={() => setView('kanban')}
          onOpenSidebar={() => setShowSidebar(true)}
          onDelete={handleDelete}
          onSave={handleSave}
          onSetDetailTab={setDetailTab}
          onSetIsStyleEditing={setIsStyleEditing}
          onSetField={setField}
          onSetNodeField={setNodeField}
          onPdfUpload={handlePdfUpload}
          onPdfSelect={handlePdfSelect}
          onPdfRemove={handlePdfRemove}
          pdfSyncState={pdfSyncState}
        />
      )}


      {/* ═══ 系统设置视图 ════════════════════════════════════════ */}
      {view === 'settings' && (
        <SettingsView
          settings={settings}
          saveSetting={saveSetting}
          loadSettings={loadSettings}
          onBack={() => setView('kanban')}
          onOpenSidebar={() => setShowSidebar(true)}
        />
      )}

      {/* ═══ 全局侧边栏菜单 ════════════════════════════════════════ */}
      {
        showSidebar && (
          <div className="overlay" onClick={() => setShowSidebar(false)}>
            <div className="sidebar glass" onClick={e => e.stopPropagation()}>
              <div className="sidebar-head">
                <span>功能菜单</span>
                <button className="btn-icon" onClick={() => setShowSidebar(false)}><X size={20} /></button>
              </div>
              <div className="menu-item" onClick={() => { setView('kanban'); setShowSidebar(false); }}>
                <Layout size={20} /> 看板主页
              </div>
              <div className="menu-item" onClick={() => { setView('settings'); setShowSidebar(false); }}>
                <Settings size={20} /> 系统设置
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="menu-item" onClick={() => { setShowLogs(true); setShowSidebar(false); }}>
                  <Clock size={20} /> 操作日志
                </div>
                <div style={{ fontSize: 11, color: '#475569', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>PatternMaster v3.1.0</span>
                  <span>{typeof window !== 'undefined' && !!window.api ? 'IPC 通道' : 'HTTP 通道'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* ═══ 各种弹窗组件 ═════════════════════════════════════════ */}
      {
        showLogs && (
          <OperationLogsModal onClose={() => setShowLogs(false)} />
        )
      }
      {
        showNewModal && (
          <NewTaskModal
            settings={settings}
            onClose={() => setShowNewModal(false)}
            onSuccess={() => { setShowNewModal(false); loadTasks(); }}
            onOpenExisting={(task) => { setShowNewModal(false); handleEnterDetail(task); }}
          />
        )
      }

    </div >
  );
};

export default App;