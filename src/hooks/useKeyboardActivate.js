import { useCallback } from 'react';

/**
 * U14 键盘可达化共用逻辑：非交互元素（div/span 挂 onClick）的键盘激活
 *
 * 两种用法：
 * 1) 组件级（hook，返回稳定 onKeyDown）：
 *    const onKey = useKeyboardActivate(() => setOpen(o => !o));
 *    <div role="button" tabIndex={0} onClick={...} onKeyDown={onKey}>
 * 2) 循环内（模块级工厂，不可在循环/回调里调 hook 时用）：
 *    <div onKeyDown={keyboardActivate(() => select(k))}>
 *
 * 规则：
 * - Enter / Space 触发 onActivate；Space preventDefault 防页面滚动
 * - 事件目标是子交互元素（button/input/select/textarea/a/contentEditable）时放行不劫持，
 *   避免子元素自身键盘行为（如按钮 Space 触发点击）冒泡后双重执行
 */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']);

export const keyboardActivate = (onActivate) => (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const target = e.target;
  if (target !== e.currentTarget) {
    const tag = target && target.tagName;
    if (INTERACTIVE_TAGS.has(tag) || (target && target.isContentEditable)) return;
  }
  if (e.key === ' ') e.preventDefault();
  if (typeof onActivate === 'function') onActivate(e);
};

/**
 * 组件级 hook：返回 onKeyDown 处理器（onActivate 变化时处理器随之更新）
 * @param {Function} onActivate Enter/Space 时执行的回调（与该元素 onClick 同一动作）
 * @returns {(e: KeyboardEvent) => void}
 */
const useKeyboardActivate = (onActivate) => {
  const onKeyDown = useCallback((e) => keyboardActivate(onActivate)(e), [onActivate]);
  return onKeyDown;
};

export default useKeyboardActivate;
