/**
 * v3.17.0: 自定义规则热重载
 *
 * 在 watch 模式下监听 customRules 文件变更，自动重新加载规则。
 */

import { watch, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { CustomRuleConfig } from "@/types.js";
import type { RuleEngine } from "@/engine/rule-engine.js";
import pc from "picocolors";

export interface WatchCustomRulesResult {
    /** 已创建的 watcher 列表 */
    watchers: import("node:fs").FSWatcher[];
    /** 关闭所有 watcher */
    close(): void;
}

/**
 * 监听自定义规则文件变更
 * @param engine RuleEngine 实例
 * @param customRules 配置中的 customRules 列表
 * @param projectDir 项目根目录
 * @param onReload 可选回调，每次重载后调用
 */
export function watchCustomRules(
    engine: RuleEngine,
    customRules: CustomRuleConfig[],
    projectDir: string,
    onReload?: (filePath: string) => void
): WatchCustomRulesResult {
    const watchers: import("node:fs").FSWatcher[] = [];

    for (const config of customRules) {
        const absolutePath = resolve(projectDir, config.path);
        if (!existsSync(absolutePath)) {
            console.warn(pc.yellow(`⚠️  自定义规则文件不存在，跳过监听: ${absolutePath}`));
            continue;
        }

        try {
            const watcher = watch(absolutePath, (eventType) => {
                if (eventType !== "change") return;

                console.log(pc.cyan(`🔄 自定义规则变更: ${relative(projectDir, absolutePath)}`));
                const ok = engine.reloadCustomRule(config.path);
                if (ok) {
                    console.log(pc.green(`   ✅ 规则已重新加载`));
                    onReload?.(config.path);
                } else {
                    console.log(pc.red(`   ❌ 规则重载失败`));
                }
            });
            watchers.push(watcher);
        } catch (err) {
            console.warn(pc.yellow(`⚠️  监听自定义规则失败: ${absolutePath}`), err);
        }
    }

    return {
        watchers,
        close() {
            for (const w of watchers) {
                w.close();
            }
        },
    };
}
