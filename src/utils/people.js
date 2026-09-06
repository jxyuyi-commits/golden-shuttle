// 人员预设（REQ-006）：settings.people = [{ name, roles: [] }]
// 角色建议集合（可自定义扩展）；版师=纸样师（与系统批次字段一致，用户原话亦含「纸样师」）
export const PEOPLE_ROLES = ['设计师', '版师', '样衣工'];

/** 取指定角色的人员名单（用于下拉预设；SmartSelect 仍支持自由输入） */
export const peopleByRole = (people, role) =>
  (people || []).filter(p => (p.roles || []).includes(role)).map(p => p.name);
