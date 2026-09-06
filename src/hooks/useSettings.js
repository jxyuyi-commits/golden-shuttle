import { useState, useCallback } from 'react';
import { fetchSettings, fetchSizeGroups, saveSettings } from '../api';

const DEFAULT_SETTINGS = {
  brands: [],
  designers: [],
  people: [], // 人员预设（REQ-006）：[{ name, roles: [] }]，取代设计师库
  categories: [],
  sources: ['自研样衣', '客户来样', '跟单打样'],
  sampleTypes: ['胚样', '面料样', '成品样', '确认样'],
  auditStatuses: ['待审核', '审核中', '已通过', '已拒绝'],
  sizeGroups: [],
};

/** 系统设置管理：加载基础设置 + 号型规格，保存单项配置 */
const useSettings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const loadSettings = useCallback(() => {
    fetchSettings().then(s => {
      setSettings(prev => ({ ...prev, ...s }));
    }).catch(console.error);

    fetchSizeGroups().then(groups => {
      setSettings(prev => ({ ...prev, sizeGroups: Array.isArray(groups) ? groups : [] }));
    }).catch(console.error);
  }, []);

  const saveSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    saveSettings({ key, value })
      .then(() => {
        if (key === 'categories') loadSettings();
      })
      .catch(console.error);
  }, [loadSettings]);

  return { settings, setSettings, loadSettings, saveSetting };
};

export default useSettings;
