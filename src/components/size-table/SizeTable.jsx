import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Calculator, AlertCircle, ChevronUp, ChevronDown, Trash2, Database } from 'lucide-react';
import { autoSign, formatTime } from '../../utils/format';
import { fetchMeasurementTemplates, fetchTaskVersions, saveMeasurementTemplate } from '../../api';
import MeasurementModal from '../measurement/MeasurementModal';
import ConfirmModal from '../common/ConfirmModal';

/** 尺寸指标表格：排序 + 批量操作 + 预设导入 + 拓码 + 成衣实测公差报警 + 版次对比 */
const SizeTable = ({
  data = [],
  onChange,
  updatedAt,
  measurementCategories = [],
  standardSize = 'M',
  sizeGroup = null,
  styleId = null,
  currentTaskId = null,
  category = ''
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [isExpanding, setIsExpanding] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: '', method: '', grading: '', tolerance: '' });
  const [pulse, setPulse] = useState({ row: -1, field: '' });
  const [shake, setShake] = useState({ row: -1, field: '' });
  const [isActualMode, setIsActualMode] = useState(false);
  // REQ-006② 删除确认
  const [confirmIdx, setConfirmIdx] = useState(null); // 单行删除 index
  const [confirmBatch, setConfirmBatch] = useState(false); // 批量删除
  const [confirmClear, setConfirmClear] = useState(false); // 清空全部

  // -- 核心部位提醒 --
  const [requiredParts, setRequiredParts] = useState([]);
  const missingParts = requiredParts.filter(p => !data.some(d => d.name === p.name));

  useEffect(() => {
    if (category) {
      fetchMeasurementTemplates(category)
        .then(list => setRequiredParts(list.filter(t => t.is_required === 1)))
        .catch(() => { });
    }
  }, [category]);

  // -- 版次对比 --
  const [versions, setVersions] = useState([]);
  const [compareTaskId, setCompareTaskId] = useState(null);
  const [compareData, setCompareData] = useState([]);

  useEffect(() => {
    if (styleId) {
      fetchTaskVersions(styleId)
        .then(list => {
          setVersions(list.filter(v => v.id !== currentTaskId));
        })
        .catch(err => console.error('Load versions error:', err));
    }
  }, [styleId, currentTaskId]);

  useEffect(() => {
    if (compareTaskId) {
      const target = versions.find(v => v.id == compareTaskId);
      setCompareData(target ? target.size_data : []);
    } else {
      setCompareData([]);
    }
  }, [compareTaskId, versions]);

  useEffect(() => {
    if (shake.row !== -1) {
      const timer = setTimeout(() => setShake({ row: -1, field: '' }), 300);
      return () => clearTimeout(timer);
    }
  }, [shake]);
  useEffect(() => {
    if (pulse.row !== -1) {
      const timer = setTimeout(() => setPulse({ row: -1, field: '' }), 600);
      return () => clearTimeout(timer);
    }
  }, [pulse]);

  const allSizes = sizeGroup ? sizeGroup.size_list.split(',').map(s => s.trim()) : ['S', 'M', 'L', 'XL', 'XXL'];
  const stdIdx = allSizes.indexOf(standardSize);

  const calcGraded = (base, grading, sizeIndex) => {
    const b = parseFloat(base);
    const g = parseFloat(grading || 0);
    if (isNaN(b) || isNaN(g) || stdIdx < 0) return '';
    const diff = sizeIndex - stdIdx;
    if (diff === 0) return '';
    return (b + diff * g).toFixed(1);
  };

  const checkOutLimit = (row, sizeName, actualVal) => {
    if (!actualVal) return { out: false, diff: 0 };
    const sIdx = allSizes.indexOf(sizeName);
    const isStd = sizeName === standardSize;
    const sVals = typeof row.size_values === 'string' ? JSON.parse(row.size_values || '{}') : (row.size_values || {});
    const instructionValStr = isStd ? row.base : (sVals[sizeName] || calcGraded(row.base, row.grading, sIdx));
    const av = parseFloat(actualVal);
    const iv = parseFloat(instructionValStr);
    const tolV = parseFloat((row.tolerance || '').replace(/[±\+\-]/g, ''));
    if (isNaN(av) || isNaN(iv) || isNaN(tolV)) return { out: false, diff: 0 };
    const diff = Math.abs(av - iv);
    return { out: diff > tolV, diff: av - iv };
  };

  const updateRow = (idx, field, val) => {
    if (['base', 'grading', 'tolerance'].includes(field) && val && /[^0-9.\-±]/.test(val)) {
      setShake({ row: idx, field });
    }
    const finalVal = val.replace(/[^0-9.\-±]/g, '');
    const list = [...data];
    list[idx] = { ...list[idx], [field]: finalVal };
    onChange(list);
    if (field === 'base' || field === 'grading') setPulse({ row: idx, field });
  };

  const updateSizeVal = (rowIdx, sizeName, val, isActual = false) => {
    const fieldKey = isActual ? 'actual_values' : 'size_values';
    if (val && /[^0-9.\-±]/.test(val)) {
      setShake({ row: rowIdx, field: sizeName });
    }
    const finalVal = val.replace(/[^0-9.\-±]/g, '');
    const list = [...data];
    const row = { ...list[rowIdx] };
    const vals = typeof row[fieldKey] === 'string' ? JSON.parse(row[fieldKey] || '{}') : (row[fieldKey] || {});
    vals[sizeName] = finalVal;
    row[fieldKey] = vals;
    list[rowIdx] = row;
    onChange(list);
    setPulse({ row: rowIdx, field: sizeName });
  };

  const removeRow = (idx) => {
    onChange(data.filter((_, i) => i !== idx));
    setSelectedIndices(prev => prev.filter(i => i !== idx).map(i => i > idx ? i - 1 : i));
  };

  const doRemoveRow = () => {
    if (confirmIdx === null) return;
    removeRow(confirmIdx);
    setConfirmIdx(null);
  };

  const doBatchDelete = () => {
    setConfirmBatch(false);
    onChange(data.filter((_, i) => !selectedIndices.includes(i)));
    setSelectedIndices([]);
  };

  const doClear = () => {
    setConfirmClear(false);
    onChange([]);
  };

  const moveRow = (idx, dir) => {
    if ((idx === 0 && dir === -1) || (idx === data.length - 1 && dir === 1)) return;
    const list = [...data];
    [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
    onChange(list);
  };

  const addPoints = (points) => {
    const newRows = points.map(p => ({
      name: p.name, method: p.method || '', tolerance: p.tolerance || '',
      base: '', grading: p.grading_rule || '', note: '', size_values: {}
    }));
    onChange([...data, ...newRows]);
  };

  const catList = measurementCategories.length > 0
    ? measurementCategories
    : ['针织上装', '针织下装', '半裙', '梭织上装', '梭织下装', '毛衫'];

  const allSelected = data.length > 0 && selectedIndices.length === data.length;

  return (
    <div className="size-table-container">
      <div className="size-table-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>尺寸指标表</div>
          {updatedAt && <span style={{ fontSize: 12, color: '#475569' }}>{formatTime(updatedAt)}</span>}
          <div className="size-rule-badge">
            规则: {sizeGroup ? sizeGroup.name : '通用(S-XXL)'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="toggle-expand" onClick={() => setIsExpanding(!isExpanding)}>
            <div className={`toggle-btn ${isExpanding ? 'on' : ''}`}>
              <div className="toggle-thumb" />
            </div>
            <span>拓码模式</span>
          </div>
          {selectedIndices.length > 0 && (
            <button className="btn-ghost" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }} onClick={() => setConfirmBatch(true)}>
              批量删除 ({selectedIndices.length})
            </button>
          )}
          <button className="btn-ghost" onClick={() => setConfirmClear(true)}>清空</button>
          <button
            className={`btn-mode-toggle ${isActualMode ? 'active' : ''}`}
            onClick={() => setIsActualMode(!isActualMode)}
            title={isActualMode ? '正在录入成衣实测尺寸，并对比指令值' : '正在录入/调整尺寸规格（指令值）'}
          >
            {isActualMode ? <CheckCircle2 size={15} /> : <Calculator size={15} />}
            {isActualMode ? '录入成衣实测' : '指令/拓码维护'}
          </button>
          <button className="btn-blue" onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> 从预设加入
          </button>
        </div>
      </div>

      {missingParts.length > 0 && (
        <div style={{ margin: '0 24px 16px', padding: '10px 16px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} color="#fb7185" />
          <span style={{ fontSize: 13, color: '#fda4af' }}>
            建议包含核心部位：
            <span style={{ fontWeight: 700, color: '#fb7185', marginLeft: 4 }}>
              {missingParts.map(p => p.name).join('、')}
            </span>
          </span>
          <button
            className="btn-ghost-sm"
            style={{ marginLeft: 'auto', background: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', border: 'none', padding: '4px 10px' }}
            onClick={() => addPoints(missingParts)}
          >
            快速补齐
          </button>
        </div>
      )}

      {versions.length > 0 && (
        <div className="compare-bar glass" style={{ margin: '0 24px 16px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 8, background: 'rgba(129, 140, 248, 0.05)', border: '1px solid rgba(129, 140, 248, 0.1)' }}>
          <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600 }}>版次对比：</span>
          <select
            className="glass-select"
            style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }}
            value={compareTaskId || ''}
            onChange={e => setCompareTaskId(e.target.value)}
          >
            <option value="">不对比（隐藏对比列）</option>
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                {v.order_no || '未命名单据'} ({v.sample_type || '未知版次'}) - {new Date(v.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          {compareTaskId && (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              💡 将按部位名称自动匹配。紫色值为对比版次数据。
            </span>
          )}
        </div>
      )}

      <div className="table-wrapper custom-scrollbar" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky-col sticky-th sticky-col-1" style={{ width: 36 }}>
                <input type="checkbox" className="table-checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedIndices(allSelected ? [] : data.map((_, i) => i))} />
              </th>
              <th className="sticky-col sticky-th sticky-col-2" style={{ width: 56 }}>排序</th>
              <th className="sticky-col sticky-th sticky-col-3" style={{ minWidth: 140 }}>部位名称</th>
              <th style={{ minWidth: 200 }}>测量方法</th>
              <th style={{ width: 110, color: '#38bdf8', textAlign: 'center' }}>标准码 {standardSize}</th>
              {compareTaskId && (
                <th style={{ width: 100, color: '#818cf8', textAlign: 'center' }}>比对值</th>
              )}
              {isActualMode && (
                <>
                  <th style={{ width: 100, color: '#fb7185', textAlign: 'center' }}>成衣实测</th>
                  <th style={{ width: 80, color: '#fb7185', textAlign: 'center' }}>报警/偏差</th>
                </>
              )}
              {isExpanding && allSizes.filter(s => s !== standardSize).map(s => (
                <th key={s} style={{ width: 80, color: '#94a3b8' }}>{s}码</th>
              ))}
              <th style={{ width: 100, textAlign: 'center' }}>放码规则</th>
              <th style={{ width: 85 }}>公差</th>
              <th style={{ minWidth: 120 }}>备注</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const instrVals = typeof row.size_values === 'string' ? JSON.parse(row.size_values || '{}') : (row.size_values || {});
              const actualVals = typeof row.actual_values === 'string' ? JSON.parse(row.actual_values || '{}') : (row.actual_values || {});
              return (
                <tr key={i} className={selectedIndices.includes(i) ? 'row-selected' : ''}>
                  <td className="sticky-col sticky-col-1">
                    <input type="checkbox" className="table-checkbox"
                      checked={selectedIndices.includes(i)}
                      onChange={() => setSelectedIndices(prev =>
                        prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                      )} />
                  </td>
                  <td className="sticky-col sticky-col-2">
                    <div className="sort-actions">
                      <button className="btn-sort" onClick={() => moveRow(i, -1)} disabled={i === 0}><ChevronUp size={13} /></button>
                      <button className="btn-sort" onClick={() => moveRow(i, 1)} disabled={i === data.length - 1}><ChevronDown size={13} /></button>
                    </div>
                  </td>
                  <td className="sticky-col sticky-col-3">
                    <input className={`${pulse.row === i && pulse.field === 'name' ? 'cell-pulse' : ''} ${shake.row === i && shake.field === 'name' ? 'cell-shake' : ''}`}
                      value={row.name || ''} onChange={e => updateRow(i, 'name', e.target.value)} />
                  </td>
                  <td><input className={`${pulse.row === i && pulse.field === 'method' ? 'cell-pulse' : ''} ${shake.row === i && shake.field === 'method' ? 'cell-shake' : ''}`}
                    value={row.method || ''} onChange={e => updateRow(i, 'method', e.target.value)} /></td>
                  <td>
                    <input
                      className={`${pulse.row === i && pulse.field === 'base' ? 'cell-pulse' : ''} ${shake.row === i && shake.field === 'base' ? 'cell-shake' : ''}`}
                      style={{ color: '#38bdf8', fontWeight: 700 }}
                      value={row.base || ''}
                      onChange={e => updateRow(i, 'base', e.target.value)}
                      placeholder="0.0"
                    />
                  </td>
                  {compareTaskId && (() => {
                    const matched = compareData.find(cr => cr.name === row.name);
                    const compVal = matched ? parseFloat(matched.base) : NaN;
                    const currVal = parseFloat(row.base);
                    const diff = (!isNaN(compVal) && !isNaN(currVal)) ? (currVal - compVal) : null;
                    return (
                      <td style={{ textAlign: 'center', background: 'rgba(129, 140, 248, 0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ color: '#818cf8', fontWeight: 600, fontSize: 13 }}>{matched ? (matched.base || '—') : '—'}</span>
                          {diff !== null && diff !== 0 && (
                            <span style={{ fontSize: 10, color: diff > 0 ? '#ef4444' : '#22c55e' }}>
                              {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })()}
                  {isActualMode && (
                    <>
                      <td style={{ background: 'rgba(251, 113, 133, 0.03)' }}>
                        <input
                          className={pulse.row === i && pulse.field === standardSize ? 'cell-pulse' : ''}
                          style={{ color: '#fb7185', fontWeight: 600, textAlign: 'center' }}
                          value={actualVals[standardSize] || ''}
                          onChange={e => updateSizeVal(i, standardSize, e.target.value, true)}
                          placeholder="录入"
                        />
                      </td>
                      <td style={{ textAlign: 'center', background: 'rgba(251, 113, 133, 0.03)' }}>
                        {(() => {
                          const { out, diff } = checkOutLimit(row, standardSize, actualVals[standardSize]);
                          if (!actualVals[standardSize]) return null;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {out && <AlertCircle size={14} color="#ef4444" />}
                              <span style={{ fontSize: 11, color: out ? '#ef4444' : '#94a3b8', fontWeight: out ? 700 : 400 }}>
                                {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    </>
                  )}
                  {isExpanding && allSizes.filter(s => s !== standardSize).map((s) => {
                    const realIdx = allSizes.indexOf(s);
                    const manualVal = instrVals[s];
                    const isManual = !!instrVals[s];
                    const autoVal = calcGraded(row.base, row.grading, realIdx);
                    const instructionVal = manualVal || autoVal || '';
                    const shouldPulse = pulse.row === i && pulse.field === s;
                    const cellStyle = isManual ? { color: '#f97316', fontWeight: 700, background: 'rgba(249, 115, 22, 0.05)' } : (instructionVal ? {} : { color: '#64748b', fontStyle: 'italic' });
                    return (
                      <td key={s}>
                        <input className={shouldPulse ? 'cell-pulse' : ''}
                          style={cellStyle}
                          value={instructionVal}
                          onChange={e => updateSizeVal(i, s, e.target.value)}
                          placeholder="0.0"
                          title={isManual ? '手动修改' : ''}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <input className={`${pulse.row === i && pulse.field === 'grading' ? 'cell-pulse' : ''} ${shake.row === i && shake.field === 'grading' ? 'cell-shake' : ''}`}
                      value={row.grading || ''}
                      onChange={e => updateRow(i, 'grading', e.target.value)}
                      placeholder="±1.0"
                    />
                  </td>
                  <td><input value={row.tolerance || ''}
                    onChange={e => updateRow(i, 'tolerance', e.target.value)}
                    onBlur={e => updateRow(i, 'tolerance', autoSign(e.target.value))}
                    placeholder="0.5" /></td>
                  <td><input value={row.note || ''} onChange={e => updateRow(i, 'note', e.target.value)} /></td>
                  <td>
                    <button className="icon-btn-danger" title="删除该部位" onClick={() => setConfirmIdx(i)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={isExpanding ? allSizes.length + 6 : 9} style={{ textAlign: 'center', padding: '48px 0', color: '#475569' }}>
                  暂无数据，点击「从预设加入」批量导入部位
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 快速手动添加行 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
          <input
            style={{ flex: 1.2, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }}
            placeholder="部位名称..."
            value={quickAdd.name}
            onChange={e => setQuickAdd({ ...quickAdd, name: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter' && quickAdd.name.trim()) {
                onChange([...data, {
                  name: quickAdd.name.trim(), method: quickAdd.method || '',
                  tolerance: autoSign(quickAdd.tolerance), base: '', grading: quickAdd.grading,
                  note: '', size_values: {}
                }]);
                setQuickAdd({ name: '', method: '', grading: '', tolerance: '' });
              }
            }}
          />
          <input
            style={{ flex: 1.5, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }}
            placeholder="测量方法..."
            value={quickAdd.method || ''}
            onChange={e => setQuickAdd({ ...quickAdd, method: e.target.value })}
          />
          <input
            style={{ width: 70, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }}
            placeholder="档差"
            value={quickAdd.grading}
            onChange={e => setQuickAdd({ ...quickAdd, grading: e.target.value })}
          />
          <input
            style={{ width: 70, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none' }}
            placeholder="公差"
            value={quickAdd.tolerance}
            onChange={e => setQuickAdd({ ...quickAdd, tolerance: e.target.value })}
            onBlur={e => setQuickAdd({ ...quickAdd, tolerance: autoSign(e.target.value) })}
          />
          <button
            className="btn-ghost"
            style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => {
              if (quickAdd.name.trim()) {
                onChange([...data, {
                  name: quickAdd.name.trim(), method: quickAdd.method || '',
                  tolerance: autoSign(quickAdd.tolerance), base: '', grading: quickAdd.grading,
                  note: '', size_values: {}
                }]);
                setQuickAdd({ name: '', method: '', grading: '', tolerance: '' });
              }
            }}
          >
            <Plus size={14} /> 添加
          </button>
          <button
            className="btn-blue"
            style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
            title="一键将该部位及其规则存入系统预设库"
            onClick={async () => {
              const { name, method, grading, tolerance } = quickAdd;
              if (!name.trim()) return alert('请先输入部位名称');
              const cat = measurementCategories && measurementCategories.length > 0 ? measurementCategories[0] : '常规';
              const finalGrading = grading;
              const finalTolerance = autoSign(tolerance);
              try {
                await saveMeasurementTemplate({
                  category: cat, name: name.trim(), code: '', method: method || '',
                  tolerance: finalTolerance, grading_rule: finalGrading, sort_order: 999
                });
                alert(`部位「${name}」及其测量规则已成功存入「${cat}」预设库`);
                onChange([...data, {
                  name: name.trim(), method: method || '', tolerance: finalTolerance,
                  base: '', grading: finalGrading, note: '', size_values: {}
                }]);
                setQuickAdd({ name: '', method: '', grading: '', tolerance: '' });
              } catch (err) {
                alert('存入预设失败: ' + err.message);
              }
            }}
          >
            <Database size={14} /> 存入预设
          </button>
        </div>
      </div>

      <MeasurementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={addPoints}
        categories={catList}
      />

      {/* REQ-006② 删除确认 */}
      {confirmIdx !== null && (
        <ConfirmModal
          title="删除尺寸部位"
          message={`确定删除「${data[confirmIdx]?.name || '该部位'}」吗？\n删除后该部位尺寸数据不可恢复。`}
          onConfirm={doRemoveRow}
          onCancel={() => setConfirmIdx(null)}
        />
      )}
      {confirmBatch && (
        <ConfirmModal
          title="批量删除部位"
          message={`确定删除选中的 ${selectedIndices.length} 个部位吗？\n删除后不可恢复。`}
          onConfirm={doBatchDelete}
          onCancel={() => setConfirmBatch(false)}
        />
      )}
      {confirmClear && (
        <ConfirmModal
          title="清空尺寸表"
          message="确定清空所有行吗？\n清空后当前尺寸表数据不可恢复。"
          onConfirm={doClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
};

export default SizeTable;
