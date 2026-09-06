import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Check } from 'lucide-react';
import PdfThumb from '../common/PdfThumb';
import SmartSelect from '../common/SmartSelect';
import { updateStyle } from '../../api';

const YEARS = ['2023', '2024', '2025', '2026', '2027'];
const SEASONS = ['春', '夏', '秋', '冬'];
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

/**
 * 款式信息抽屉（REQ-004 ①）：款级权威信息独立载体，不依附任一打样单页面。
 * 同款所有版次共享；编辑保存即款级生效（全局同步）。
 * @param {object} task - 当前款单（含 style_id 与款级字段 join）
 * @param {object} settings - categories / brands / designers
 */
const StyleInfoDrawer = ({ task, settings, onClose, onSaved }) => {
  const [form, setForm] = useState({
    title: task.title || '',
    category: task.category || '',
    brand: task.brand || '',
    designer: task.designer || '',
    year: task.year || '',
    season: task.season || '',
    month: task.month || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!task.style_id || saving) return;
    setSaving(true);
    try {
      await updateStyle(task.style_id, form);
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved?.(); }, 400);
    } catch (e) {
      alert('款式信息保存失败: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="style-drawer-overlay" onClick={onClose}>
      <div className="style-drawer" onClick={e => e.stopPropagation()}>
        <div className="style-drawer-head">
          <div>
            <div className="style-drawer-title">款式信息</div>
            <div className="style-drawer-sub">款级共享 · 同款所有打样单同步生效</div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="style-drawer-body custom-scrollbar">
          <div className="style-drawer-section">
            <div className="style-drawer-no">款号 {task.style_no || '—'}</div>
          </div>

          <div className="field">
            <label>款式名称</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="款式名称" />
          </div>
          <div className="field">
            <label>款式类别</label>
            <SmartSelect value={form.category} onChange={v => set('category', v)} options={settings.categories} placeholder="选择类别" />
          </div>
          <div className="field">
            <label>品牌</label>
            <SmartSelect value={form.brand} onChange={v => set('brand', v)} options={settings.brands} placeholder="选择品牌" />
          </div>
          <div className="field">
            <label>设计师</label>
            <SmartSelect value={form.designer} onChange={v => set('designer', v)} options={settings.designers} placeholder="选择设计师" />
          </div>
          <div className="field-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="field">
              <label>年度</label>
              <select value={form.year} onChange={e => set('year', e.target.value)}>
                <option value="">请选择</option>
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label>季节</label>
              <select value={form.season} onChange={e => set('season', e.target.value)}>
                <option value="">请选择</option>
                {SEASONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>波段</label>
              <select value={form.month} onChange={e => set('month', e.target.value)}>
                <option value="">请选择</option>
                {MONTHS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="style-drawer-section-title">设计稿（款级共享）</div>
          <div className="style-drawer-pdf">
            {task.pdf_url ? (
              <PdfThumb pdfUrl={task.pdf_url} />
            ) : (
              <div style={{ padding: '28px 0', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                暂无设计稿（可在打样单详情页「基本信息」上传）
              </div>
            )}
          </div>
        </div>

        <div className="style-drawer-foot">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-blue" onClick={save} disabled={saving}>
            {saved ? <><Check size={16} /> 已保存</> : <><Save size={16} /> {saving ? '保存中…' : '保存'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StyleInfoDrawer;
