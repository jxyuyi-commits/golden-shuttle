// API 层：所有后端请求集中管理
// 从 App.jsx 提取，保持原有请求行为

import { apiGet, apiPost, apiPatch, apiDelete, apiUrl, API } from './client';

/* ── 打样单 Tasks ── */
export const fetchTasks = () => apiGet('/api/tasks');
export const createTask = (data) => apiPost('/api/tasks', data);
// 后端使用 PATCH 局部更新（REST 语义），修复此前 PUT→404 的保存失败 bug
export const updateTask = (id, data) => apiPatch(`/api/tasks/${id}`, data);
export const deleteTask = (id) => apiDelete(`/api/tasks/${id}`);
export const updateTaskStatus = (id, status) =>
  apiPatch(`/api/tasks/${id}`, { status });
export const fetchTaskVersions = (styleId) =>
  apiGet(`/api/tasks/versions/${styleId}`);

/* ── 版次批次 Sample Runs（一款单下多个打样批次） ── */
export const fetchRuns = (taskId) => apiGet(`/api/tasks/${taskId}/runs`);
export const createRun = (taskId, data) => apiPost(`/api/tasks/${taskId}/runs`, data);
export const updateRun = (runId, data) => apiPatch(`/api/runs/${runId}`, data);
export const deleteRun = (runId) => apiDelete(`/api/runs/${runId}`);

/* ── 操作日志 ── */
export const fetchLogs = (params = {}) => {
  const q = new URLSearchParams();
  if (params.taskId) q.set('task_id', params.taskId);
  if (params.limit) q.set('limit', params.limit);
  const qs = q.toString();
  return apiGet(`/api/logs${qs ? '?' + qs : ''}`);
};

/* ── 款式 Styles ── */
export const fetchStyles = () => apiGet('/api/styles');
export const fetchStyleByNo = (styleNo) =>
  apiGet(`/api/styles?style_no=${encodeURIComponent(styleNo)}`);

/* ── 系统设置 Settings ── */
export const fetchSettings = () => apiGet('/api/settings');
export const saveSettings = (data) => apiPost('/api/settings', data);

/* ── 号型组 Size Groups ── */
export const fetchSizeGroups = () => apiGet('/api/size-groups');
export const saveSizeGroups = (data) => apiPost('/api/size-groups', data);
export const deleteSizeGroup = (id) => apiDelete(`/api/size-groups/${id}`);

/* ── 尺寸部位预设 Measurement Templates ── */
export const fetchMeasurementTemplates = (category) =>
  apiGet(`/api/measurement-templates?category=${encodeURIComponent(category)}`);
export const saveMeasurementTemplate = (data) =>
  apiPost('/api/measurement-templates', data);
export const deleteMeasurementTemplate = (id) =>
  apiDelete(`/api/measurement-templates/${id}`);

/* ── BOM 物料清单 ── */
export const fetchBomItems = (taskId) => apiGet(`/api/bom?task_id=${taskId}`);
export const createBomItem = (data) => apiPost('/api/bom', data);
export const updateBomItem = (id, data) => apiPatch(`/api/bom/${id}`, data);
export const deleteBomItem = (id) => apiDelete(`/api/bom/${id}`);
export const replaceBomItems = (taskId, items) =>
  apiPut(`/api/bom/task/${taskId}`, items);

/* ── 工艺指示 Process ── */
export const fetchProcessItems = (taskId) => apiGet(`/api/process?task_id=${taskId}`);
export const createProcessItem = (data) => apiPost('/api/process', data);
export const updateProcessItem = (id, data) => apiPatch(`/api/process/${id}`, data);
export const deleteProcessItem = (id) => apiDelete(`/api/process/${id}`);
export const replaceProcessItems = (taskId, items) =>
  apiPut(`/api/process/task/${taskId}`, items);

/* ── 文件上传 ── */
export const uploadDesignFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const result = await apiPost('/api/upload-pdf', {
          filename: file.name,
          data: base64,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/* ── 图纸资料 Drawings ── */
export const fetchDrawings = (taskId) => apiGet(`/api/drawings?task_id=${taskId}`);
export const fetchDrawingGroup = (groupId) => apiGet(`/api/drawings/group/${groupId}`);
export const createDrawing = (data) => apiPost('/api/drawings', data);
export const updateDrawing = (id, data) => apiPatch(`/api/drawings/${id}`, data);
export const deleteDrawing = (id) => apiDelete(`/api/drawings/${id}`);
export const deleteDrawingGroup = (groupId) => apiDelete(`/api/drawings/group/${groupId}`);

/* ── 用本地程序打开文件 ── */
export const openFileLocally = (url) =>
  fetch(apiUrl('/api/open-pdf'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(console.error);

export { API, apiUrl };
