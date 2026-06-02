/**
 * 配置文件加载工具
 * 支持 .frontend-guardian.yml 和 .frontend-guardian.json
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import type { ProjectConfig } from "../types.js";

export function loadConfig(projectDir: string, configFile?: string): ProjectConfig {
  // 1. 尝试指定配置文件
  if (configFile) {
    const customPath = resolve(projectDir, configFile);
    if (existsSync(customPath)) {
      return parseConfigFile(customPath);
    }
  }

  // 2. 尝试默认配置文件
  const ymlPath = resolve(projectDir, ".frontend-guardian.yml");
  const jsonPath = resolve(projectDir, ".frontend-guardian.json");

  if (existsSync(ymlPath)) {
    return parseConfigFile(ymlPath);
  }
  if (existsSync(jsonPath)) {
    return parseConfigFile(jsonPath);
  }

  // 3. 无配置文件，返回空配置
  return {};
}

function parseConfigFile(filePath: string): ProjectConfig {
  const content = readFileSync(filePath, "utf-8");

  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }

  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
    return YAML.parse(content) as ProjectConfig;
  }

  return {};
}
