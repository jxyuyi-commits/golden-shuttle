import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, FolderOpen } from 'lucide-react';
import { fetchStyleByNo, fetchTasks, createTask } from '../../api';
import SmartSelect from '../common/SmartSelect';

const STATUS_CN = { todo: '待处理', doing: '打版中', done: '已完结' };

/** 新建打样需求单弹窗（款号自动带出款式信息 + 分类联动号型 + 同款查重） */
const NewTaskModal = ({ settings, onClose, onSuccess, onOpenExisting }) => {
  const [fd, setFd] = useState({
    title: '', style_no: '', category: '', brand: '', designer: '',
    sample_type: '', sample_color: '', priority: 'B', size: '' // REQ-030
  });
  const [loading, setLoading] = useState(false);
  const [isStyleFound, setIsStyleFound] = useState(false);
  const [currentSizeList, setCurrentSizeList] = useState([]);
  const [existingTasks, setExistingTasks] = useState([]); // 同款已有开发单（查重）
  const [forceCreate, setForceCreate] = useState(false);  // 用户确认仍要新建

  const handleStyleBlur = async () => {
    if (!fd.style_no) return;
    setLoading(true);
    try {
      const [styleInfo, allTasks] = await Promise.all([
        fetchStyleByNo(fd.style_no),
        fetchTasks(),
      ]);
      if (styleInfo) {
        setIsStyleFound(true);
        setFd(prev => ({
          ...prev,
          title: styleInfo.title || prev.title,
          category: styleInfo.category || prev.category,
          brand: styleInfo.brand || prev.brand,
          designer: styleInfo.designer || prev.designer
        }));
      } else {
        setIsStyleFound(false);
      }
      // 同款查重：款号相同（忽略大小写与首尾空格）
      const no = fd.style_no.trim().toLowerCase();
      const dup = (allTasks || []).filter(t => (t.style_no || '').trim().toLowerCase() === no);
      setExistingTasks(dup);
      setForceCreate(dup.length === 0);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // 依据「品类 + 号型组」派生默认尺码列表与默认码：属外部 props→本地表单的初始化同步。
  // 若把 fd.size 纳入依赖，会因 effect 内 setFd 触发循环；属既有限制的合理取舍，故块级禁用并说明。
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!fd.category) {
      setCurrentSizeList([]);
      return;
    }
    const catObj = settings.categories.find(c => (typeof c === 'string' ? c : c.name) === fd.category);
    if (catObj && typeof catObj !== 'string' && catObj.size_group_id) {
      const group = settings.sizeGroups.find(g => g.id == catObj.size_group_id);
      if (group) {
        const sizes = group.size_list.split(',').map(s => s.trim());
        setCurrentSizeList(sizes);
        if (!sizes.includes(fd.size)) setFd(prev => ({ ...prev, size: sizes[0] || '' }));
      }
    } else {
      setCurrentSizeList(['S', 'M', 'L', 'XL', 'XXL']);
    }
  }, [fd.category, settings.categories, settings.sizeGroups]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const submit = (e) => {
    e.preventDefault();
    if (existingTasks.length > 0 && !forceCreate) return; // 同款查重未确认，拦截
    createTask(fd).then(onSuccess);
  };

  return (
    <div className="overlay overlay-show" onClick={onClose}>
      <form className="modal glass" onSubmit={submit} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>新建打样需求单</span>
          <button type="button" className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="field">
          <label>款号 (回车或失焦自动带出款式信息)</label>
          <input value={fd.style_no} onChange={e => { setFd({ ...fd, style_no: e.target.value }); setExistingTasks([]); setForceCreate(false); setIsStyleFound(false); }} onBlur={handleStyleBlur} placeholder="例：RWCX-2025-001" />
        </div>
        {loading && <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 12 }}>正在查询款式资料...</div>}
        {isStyleFound && <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 12, padding: '4px 8px', background: 'rgba(74,222,128,0.1)', borderRadius: 4 }}>✓ 找到已有款式，已自动填入基础信息</div>}
        {existingTasks.length > 0 && (
          <div style={{ marginBottom: 12, padding: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 8 }}>
              <AlertTriangle size={14} /> 该款号已有 {existingTasks.length} 张开发单
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {existingTasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  <span>版次：{t.sample_type || '未填'} · 状态：{STATUS_CN[t.status] || t.status || '—'} · {t.size || '—'}码</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '3px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => onOpenExisting && onOpenExisting(t)}
                  >
                    <FolderOpen size={12} /> 打开
                  </button>
                </div>
              ))}
            </div>
            {!forceCreate ? (
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 11, width: '100%', padding: '6px' }}
                onClick={() => setForceCreate(true)}
              >
                以上都不是我要的，仍要新建一张单
              </button>
            ) : (
              <div style={{ fontSize: 11, color: '#fbbf24' }}>已确认新建：将为该款再建一张开发单（阶段3完成后可改为在原单内新增版次批次）</div>
            )}
          </div>
        )}

        <div className="field">
          <label>款式名称 *</label>
          <input required value={fd.title} onChange={e => setFd({ ...fd, title: e.target.value })} placeholder="输入款式名称…" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>款式类别</label>
            <SmartSelect value={fd.category || ''} onChange={v => setFd({ ...fd, category: v })} options={settings.categories} placeholder="请选择类别" allowCustom={false} />
          </div>
          <div className="field">
            <label>品牌</label>
            <SmartSelect value={fd.brand || ''} onChange={v => setFd({ ...fd, brand: v })} options={settings.brands} placeholder="请选择" allowCustom={false} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>本次打样批次配置</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>打样版次</label>
              <SmartSelect value={fd.sample_type} onChange={v => setFd({ ...fd, sample_type: v })} options={settings.sampleTypes || []} />
            </div>
            <div className="field">
              <label>制作尺码 *</label>
              <SmartSelect value={fd.size || ''} onChange={v => setFd({ ...fd, size: v })} options={currentSizeList} placeholder="选择尺码" allowCustom={false} />
            </div>
            <div className="field">
              <label>样衣颜色</label>
              <input value={fd.sample_color} onChange={e => setFd({ ...fd, sample_color: e.target.value })} placeholder="如：黑色" />
            </div>
            <div className="field">
              <label>优先级</label>
              <SmartSelect value={fd.priority || ''} onChange={v => setFd({ ...fd, priority: v })} options={['C', 'B', 'A', 'S']} placeholder="选择优先级" allowCustom={false} />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button
            type="submit"
            className="btn-blue"
            disabled={existingTasks.length > 0 && !forceCreate}
            style={{ opacity: (existingTasks.length > 0 && !forceCreate) ? 0.45 : 1, cursor: (existingTasks.length > 0 && !forceCreate) ? 'not-allowed' : 'pointer' }}
          >
            确认创建
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewTaskModal;
