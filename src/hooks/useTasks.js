import { useState, useCallback } from 'react';
import { fetchTasks } from '../api';

/** 任务列表管理：加载全部打样任务 */
const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  const loadTasks = useCallback(() => {
    fetchTasks()
      .then((list) => {
        setTasks(list || []);
        setError(null);
      })
      .catch((err) => {
        console.error('加载打样任务失败：', err);
        setError(err);
      });
  }, []);

  return { tasks, setTasks, loadTasks, error };
};

export default useTasks;
