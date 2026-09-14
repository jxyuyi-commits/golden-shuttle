import { useCallback, useState } from 'react';
import { fetchTasks } from '../api';
import useSoftRetry from './useSoftRetry';

/**
 * 任务列表管理：加载全部打样任务。
 * U16 柔性超时：加载失败不再「一次失败永远卡死」——自动递减倒计时重试（6s/12s/15s），
 * 超过 3 次转手动重试兜底；loadTasks 即「重试/刷新」入口（清零计数后重新拉取）。
 */
const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  // 关键：数据落位必须在 setTasks —— useSoftRetry 只管理重试编排，不代替调用方持有业务状态。
  // （若把裸 fetchTasks 交给它，结果只存在其内部 data，tasks 永远是空数组——U16 首版踩过的 P0）
  const fetchAndSet = useCallback(async () => {
    const list = await fetchTasks();
    setTasks(list || []);
    return list;
  }, []);
  // fetchTasks 失败会 reject，交由 useSoftRetry 统一做倒计时自动重试（fn 保持稳定引用）
  const { error, countdown, retry } = useSoftRetry(fetchAndSet, { baseDelay: 6, maxAttempts: 3 });
  return { tasks, setTasks, loadTasks: retry, error, countdown };
};

export default useTasks;
