/**
 * v3.13.0: Unified Diff 格式化器
 *
 * 将原始源码与修复后源码转换为标准 unified diff 格式，
 * 供 MCP 客户端直接渲染或应用到编辑器。
 */

interface DiffOp {
    type: "=" | "-" | "+";
    text: string;
    oldLine?: number;
    newLine?: number;
}

interface Hunk {
    oldStart: number;
    oldLength: number;
    newStart: number;
    newLength: number;
    lines: { type: "=" | "-" | "+"; text: string }[];
}

function computeDiffOps(originalLines: string[], patchedLines: string[]): DiffOp[] {
    const ops: DiffOp[] = [];
    let i = 0;
    let j = 0;
    let oldLineNum = 1;
    let newLineNum = 1;

    while (i < originalLines.length || j < patchedLines.length) {
        if (i < originalLines.length && j < patchedLines.length && originalLines[i] === patchedLines[j]) {
            ops.push({ type: "=", text: originalLines[i], oldLine: oldLineNum, newLine: newLineNum });
            i++;
            j++;
            oldLineNum++;
            newLineNum++;
            continue;
        }

        // 查找下一个匹配行
        let nextMatchInPatched = -1;
        for (let k = j; k < patchedLines.length; k++) {
            if (k < patchedLines.length && patchedLines[k] === originalLines[i]) {
                nextMatchInPatched = k;
                break;
            }
        }

        let nextMatchInOriginal = -1;
        for (let k = i; k < originalLines.length; k++) {
            if (originalLines[k] === patchedLines[j]) {
                nextMatchInOriginal = k;
                break;
            }
        }

        const distanceToMatchPatched = nextMatchInPatched === -1 ? Number.POSITIVE_INFINITY : nextMatchInPatched - j;
        const distanceToMatchOriginal = nextMatchInOriginal === -1 ? Number.POSITIVE_INFINITY : nextMatchInOriginal - i;

        if (distanceToMatchPatched <= distanceToMatchOriginal && nextMatchInPatched !== -1) {
            // patched 中 j..nextMatchInPatched-1 是新增行
            for (let k = j; k < nextMatchInPatched; k++) {
                ops.push({ type: "+", text: patchedLines[k], newLine: newLineNum });
                newLineNum++;
            }
            j = nextMatchInPatched;
        } else if (nextMatchInOriginal !== -1) {
            // original 中 i..nextMatchInOriginal-1 是删除行
            for (let k = i; k < nextMatchInOriginal; k++) {
                ops.push({ type: "-", text: originalLines[k], oldLine: oldLineNum });
                oldLineNum++;
            }
            i = nextMatchInOriginal;
        } else {
            // 都不匹配：删除原行并新增补丁行
            if (i < originalLines.length) {
                ops.push({ type: "-", text: originalLines[i], oldLine: oldLineNum });
                i++;
                oldLineNum++;
            }
            if (j < patchedLines.length) {
                ops.push({ type: "+", text: patchedLines[j], newLine: newLineNum });
                j++;
                newLineNum++;
            }
        }
    }

    return ops;
}

function buildHunks(ops: DiffOp[], contextLines: number): Hunk[] {
    const hunks: Hunk[] = [];
    let i = 0;

    while (i < ops.length) {
        // 跳过不变行
        if (ops[i].type === "=") {
            i++;
            continue;
        }

        // 找到变更区域起止
        const changeStart = i;
        let changeEnd = i;
        while (changeEnd + 1 < ops.length && ops[changeEnd + 1].type !== "=") {
            changeEnd++;
        }

        // 向前/向后扩展上下文
        const hunkStart = Math.max(0, changeStart - contextLines);
        let hunkEnd = Math.min(ops.length - 1, changeEnd + contextLines);

        // 如果后面紧跟着更多变更，合并到同一 hunk
        let lookahead = hunkEnd;
        while (lookahead + 1 < ops.length) {
            const nextChangeStart = lookahead + 1;
            if (ops[nextChangeStart].type === "=") {
                lookahead++;
                continue;
            }
            const gap = nextChangeStart - hunkEnd - 1;
            if (gap > contextLines * 2) break;

            let nextChangeEnd = nextChangeStart;
            while (nextChangeEnd + 1 < ops.length && ops[nextChangeEnd + 1].type !== "=") {
                nextChangeEnd++;
            }
            hunkEnd = Math.min(ops.length - 1, nextChangeEnd + contextLines);
            lookahead = hunkEnd;
        }

        const hunkOps = ops.slice(hunkStart, hunkEnd + 1);
        const oldStart = hunkOps.find((o) => o.oldLine !== undefined)?.oldLine ?? 1;
        const newStart = hunkOps.find((o) => o.newLine !== undefined)?.newLine ?? 1;
        const oldLength = hunkOps.filter((o) => o.type === "=" || o.type === "-").length;
        const newLength = hunkOps.filter((o) => o.type === "=" || o.type === "+").length;

        hunks.push({
            oldStart,
            oldLength,
            newStart,
            newLength,
            lines: hunkOps.map((o) => ({ type: o.type, text: o.text })),
        });

        i = hunkEnd + 1;
    }

    return hunks;
}

/** 生成标准 unified diff */
export function createUnifiedDiff(filePath: string, original: string, patched: string, contextLines = 3): string {
    if (original === patched) return "";

    const originalLines = original.split("\n");
    const patchedLines = patched.split("\n");

    // 去除 split 产生的末尾空行（仅当原始文本以 \n 结尾时）
    if (original.endsWith("\n")) originalLines.pop();
    if (patched.endsWith("\n")) patchedLines.pop();

    const ops = computeDiffOps(originalLines, patchedLines);
    const hunks = buildHunks(ops, contextLines);

    const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

    for (const hunk of hunks) {
        lines.push(`@@ -${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength} @@`);
        for (const { type, text } of hunk.lines) {
            const prefix = type === "=" ? " " : type;
            lines.push(`${prefix}${text}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

/** 批量生成多个文件的 unified diff */
export function createUnifiedDiffs(
    originals: Record<string, string>,
    patched: Record<string, string>,
    contextLines = 3
): Record<string, string> {
    const diffs: Record<string, string> = {};
    for (const file of Object.keys(patched)) {
        const diff = createUnifiedDiff(file, originals[file] ?? "", patched[file], contextLines);
        if (diff) diffs[file] = diff;
    }
    return diffs;
}
