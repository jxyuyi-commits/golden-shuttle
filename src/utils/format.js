// 通用格式化工具函数

/** 自动补全 ± 符号：纯数字前加 ±，已有符号的保留 */
export const autoSign = (val) => {
  if (!val || typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (!trimmed) return '';
  if (/^[±\+\-]/.test(trimmed)) return trimmed;
  if (/^[0-9.]/.test(trimmed)) return `±${trimmed}`;
  return trimmed;
};

/** 格式化时间戳为 "最后保存: M/D HH:mm" */
export const formatTime = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return (
      '最后保存: ' +
      (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  } catch {
    return '';
  }
};
