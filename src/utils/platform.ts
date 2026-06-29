/**
 * 运行时平台检测工具
 */

/** 检测是否为华为鸿蒙 (HarmonyOS / OpenHarmony) */
export const isHarmonyOS = (): boolean => {
  const ua = navigator.userAgent || '';
  return /OpenHarmony|HarmonyOS/i.test(ua);
};
