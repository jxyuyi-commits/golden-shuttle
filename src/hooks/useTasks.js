import { useState, useCallback } from 'react';
import { fetchTasks } from '../api';

/** 任务列表管理：加载全部打样任务 */
const useTasks = () => {
  const [tasks, setTasks] = useState([]);

  const loadTasks = useCallback(() => {
    fetchTasks().then(setTasks).catch(console.error);
  }, []);

  return { tasks, setTasks, loadTasks };
};

export default useTasks;
