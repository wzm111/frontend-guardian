/**
 * v2.1.0: 公共工具函数 — 从各 scanner 提取，消除代码重复
 */

/** 从文件路径提取扩展名 */
export function getFileExt(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : ".js";
}

/** 从 JSX AST 节点提取标签名（支持 <Component.Sub />） */
export function getJSXTagName(name: any): string | null {
    if (name.type === "JSXIdentifier") {
        return name.name;
    }
    if (name.type === "JSXMemberExpression") {
        const parts: string[] = [];
        let current = name;
        while (current) {
            if (current.type === "JSXIdentifier") {
                parts.unshift(current.name);
                break;
            } else if (current.type === "JSXMemberExpression") {
                parts.unshift(current.property.name);
                current = current.object;
            } else {
                break;
            }
        }
        return parts.join(".");
    }
    return null;
}
