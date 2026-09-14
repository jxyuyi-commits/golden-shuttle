import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, CheckCircle2, Calculator, AlertCircle, ChevronUp, ChevronDown, Trash2, Database, Download, Info } from 'lucide-react';
import { autoSign, formatTime } from '../../utils/format';
import { fetchMeasurementTemplates, saveMeasurementTemplate } from '../../api';
import MeasurementModal from '../measurement/MeasurementModal';
import ConfirmModal from '../common/ConfirmModal';
import SmartSelect from '../common/SmartSelect';

/** 尺寸指标表格：排序 + 批量操作 + 预设导入 + 拓码 + 成衣实测公差报警 + 跨版次（批次）同码对比
 *  REQ-005：尺寸表归属版次——data 为当前批次尺寸表；compareRuns 为同款其它批次（同码 M 对 M 对比） */
/** 单行尺寸指标：React.memo 隔离——输入时仅本行重渲染（卡顿根治）
 *  pulseField/shakeField 只在命中行传具体字段名，其余行为 null → 其余行跳过重渲染 */
const SizeRow = React.memo(({
  row, i, isSelected, pulseField, shakeField,
  previewCompare, compareRun, isActualMode, isExpanding,
  allSizes, standardSize, stdIdx, isLast,
  onUpdateRow, onUpdateSizeVal, onMoveRow, onToggleSelect, onRequestDelete
}) => {
  const instrVals = typeof row.size_values === 'string' ? JSON.parse(row.size_values || '{}') : (row.size_values || {});
  const actualVals = typeof row.actual_values === 'string' ? JSON.parse(row.actual_values || '{}') : (row.actual_values || {});
  const isPulse = (f) => pulseField === f;
  const isShake = (f) => shakeField === f;

  const calcGraded = (base, grading, sizeIndex) => {
    const b = parseFloat(base);
    const g = parseFloat(grading || 0);
    if (isNaN(b) || isNaN(g) || stdIdx < 0) return '';
    const diff = sizeIndex - stdIdx;
    if (diff === 0) return '';
    return (b + diff * g).toFixed(1);
  };

  // REQ-005④ 同码换算：取对比批次在该行"当前批次标准码"下的值
  const compValOf = (r) => {
    if (!compareRun) return null;
    const sVals = typeof r.size_values === 'string' ? JSON.parse(r.size_values || '{}') : (r.size_values || {});
    const compStdIdx = allSizes.indexOf(compareRun.size || standardSize);
    const curStdIdx = allSizes.indexOf(standardSize);
    if (compStdIdx < 0 || curStdIdx < 0) return r.base || '';
    if (compStdIdx === curStdIdx) return r.base || '';
    const manual = sVals[standardSize];
    if (manual !== undefined && manual !== '') return manual;
    const b = parseFloat(r.base);
    const g = parseFloat(r.grading || 0);
    if (isNaN(b) || isNaN(g)) return r.base || '';
    return (b + (curStdIdx - compStdIdx) * g).toFixed(1);
  };

  const checkOutLimit = (sizeName, actualVal) => {
    if (!actualVal) return { out: false, diff: 0 };
    const sIdx = allSizes.indexOf(sizeName);
    const isStd = sizeName === standardSize;
    const sVals = typeof row.size_values === 'string' ? JSON.parse(row.size_values || '{}') : (row.size_values || {});
    const instructionValStr = isStd ? row.base : (sVals[sizeName] || calcGraded(row.base, row.grading, sIdx));
    const av = parseFloat(actualVal);
    const iv = parseFloat(instructionValStr);
    const tolV = parseFloat(String(row.tolerance || '').match(/\d+(\.\d+)?/)?.[0] || '');
    if (isNaN(av) || isNaN(iv) || isNaN(tolV)) return { out: false, diff: 0 };
    const diff = Math.abs(av - iv);
    return { out: diff > tolV, diff: av - iv };
  };

  return (
    <tr className={`${isSelected ? 'row-selected' : ''} ${previewCompare ? 'preview-row' : ''}`}>
      <td className="sticky-col sticky-col-1">
        <input type="checkbox" className="table-checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(i)} />
      </td>
      <td className="sticky-col sticky-col-2">
        <div className="sort-actions">
          <button className="btn-sort" onClick={() => onMoveRow(i, -1)} disabled={i === 0}><ChevronUp size={13} /></button>
          <button className="btn-sort" onClick={() => onMoveRow(i, 1)} disabled={isLast}><ChevronDown size={13} /></button>
        </div>
      </td>
      <td className="sticky-col sticky-col-3">
        <input className={`${isPulse('name') ? 'cell-pulse' : ''} ${isShake('name') ? 'cell-shake' : ''}`}
          value={row.name || ''} onChange={e => onUpdateRow(i, 'name', e.target.value)} />
      </td>
      <td><input className={`${isPulse('method') ? 'cell-pulse' : ''} ${isShake('method') ? 'cell-shake' : ''}`}
        value={row.method || ''} onChange={e => onUpdateRow(i, 'method', e.target.value)} /></td>
      <td>
        <input
          className={`mono ${isPulse('base') ? 'cell-pulse' : ''} ${isShake('base') ? 'cell-shake' : ''}`}
          style={{ color: 'var(--accent)', fontWeight: 700 }}
          value={previewCompare ? '' : (row.base || '')}
          onChange={e => onUpdateRow(i, 'base', e.target.value)}
          placeholder={previewCompare ? '待导入' : '0.0'}
        />
      </td>
      {compareRun && (() => {
        const matched = (compareRun.size_data || []).find(cr => cr.name === row.name);
        const compVal = matched ? compValOf(matched) : null;
        const compNum = compVal === null ? NaN : parseFloat(compVal);
        const currVal = parseFloat(row.base);
        const diff = (!isNaN(compNum) && !isNaN(currVal)) ? (currVal - compNum) : null;
        return (
          <td style={{ textAlign: 'center', background: 'rgba(200, 169, 110, 0.12)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>{compVal === null ? '—' : (compVal || '—')}</span>
              {diff !== null && diff !== 0 && (
                <span style={{ fontSize: 10, color: diff > 0 ? 'var(--color-danger)' : 'var(--color-green-500)' }}>
                  {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                </span>
              )}
            </div>
          </td>
        );
      })()}
      {isActualMode && (
        <>
          <td style={{ background: 'rgba(200, 169, 110, 0.12)' }}>
            <input
              className={`mono ${isPulse(standardSize) ? 'cell-pulse' : ''}`}
              style={{ textAlign: 'center' }}
              value={actualVals[standardSize] || ''}
              onChange={e => onUpdateSizeVal(i, standardSize, e.target.value, true)}
              placeholder="录入"
            />
          </td>
          <td style={{ textAlign: 'center', background: 'rgba(200, 169, 110, 0.12)' }}>
            {(() => {
              const { out, diff } = checkOutLimit(standardSize, actualVals[standardSize]);
              if (!actualVals[standardSize]) return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {out && <AlertCircle size={14} color="var(--color-danger)" />}
                  <span style={{ fontSize: 11, color: out ? 'var(--color-danger)' : 'var(--text-2)', fontWeight: out ? 700 : 400 }}>
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
        const autoVal = calcGraded(row.base, row.grading, realIdx);
        const instructionVal = manualVal || autoVal || '';
        const shouldPulse = isPulse(s);
        const cellStyle = instructionVal ? {} : { color: 'var(--text-3)', fontStyle: 'italic' };
        return (
          <td key={s}>
            <input className={`mono ${shouldPulse ? 'cell-pulse' : ''}`}
              style={cellStyle}
              value={instructionVal}
              onChange={e => onUpdateSizeVal(i, s, e.target.value, false)}
              placeholder="0.0"
            />
          </td>
        );
      })}
      <td>
        <input className={`mono ${isPulse('grading') ? 'cell-pulse' : ''} ${isShake('grading') ? 'cell-shake' : ''}`}
          value={row.grading || ''}
          onChange={e => onUpdateRow(i, 'grading', e.target.value)}
          placeholder="±1.0"
        />
      </td>
      <td><input className="mono" value={row.tolerance || ''}
        onChange={e => onUpdateRow(i, 'tolerance', e.target.value)}
        onBlur={e => onUpdateRow(i, 'tolerance', autoSign(e.target.value))}
        placeholder="0.5" /></td>
      <td><input value={row.note || ''} onChange={e => onUpdateRow(i, 'note', e.target.value)} /></td>
      <td>
        <button className="icon-btn-danger" title="删除该部位" onClick={() => onRequestDelete(i)}><Trash2 size={14} /></button>
      </td>
    </tr>
  );
});

const SizeTable = ({
  data = [],
  onChange,
  updatedAt,
  measurementCategories = [],
  standardSize = 'M',
  sizeGroup = null,
  category = '',
  compareRuns = [],
  onImportCompare = null, // REQ-005 修订2：跨版次对比确认后，把对比版次数据整体导入当前版次
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [isExpanding, setIsExpanding] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ name: '', method: '', grading: '', tolerance: '' });
  const [pulse, setPulse] = useState({ row: -1, field: '' });
  const [shake, setShake] = useState({ row: -1, field: '' });
  const [isActualMode, setIsActualMode] = useState(false);
  // 稳定引用：行级 memo 依赖回调引用不变；data 经 ref 读取最新值
  const dataRef = useRef(data);
  // 渲染期禁止写 ref（react-hooks/refs）：改在提交后同步，事件回调读取到的即最新 data
  useEffect(() => { dataRef.current = data; }, [data]);
  // REQ-006② 删除确认
  const [confirmIdx, setConfirmIdx] = useState(null); // 单行删除 index
  const [confirmBatch, setConfirmBatch] = useState(false); // 批量删除
  const [confirmClear, setConfirmClear] = useState(false); // 清空全部
  const [confirmImportRun, setConfirmImportRun] = useState(null); // REQ-005 修订2：对比版次导入确认

  // -- 核心部位提醒 --
  const [requiredParts, setRequiredParts] = useState([]);
  // 部位名容错：模板中的旧称与尺寸表已更名的部位视为同一部位（如 衣长 → 后中长）
  const PART_ALIASES = { '衣长': ['衣长', '后中长'] };
  const partNameMatches = (rowName, reqName) => {
    if (rowName === reqName) return true;
    const aliases = PART_ALIASES[reqName];
    return !!aliases && aliases.includes(rowName);
  };
  const missingParts = requiredParts.filter(p => !data.some(d => partNameMatches(d.name, p.name)));

  useEffect(() => {
    if (category) {
      fetchMeasurementTemplates(category)
        .then(list => setRequiredParts(list.filter(t => t.is_required === 1)))
        .catch(() => { });
    }
  }, [category]);

  // -- 跨版次对比（REQ-005④ 批次级，同码 M 对 M） --
  const [compareRunId, setCompareRunId] = useState(null);
  // compareRun 由 compareRunId + compareRuns 派生（原 effect+state 在渲染后同步 setState 会触发级联渲染）
  const compareRun = useMemo(
    () => compareRuns.find(r => r.id == compareRunId) || null,
    [compareRunId, compareRuns]
  );

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



  // REQ-005 修订6：当前版次尺寸表为空时，选中对比版次则以该版次数据为「预览行」供查看，确认后导入
  // 注意：预览行为浅拷贝，避免编辑/排序污染对比版次原始数据（输入框经 .preview-row 禁编辑）
  const previewCompare = data.length === 0 && compareRun && Array.isArray(compareRun.size_data) && compareRun.size_data.length > 0;
  const displayRows = previewCompare ? compareRun.size_data.map(r => ({ ...r })) : data;



  const updateRow = useCallback((idx, field, val) => {
    if (['base', 'grading', 'tolerance'].includes(field) && val && /[^0-9.\-±]/.test(val)) {
      setShake({ row: idx, field });
    }
    const finalVal = val.replace(/[^0-9.\-±]/g, '');
    const list = [...dataRef.current];
    list[idx] = { ...list[idx], [field]: finalVal };
    onChange(list);
    if (field === 'base' || field === 'grading') setPulse({ row: idx, field });
  }, [onChange]);

  const updateSizeVal = useCallback((rowIdx, sizeName, val, isActual = false) => {
    const fieldKey = isActual ? 'actual_values' : 'size_values';
    if (val && /[^0-9.\-±]/.test(val)) {
      setShake({ row: rowIdx, field: sizeName });
    }
    const finalVal = val.replace(/[^0-9.\-±]/g, '');
    const list = [...dataRef.current];
    const row = { ...list[rowIdx] };
    const vals = typeof row[fieldKey] === 'string' ? JSON.parse(row[fieldKey] || '{}') : (row[fieldKey] || {});
    vals[sizeName] = finalVal;
    row[fieldKey] = vals;
    list[rowIdx] = row;
    onChange(list);
    setPulse({ row: rowIdx, field: sizeName });
  }, [onChange]);

  const removeRow = useCallback((idx) => {
    onChange(dataRef.current.filter((_, i) => i !== idx));
    setSelectedIndices(prev => prev.filter(i => i !== idx).map(i => i > idx ? i - 1 : i));
  }, [onChange]);

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

  const moveRow = useCallback((idx, dir) => {
    if ((idx === 0 && dir === -1) || (idx === dataRef.current.length - 1 && dir === 1)) return;
    const list = [...dataRef.current];
    [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
    onChange(list);
  }, [onChange]);

  const toggleSelect = useCallback((idx) => {
    setSelectedIndices(prev =>
      prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx]
    );
  }, []);

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

  const allSelected = displayRows.length > 0 && selectedIndices.length === displayRows.length;

  return (
    <div className="size-table-container">
      <div className="size-table-actions">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>尺寸指标表</div>
          {updatedAt && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatTime(updatedAt)}</span>}
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
            <button className="btn-ghost btn-del-ghost" style={{ borderColor: 'var(--border-weak)' }} onClick={() => setConfirmBatch(true)}>
              批量删除 ({selectedIndices.length})
            </button>
          )}
          <button className="btn-ghost" onClick={() => setConfirmClear(true)}>清空</button>
          <button
            className={`btn-mode-toggle ${isActualMode ? 'active' : ''}`}
            onClick={() => setIsActualMode(!isActualMode)}
            title={isActualMode ? '退出成衣尺寸核对模式，返回指令/拓码维护' : '进入成衣尺寸核对模式，录入成衣实测尺寸并与指令值对比'}
          >
            {isActualMode ? <CheckCircle2 size={15} /> : <Calculator size={15} />}
            成衣尺寸核对
          </button>
          <button className="btn-blue" onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> 从预设加入
          </button>
        </div>
      </div>

      {missingParts.length > 0 && (
        <div style={{ margin: '0 24px 16px', padding: '10px 16px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} color="var(--color-rose-400)" />
          <span style={{ fontSize: 13, color: '#fda4af' }}>
            建议包含核心部位：
            <span style={{ fontWeight: 700, color: 'var(--color-rose-400)', marginLeft: 4 }}>
              {missingParts.map(p => p.name).join('、')}
            </span>
          </span>
          <button
            className="btn-ghost-sm"
            style={{ marginLeft: 'auto', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--color-rose-400)', border: 'none', padding: '4px 10px' }}
            onClick={() => addPoints(missingParts)}
          >
            快速补齐
          </button>
        </div>
      )}

      {compareRuns.length > 0 && (
        <div className="compare-bar glass" style={{ margin: '0 24px 16px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 8, background: 'rgba(200, 169, 110, 0.08)', border: '1px solid rgba(200, 169, 110, 0.2)' }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>跨版次对比：</span>
          <SmartSelect
            className="compare-run-ss"
            placeholder="不对比（隐藏对比列）"
            allowCustom={false}
            options={[{ key: '', label: '不对比（隐藏对比列）' }, ...compareRuns.map(r => ({ key: String(r.id), label: `${r.order_no || '未编号批次'} · ${r.sample_type || '未知版次'}（${r.size || '无码'}）` }))]}
            value={compareRunId ? String(compareRunId) : ''}
            onChange={v => setCompareRunId(v)}
          />
          {compareRun && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              💡 同码对比（当前 {standardSize} vs {compareRun.size || standardSize}）——表格「比对值」列为 {compareRun.order_no || '对比版次'} 尺寸数据，金色高亮差异（增减量）；查看确认合适后点「导入该版次数据到当前版次」。
            </span>
          )}
          {compareRun && onImportCompare && (
            <button
              type="button"
              className="btn-ghost-sm"
              style={{ color: 'var(--accent)', border: '1px solid var(--accent-soft-2)', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginLeft: 'auto' }}
              onClick={() => setConfirmImportRun(compareRun)}
              title="将对比版次的尺寸数据整体导入到当前版次（已在「比对值」列核对数据与差异后再决定）"
            >
              <Download size={13} /> 导入该版次数据到当前版次
            </button>
          )}
        </div>
      )}

      {/* REQ-005 修订6：空表 + 对比版次 → 预览提示（表格暂显示参考版次数据，查看后决定导入） */}
      {previewCompare && (
        <div style={{ margin: '0 24px 12px', padding: '10px 14px', borderRadius: 8, border: '1px dashed rgba(200,169,110,0.5)', background: 'rgba(200,169,110,0.08)', fontSize: 12.5, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Info size={14} />
          <span>
            当前版次尺寸表为空，表格暂显示「{compareRun.order_no || '未编号'} · {compareRun.sample_type || ''}」的{compareRun.size_data.length} 行数据预览（标准码留空、金色「比对值」列为该版次数值）。查看确认合适后，点「导入该版次数据到当前版次」整体复制。
          </span>
        </div>
      )}

      <div className="table-wrapper custom-scrollbar" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="sticky-col sticky-th sticky-col-1" style={{ width: 36 }}>
                <input type="checkbox" className="table-checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedIndices(allSelected ? [] : displayRows.map((_, i) => i))} />
              </th>
              <th className="sticky-col sticky-th sticky-col-2" style={{ width: 56 }}>排序</th>
              <th className="sticky-col sticky-th sticky-col-3" style={{ minWidth: 140 }}>部位名称</th>
              <th style={{ minWidth: 200 }}>测量方法</th>
              <th style={{ width: 110, color: 'var(--accent)', textAlign: 'center' }}>标准码 {standardSize}</th>
              {compareRun && (
                <th style={{ width: 100, color: 'var(--accent)', textAlign: 'center' }}>比对值</th>
              )}
              {isActualMode && (
                <>
                  <th style={{ width: 100, textAlign: 'center' }}>成衣实测</th>
                  <th style={{ width: 80, textAlign: 'center' }}>报警/偏差</th>
                </>
              )}
              {isExpanding && allSizes.filter(s => s !== standardSize).map(s => (
                <th key={s} style={{ width: 80, color: 'var(--text-2)' }}>{s}码</th>
              ))}
              <th style={{ width: 100, textAlign: 'center' }}>放码规则</th>
              <th style={{ width: 85 }}>公差</th>
              <th style={{ minWidth: 120 }}>备注</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <SizeRow
                key={i}
                row={row}
                i={i}
                isSelected={selectedIndices.includes(i)}
                pulseField={pulse.row === i ? pulse.field : null}
                shakeField={shake.row === i ? shake.field : null}
                previewCompare={previewCompare}
                compareRun={compareRun}
                isActualMode={isActualMode}
                isExpanding={isExpanding}
                allSizes={allSizes}
                standardSize={standardSize}
                stdIdx={stdIdx}
                isLast={i === data.length - 1}
                onUpdateRow={updateRow}
                onUpdateSizeVal={updateSizeVal}
                onMoveRow={moveRow}
                onToggleSelect={toggleSelect}
                onRequestDelete={setConfirmIdx}
              />
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={isExpanding ? allSizes.length + 6 : 9} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
                  暂无数据，点击「从预设加入」批量导入部位
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 快速手动添加行 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--bg-hover-2)', alignItems: 'center' }}>
          <input
            style={{ flex: 1.2, background: 'var(--input-bg)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
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
            style={{ flex: 1.5, background: 'var(--input-bg)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
            placeholder="测量方法..."
            value={quickAdd.method || ''}
            onChange={e => setQuickAdd({ ...quickAdd, method: e.target.value })}
          />
          <input className="mono"
            style={{ width: 70, background: 'var(--input-bg)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
            placeholder="档差"
            value={quickAdd.grading}
            onChange={e => setQuickAdd({ ...quickAdd, grading: e.target.value })}
          />
          <input className="mono"
            style={{ width: 70, background: 'var(--input-bg)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
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

      {/* REQ-005 修订2：对比版次数据导入确认（已在当前窗口并排核对完整表与差异后导入） */}
      {confirmImportRun && (
        <ConfirmModal
          title="导入对比版次数据"
          message={`将把「${confirmImportRun.order_no || '未编号'} · ${confirmImportRun.sample_type || ''}」的尺寸表（${Array.isArray(confirmImportRun.size_data) ? confirmImportRun.size_data.length : 0} 行）整体导入到当前版次？\n当前版次已有尺寸数据将被覆盖。请确认上方参考版次完整表与差异列已核对无误。`}
          danger={false}
          confirmText="确认导入"
          onConfirm={() => { onImportCompare && onImportCompare(confirmImportRun); setConfirmImportRun(null); }}
          onCancel={() => setConfirmImportRun(null)}
        />
      )}
    </div>
  );
};

export default SizeTable;
