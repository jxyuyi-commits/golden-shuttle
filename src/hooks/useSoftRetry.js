import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSoftRetry —— U16 柔性超时：异步操作「永不硬失败」。
 *
 * 设计要点：
 * - 失败后不锁死 UI：显示「N 秒后自动重试」递减倒计时（N = baseDelay × 已失败次数，封顶 15s）；
 * - 倒计时归零自动重试，最多 maxAttempts 次；超过上限转为「手动重试」兜底，UI 永远给用户出路；
 * - 手动重试（retry）清零失败计数并立即重新执行，与各处「重试按钮/刷新入口」语义兼容；
 * - 任何阶段卸载组件都会清理定时器并停止 setState，杜绝卸载后更新。
 *
 * 注意：fn 必须是稳定引用（调用方用 useCallback 包裹），否则每次渲染都会触发重新加载。
 *
 * @param {() => Promise<any>} fn 异步函数（reject 即视为一次失败）
 * @param {{ baseDelay?: number, maxAttempts?: number }} [opts] baseDelay：首次倒计时秒数；maxAttempts：自动重试次数上限
 * @returns {{ loading: boolean, error: Error|null, countdown: number, data: any, retry: () => Promise<any> }}
 *   loading：请求进行中；error：最近一次失败的异常（成功后清空）；
 *   countdown：>0 表示递减倒计时剩余秒数（0 = 非倒计时态）；data：最近一次成功的结果；retry：手动重试入口
 */
const useSoftRetry = (fn, opts = {}) => {
  const { baseDelay = 5, maxAttempts = 3 } = opts;
  const [state, setState] = useState({ loading: true, error: null, countdown: 0, data: undefined });
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  // 生命周期守卫：mount 期重置为 true（兼容 StrictMode dev 双挂载：mount → cleanup → remount，
  // 若只在 cleanup 置 false，第二次挂载后所有更新会被永久丢弃），cleanup 停表 + 摘除更新开关
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, []);

  // 卸载后静默丢弃 setState（回调里读 mountedRef，不在渲染期写 ref）
  const safeSet = useCallback((patch) => {
    if (mountedRef.current) setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // 具名函数表达式：倒计时归零时通过内部名 run 自递归，规避「声明前访问」的 TDZ 问题
  const execute = useCallback(async function run(task) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      const data = await task();
      attemptsRef.current = 0;
      safeSet({ loading: false, error: null, countdown: 0, data });
      return data;
    } catch (e) {
      attemptsRef.current += 1;
      const canAutoRetry = attemptsRef.current <= maxAttempts;
      if (!canAutoRetry) {
        // 超过自动重试上限：转为手动兜底，不锁死 UI
        safeSet({ loading: false, error: e, countdown: 0 });
        return undefined;
      }
      // 递减倒计时：N = baseDelay × 已失败次数（如 5s → 10s → 15s 封顶），归零自动重试
      let left = Math.min(baseDelay * attemptsRef.current, 15);
      safeSet({ loading: false, error: e, countdown: left });
      timerRef.current = setInterval(() => {
        if (!mountedRef.current) { clearInterval(timerRef.current); timerRef.current = null; return; }
        left -= 1;
        if (left <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          safeSet({ loading: true, error: null, countdown: 0 });
          run(task); // 具名函数表达式自递归，指向当前 useCallback 稳定实例
        } else {
          safeSet({ countdown: left });
        }
      }, 1000);
      return undefined;
    }
  }, [baseDelay, maxAttempts, safeSet]);

  // 手动重试：清零失败计数并立即执行（事件回调内同步 setState，安全）
  const retry = useCallback(() => {
    attemptsRef.current = 0;
    safeSet({ loading: true, error: null, countdown: 0 });
    return execute(fn);
  }, [execute, fn, safeSet]);

  // 挂载 / fn 变化时自动执行；execute 的同步前缀只清定时器、不 setState，规避 set-state-in-effect
  useEffect(() => { execute(fn); }, [execute, fn]);

  return { loading: state.loading, error: state.error, countdown: state.countdown, data: state.data, retry };
};

export default useSoftRetry;
