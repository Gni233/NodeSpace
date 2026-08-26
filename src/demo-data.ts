import type { GraphData } from './data/storage';
import _start from './data/builtin/start.json';
import _structure from './data/builtin/structure.json';
import _readme from './data/builtin/readme.json';
import _semanticDemo from './data/builtin/semantic-demo.json';

export const BUILTIN_NAMES = ['开始', '自动构图示例', '结构', '说明文档'] as const;
export const BUILTIN_NAMES_SET = new Set<string>(BUILTIN_NAMES);

export function isBuiltin(fileName: string): boolean {
  return BUILTIN_NAMES_SET.has(fileName);
}

export const BUILTIN_GRAPHS: Record<string, GraphData> = {
  '开始': _start as GraphData,
  '自动构图示例': _semanticDemo as GraphData,
  '结构': _structure as GraphData,
  '说明文档': _readme as GraphData,
};
