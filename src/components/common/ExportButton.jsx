// 通用导出交互按钮：确认 → 执行（busy反馈）→ 结果 toast
// 解决"导出无反馈"问题：点击后有确认环节、执行中有状态、完成/失败有明确提示。
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react';

/**
 * @param {string} label 按钮文字（如"导出"/"导出工艺单"）
 * @param {string} title 确认框标题
 * @param {string} confirmText 确认框描述（导出内容说明）
 * @param {string} fileName 预计文件名（确认框预览 + 成功提示）
 * @param {() => string} onExport 实际导出函数（返回文件名，或抛异常）
 * @param {object} style 按钮自定义样式
 * @param {boolean} disabled 是否禁用
 */
const ExportButton = ({ label, title, confirmText, fileName, onExport, style, disabled }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  // toast 3 秒自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const f = await onExport();
      setToast({ type: 'success', text: `已导出${f ? `：${f}` : ''}，请查看下载栏` });
      setShowConfirm(false);
    } catch (e) {
      setToast({ type: 'error', text: `导出失败：${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn-icon-sm"
        onClick={() => setShowConfirm(true)}
        disabled={busy || disabled}
        title={title}
        style={{
          ...style,
          opacity: busy || disabled ? 0.6 : 1,
          cursor: busy || disabled ? 'not-allowed' : 'pointer'
        }}
      >
        {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
        {busy ? '导出中…' : label}
      </button>

      {/* 导出确认对话框 */}
      {showConfirm && createPortal(
        <div className="overlay" onClick={() => setShowConfirm(false)} style={{ zIndex: 9999, alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal glass" onClick={e => e.stopPropagation()} style={{ width: 440, padding: 28, gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>
                <FileSpreadsheet size={18} color="#38bdf8" /> {title}
              </div>
              <button onClick={() => setShowConfirm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>{confirmText}</div>
            {fileName && (
              <div style={{
                padding: '10px 14px', background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.15)', borderRadius: 8,
                color: '#38bdf8', fontSize: 12, wordBreak: 'break-all',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                <FileSpreadsheet size={14} /> {fileName}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setShowConfirm(false)} disabled={busy} style={{ padding: '8px 18px', borderRadius: 8 }}>
                取消
              </button>
              <button className="btn-blue" onClick={handleConfirm} disabled={busy} style={{ padding: '8px 18px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {busy && <Loader2 size={14} className="spin" />} {busy ? '导出中…' : '确认导出'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 结果 toast */}
      {toast && createPortal(
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 10000,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderRadius: 10, maxWidth: 420,
          background: toast.type === 'success' ? '#0c2b1d' : '#3b0d12',
          border: `1px solid ${toast.type === 'success' ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'}`,
          color: '#e2e8f0', fontSize: 13, boxShadow: '0 12px 34px rgba(0,0,0,0.55)',
          animation: 'fadeInUp 0.25s ease'
        }}>
          {toast.type === 'success'
            ? <CheckCircle2 size={16} color="#4ade80" />
            : <AlertCircle size={16} color="#f87171" />}
          <span style={{ wordBreak: 'break-all' }}>{toast.text}</span>
        </div>,
        document.body
      )}
    </>
  );
};

export default ExportButton;
