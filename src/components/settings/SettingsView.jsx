import React from 'react';
import { Layout } from 'lucide-react';
import SettingListEditor from './SettingListEditor';
import PeopleEditor from './PeopleEditor';
import SizeGroupManager from './SizeGroupManager';
import CategoryManager from './CategoryManager';
import MeasurementTemplateManager from '../measurement/MeasurementTemplateManager';

/** 系统设置视图：品牌库/人员预设/版次库 + 号型规格 + 款式分类 + 尺寸部位预设 + 外观主题(REQ-010) */
const SettingsView = ({ settings, saveSetting, loadSettings, onOpenSidebar, themeMode = 'custom', onThemeModeChange }) => {
  return (
    <div className="custom-scrollbar" style={{ background: 'var(--bg)', height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
      <header className="top-bar glass">
        <div className="logo" onClick={onOpenSidebar}>
          <span className="sidebar-hotzone" onMouseEnter={onOpenSidebar}><Layout size={28} color="var(--accent)" /></span><span>PatternMaster Pro</span>
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

        {/* REQ-010 外观主题（自定义 + 系统深/浅三套配色） */}
        <div className="main-settings-area glass animate-slide-up">
          <div className="area-header">
            <div className="area-title-group">
              <div className="area-dot" style={{ background: 'var(--accent)' }} />
              <div className="area-title">外观主题</div>
            </div>
            <div className="area-subtitle">系统深/浅跟随系统原生配色（零色差），自定义为现有配色</div>
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '8px 4px 4px', flexWrap: 'wrap' }}>
            {[
              { key: 'custom', label: '自定义', desc: '深蓝黑自写配色（现有）' },
              { key: 'dark', label: '系统深色', desc: '系统原生深色 · 零色差' },
              { key: 'light', label: '系统浅色', desc: '系统原生浅色 · 零色差' },
            ].map(o => (
              <button
                key={o.key}
                type="button"
                className="theme-option"
                data-active={themeMode === o.key ? '1' : '0'}
                onClick={() => onThemeModeChange && onThemeModeChange(o.key)}
              >
                <div className="theme-option-title">{o.label}</div>
                <div className="theme-option-desc">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
