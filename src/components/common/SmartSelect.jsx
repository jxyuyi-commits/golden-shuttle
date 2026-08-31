import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

/** 下拉选择 + 自定义输入组合组件 */
const SmartSelect = ({ value, onChange, options = [], placeholder = '请选择或输入…' }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (v) => { onChange(v); setOpen(false); };

  return (
    <div className="smart-select" ref={ref}>
      <div className="ss-display" onClick={() => setOpen(o => !o)}>
        <span className={value ? '' : 'placeholder'}>{value || placeholder}</span>
        <ChevronDown size={14} />
      </div>
      {open && (
        <div className="ss-dropdown">
          <input
            className="ss-custom-input"
            placeholder="手动输入自定义值…"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { select(custom.trim()); setCustom(''); } }}
            autoFocus
          />
          {options.length > 0 && <div className="ss-divider">预设选项</div>}
          {options.map(opt => {
            const label = typeof opt === 'string' ? opt : (opt.name || '');
            return (
              <div key={label} className={`ss-option ${value === label ? 'selected' : ''}`} onClick={() => select(label)}>
                {label}
              </div>
            );
          })}
          {!options.length && <div className="ss-empty">在上方输入后按 Enter 添加</div>}
        </div>
      )}
    </div>
  );
};

export default SmartSelect;
