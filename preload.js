// Electron Preload：通过 contextBridge 安全暴露白名单 API 给渲染进程
// 渲染进程只能通过 window.api 调用这些方法，无法直接访问 Node/Electron
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id) => ipcRenderer.invoke('tasks:get', id),
    versions: (styleId) => ipcRenderer.invoke('tasks:versions', styleId),
    create: (data) => ipcRenderer.invoke('tasks:create', data),
    update: (id, data) => ipcRenderer.invoke('tasks:update', id, data),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
  },
  styles: {
    list: () => ipcRenderer.invoke('styles:list'),
    findByNo: (styleNo) => ipcRenderer.invoke('styles:findByNo', styleNo),
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  sizeGroups: {
    list: () => ipcRenderer.invoke('sizeGroups:list'),
    create: (data) => ipcRenderer.invoke('sizeGroups:create', data),
    update: (id, data) => ipcRenderer.invoke('sizeGroups:update', id, data),
    remove: (id) => ipcRenderer.invoke('sizeGroups:remove', id),
  },
  measurements: {
    list: (category) => ipcRenderer.invoke('measurements:list', category),
    upsert: (data) => ipcRenderer.invoke('measurements:upsert', data),
    remove: (id) => ipcRenderer.invoke('measurements:remove', id),
  },
  files: {
    openLocally: (url) => ipcRenderer.invoke('files:openLocally', url),
  },
  drawings: {
    list: (taskId) => ipcRenderer.invoke('drawings:list', taskId),
    create: (data) => ipcRenderer.invoke('drawings:create', data),
    update: (id, data) => ipcRenderer.invoke('drawings:update', id, data),
    remove: (id) => ipcRenderer.invoke('drawings:remove', id),
    groupList: (groupId) => ipcRenderer.invoke('drawings:groupList', groupId),
    removeGroup: (groupId) => ipcRenderer.invoke('drawings:removeGroup', groupId),
  }
});
