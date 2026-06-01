/**
 * 项目元数据检测工具
 * 检测框架、组件库、平台、版本等信息
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectMeta, ProjectConfig, Framework, Platform, ComponentLib } from '../types.js';

export function detectProjectMeta(projectDir: string, config?: ProjectConfig): ProjectMeta {
  const pkgPath = resolve(projectDir, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts || {};

  // 检测框架
  let framework: Framework | undefined;
  let frameworkVersion: string | undefined;

  if (deps['next']) {
    framework = 'nextjs';
    frameworkVersion = deps['next'];
  } else if (deps['nuxt']) {
    framework = 'nuxt';
    frameworkVersion = deps['nuxt'];
  } else if (deps['@dcloudio/uni-app'] || existsSync(resolve(projectDir, 'manifest.json'))) {
    framework = 'uniapp';
  } else if (deps['@tarojs/taro'] || existsSync(resolve(projectDir, 'config/index.js'))) {
    framework = 'taro';
  } else if (deps['react']) {
    framework = 'react';
    frameworkVersion = deps['react'];
  } else if (deps['vue']) {
    framework = 'vue';
    frameworkVersion = deps['vue'];
  } else if (deps['flutter']) {
    framework = 'flutter';
  } else if (deps['react-native']) {
    framework = 'react-native';
  } else if (existsSync(resolve(projectDir, 'entry/src/main/ets')) || deps['@ohos/hvigor']) {
    framework = 'harmony';
  }

  // 检测组件库
  let componentLib: ComponentLib | undefined;
  let componentLibVersion: string | undefined;

  if (deps['antd'] || deps['@ant-design/react-native'] || deps['ant-design-vue']) {
    componentLib = 'antd';
    componentLibVersion = deps['antd'] || deps['ant-design-vue'];
  } else if (deps['element-plus']) {
    componentLib = 'element-plus';
    componentLibVersion = deps['element-plus'];
  } else if (deps['@mui/material']) {
    componentLib = 'mui';
    componentLibVersion = deps['@mui/material'];
  } else if (deps['vuetify']) {
    componentLib = 'vuetify';
  } else if (deps['@nutui/nutui-react'] || deps['@nutui/nutui']) {
    componentLib = 'nutui';
  } else if (deps['tdesign-react'] || deps['tdesign-vue-next']) {
    componentLib = 'tdesign';
  }

  // 检测平台
  const platforms: Platform[] = [];

  if (existsSync(resolve(projectDir, 'manifest.json')) && existsSync(resolve(projectDir, 'pages.json'))) {
    platforms.push('wechat-mp', 'h5', 'app');
  } else if (existsSync(resolve(projectDir, 'app.json')) && existsSync(resolve(projectDir, 'project.config.json'))) {
    platforms.push('wechat-mp');
  } else if (existsSync(resolve(projectDir, 'mini.project.json'))) {
    platforms.push('alipay-mp');
  } else if (framework === 'react' || framework === 'vue' || framework === 'nextjs' || framework === 'nuxt') {
    platforms.push('pc', 'h5');
  } else if (framework === 'flutter' || framework === 'react-native') {
    platforms.push('app');
  } else if (framework === 'harmony') {
    platforms.push('harmony');
  }

  // 检测 i18n
  let hasI18n = false;
  let i18nLib: string | undefined;

  if (deps['react-intl'] || deps['react-i18next'] || deps['vue-i18n'] || deps['i18next']) {
    hasI18n = true;
    i18nLib = Object.keys(deps).find(d =>
      ['react-intl', 'react-i18next', 'vue-i18n', 'i18next', '@dcloudio/uni-i18n'].includes(d)
    );
  }

  return {
    framework,
    componentLib,
    platforms: platforms.length > 0 ? platforms : ['pc'],
    frameworkVersion,
    componentLibVersion,
    hasTypeScript: existsSync(resolve(projectDir, 'tsconfig.json')) || deps['typescript'] !== undefined,
    hasI18n,
    i18nLib,
    scripts,
  };
}
