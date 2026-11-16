import type { ContextMenuItem } from './ui-contextmenu';

/** Keep routine actions close to the pointer, with less common commands one level deeper. */
export function nodeContextActions(items: readonly ContextMenuItem[]) {
  const available = items.flatMap(item => item.label === '更多' && item.children ? item.children : [item]);
  const selected = new Set<ContextMenuItem>();
  const find = (labels: readonly string[]) => {
    for (const label of labels) {
      const item = available.find(candidate => candidate.label === label && !candidate.disabled && candidate.action);
      if (item) return item;
    }
    return undefined;
  };
  const open = find(['打开', '收起', '打开内容', '快速预览', '进入结构', '进入引用', '打开链接']);
  const expandStructure = available.find(item => item.label?.startsWith('展开结构 (') && !item.disabled && item.action);
  const choices = [
    { icon: open ? 'open' : 'edit', item: open ?? find(['重命名', '编辑', '编辑原文', '编辑 Markdown 原文']) },
    { icon: 'edit', item: find(['修改标题']) },
    { icon: 'edit', item: find(['修改内容']) },
    { icon: 'child', item: find(['新建子节点']) },
    { icon: 'link', item: find(['连线']) },
    { icon: 'pin', item: find(['固定', '解除固定']) },
    { icon: 'fold', item: find(['折叠一级', '展开一级', '收束结构']) ?? expandStructure },
  ];
  const commands = choices.flatMap(({ icon, item }) => {
    if (!item) return [];
    selected.add(item);
    return [{ icon, item }];
  });
  const remaining = available.filter(item => !item.separator && !selected.has(item));
  return { commands, remaining };
}
