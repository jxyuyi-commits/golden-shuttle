import React from 'react';
import { Layout } from 'lucide-react';
import SettingListEditor from './SettingListEditor';
import PeopleEditor from './PeopleEditor';
import SizeGroupManager from './SizeGroupManager';
import CategoryManager from './CategoryManager';
import MeasurementTemplateManager from '../measurement/MeasurementTemplateManager';

/** 系统设置视图：品牌库/人员预设/版次库 + 号型规格 + 款式分类 + 尺寸部位预设 */
const SettingsView = ({ settings, saveSetting, loadSettings, onBack, onOpenSidebar }) => {
  return (
    <div className="custom-scrollbar" style={{ background: '#020617', height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
      <header className="top-bar glass">
        <div className="logo" onClick={onOpenSidebar}>
          <span className="sidebar-hotzone" onMouseEnter={onOpenSidebar}><Layout size={28} color="#38bdf8" /></span><span>PatternMaster Pro</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-ghost" onClick={onBack}>返回主页</button>
        </div>
      </header>

      <div className="settings-container animate-fade-in">
        <div className="top-settings-grid">
          <SettingListEditor label="品牌库" items={settings.brands || []}
            onChange={items => saveSetting('brands', items)} />
          <PeopleEditor people={settings.people || []}
            onChange={items => saveSetting('people', items)} />
          <SettingListEditor label="打样版次库" items={settings.sampleTypes || []}
            onChange={items => saveSetting('sampleTypes', items)} />
        </div>

        <div className="complex-settings-row glass animate-slide-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: 24, marginTop: 24, alignItems: 'start' }}>
          <SizeGroupManager
            groups={settings.sizeGroups || []}
            onChange={loadSettings}
          />
          <CategoryManager
            items={settings.categories || []}
            sizeGroups={settings.sizeGroups || []}
            onChange={items => saveSetting('categories', items)}
          />
        </div>

        <div className="main-settings-area glass animate-slide-up">
          <div className="area-header">
            <div className="area-title-group">
              <div className="area-dot" />
              <div className="area-title">尺寸部位管理</div>
            </div>
            <div className="area-subtitle">分品类管理全局预设部位，建立统一的尺寸指标模型</div>
          </div>
          <MeasurementTemplateManager
            categories={settings.measurementCategories || []}
            onCategoriesChange={cats => saveSetting('measurementCategories', cats)}
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
