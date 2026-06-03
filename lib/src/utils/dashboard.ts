/**
 * Dashboard — 团队趋势看板生成器
 *
 * v2.8.0 功能：
 * 1. 基于历史报告数据生成静态 HTML 趋势页面
 * 2. 零外部依赖：纯 Canvas 绘制图表，单文件 HTML
 * 3. 可直接浏览器打开或部署到静态托管
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FullReport } from "./history-report.js";

export interface DashboardOptions {
    /** 项目目录 */
    projectDir: string;
    /** 输出文件路径（默认 ./frontend-guardian-dashboard.html） */
    outputPath?: string;
    /** 标题 */
    title?: string;
}

/**
 * 生成趋势看板 HTML
 * @param reports 历史报告列表
 * @param options 选项
 */
export function generateDashboard(reports: FullReport[], options: DashboardOptions): string {
    const { projectDir, outputPath = resolve(projectDir, "frontend-guardian-dashboard.html"), title = "Frontend Guardian 趋势看板" } = options;

    if (reports.length === 0) {
        return "";
    }

    // 按时间排序
    const sorted = [...reports].sort((a, b) => a.timestamp - b.timestamp);

    // 统计
    const totalIssues = sorted.map((r) => ({
        time: formatTime(r.timestamp),
        critical: r.result.issues.critical.length,
        warning: r.result.issues.warning.length,
        suggestion: r.result.issues.suggestion.length,
        total: r.result.total,
    }));

    // 模块分布（最新一次扫描）
    const latest = sorted[sorted.length - 1];
    const moduleCounts = sorted.reduce<Record<string, { critical: number; warning: number; suggestion: number }>>((acc, r) => {
        const mod = r.module;
        if (!acc[mod]) acc[mod] = { critical: 0, warning: 0, suggestion: 0 };
        acc[mod].critical += r.result.issues.critical.length;
        acc[mod].warning += r.result.issues.warning.length;
        acc[mod].suggestion += r.result.issues.suggestion.length;
        return acc;
    }, {});

    // 修复率：对比最早和最新
    const earliest = sorted[0];
    const fixRate = earliest.result.total > 0 ? Math.round(((earliest.result.total - latest.result.total) / earliest.result.total) * 100) : 0;
    const trendDirection = fixRate >= 0 ? "📉 改善" : "📈 恶化";

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; color: #1a1a2e; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 32px; }
.card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card h3 { font-size: 14px; color: #888; margin-bottom: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.big-number { font-size: 42px; font-weight: 700; color: #1a1a2e; }
.big-number.critical { color: #e74c3c; }
.big-number.warning { color: #f39c12; }
.big-number.suggestion { color: #3498db; }
.trend-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500; margin-top: 8px; }
.trend-badge.good { background: #d4edda; color: #155724; }
.trend-badge.bad { background: #f8d7da; color: #721c24; }
.chart-container { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 20px; }
.chart-container h3 { font-size: 16px; margin-bottom: 16px; color: #1a1a2e; }
canvas { width: 100%; height: 300px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
th { font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; }
tr:hover { background: #f9fafb; }
.severity-critical { color: #e74c3c; font-weight: 600; }
.severity-warning { color: #f39c12; font-weight: 600; }
.severity-suggestion { color: #3498db; font-weight: 600; }
.footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 40px; padding-bottom: 24px; }
</style>
</head>
<body>
<div class="container">
<h1>📊 ${escapeHtml(title)}</h1>
<p class="subtitle">生成时间：${new Date().toLocaleString("zh-CN")} | 共 ${reports.length} 次扫描记录</p>

<div class="grid">
<div class="card">
<h3>🔴 Critical</h3>
<div class="big-number critical">${latest.result.issues.critical.length}</div>
</div>
<div class="card">
<h3>🟡 Warning</h3>
<div class="big-number warning">${latest.result.issues.warning.length}</div>
</div>
<div class="card">
<h3>💡 Suggestion</h3>
<div class="big-number suggestion">${latest.result.issues.suggestion.length}</div>
</div>
<div class="card">
<h3>📈 修复趋势</h3>
<div class="big-number">${Math.abs(fixRate)}%</div>
<span class="trend-badge ${fixRate >= 0 ? "good" : "bad"}">${trendDirection}（${earliest.result.total} → ${latest.result.total}）</span>
</div>
</div>

<div class="chart-container">
<h3>📉 问题趋势（时间线）</h3>
<canvas id="trendChart"></canvas>
</div>

<div class="grid">
<div class="chart-container">
<h3>🍰 模块分布</h3>
<canvas id="moduleChart"></canvas>
</div>
<div class="chart-container">
<h3>📋 严重级别分布</h3>
<canvas id="severityChart"></canvas>
</div>
</div>

<div class="chart-container">
<h3>📜 扫描历史</h3>
<table>
<thead>
<tr><th>时间</th><th>模块</th><th>Critical</th><th>Warning</th><th>Suggestion</th><th>耗时</th></tr>
</thead>
<tbody>
${[...sorted].reverse().map((r) => `<tr>
<td>${formatTime(r.timestamp)}</td>
<td>${r.module}</td>
<td class="severity-critical">${r.result.issues.critical.length}</td>
<td class="severity-warning">${r.result.issues.warning.length}</td>
<td class="severity-suggestion">${r.result.issues.suggestion.length}</td>
<td>${r.result.duration}ms</td>
</tr>`).join("")}
</tbody>
</table>
</div>

<div class="footer">
Generated by frontend-guardian v2.8.0
</div>
</div>

<script>
// ── 折线图：问题趋势 ──
(function() {
const canvas = document.getElementById('trendChart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);

const data = ${JSON.stringify(totalIssues)};
const W = rect.width, H = rect.height;
const pad = { t: 30, r: 30, b: 50, l: 50 };
const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;

const maxVal = Math.max(...data.map(d => d.total), 1);
const getX = i => pad.l + (i / (data.length - 1 || 1)) * gw;
const getY = v => pad.t + gh - (v / maxVal) * gh;

// 网格
ctx.strokeStyle = '#eee';
ctx.lineWidth = 1;
for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText(Math.round(maxVal * (1 - i / 4)), 5, y + 4);
}

// 轴线
ctx.strokeStyle = '#ddd';
ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H - pad.b); ctx.stroke();
ctx.beginPath(); ctx.moveTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();

// 数据线
const colors = { critical: '#e74c3c', warning: '#f39c12', suggestion: '#3498db' };
['critical', 'warning', 'suggestion'].forEach(key => {
    ctx.strokeStyle = colors[key];
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = getX(i), y = getY(d[key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 点
    ctx.fillStyle = colors[key];
    data.forEach((d, i) => {
        const x = getX(i), y = getY(d[key]);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
});

// X轴标签
ctx.fillStyle = '#999'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
data.forEach((d, i) => {
    if (data.length <= 10 || i % Math.ceil(data.length / 10) === 0) {
        ctx.fillText(d.time, getX(i), H - pad.b + 20);
    }
});

// 图例
const legend = [{c:'#e74c3c',l:'Critical'},{c:'#f39c12',l:'Warning'},{c:'#3498db',l:'Suggestion'}];
legend.forEach((item, i) => {
    const lx = W - pad.r - 200 + i * 70;
    ctx.fillStyle = item.c; ctx.fillRect(lx, 10, 12, 12);
    ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(item.l, lx + 16, 21);
});
})();

// ── 饼图：模块分布 ──
(function() {
const canvas = document.getElementById('moduleChart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
const W = rect.width, H = rect.height;
const cx = W / 2, cy = H / 2 + 10, r = Math.min(W, H) / 2 - 50;

const mods = ${JSON.stringify(Object.entries(moduleCounts).map(([name, counts]) => ({ name, total: counts.critical + counts.warning + counts.suggestion })))};
const total = mods.reduce((s, m) => s + m.total, 0);
const colors = ['#e74c3c','#f39c12','#3498db','#2ecc71','#9b59b6','#1abc9c','#e67e22','#34495e'];

let angle = -Math.PI / 2;
mods.forEach((mod, i) => {
    const slice = (mod.total / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    // 标签
    if (mod.total > 0) {
        const mid = angle + slice / 2;
        const lx = cx + Math.cos(mid) * (r + 25);
        const ly = cy + Math.sin(mid) * (r + 25);
        ctx.fillStyle = '#555'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(mod.name, lx, ly);
        ctx.fillStyle = '#999'; ctx.font = '11px sans-serif';
        ctx.fillText(mod.total + ' (' + Math.round(mod.total/total*100) + '%)', lx, ly + 14);
    }
    angle += slice;
});
})();

// ── 柱状图：严重级别分布 ──
(function() {
const canvas = document.getElementById('severityChart');
const ctx = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
const W = rect.width, H = rect.height;
const pad = { t: 30, r: 30, b: 40, l: 50 };
const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;

const latest = ${JSON.stringify({ critical: latest.result.issues.critical.length, warning: latest.result.issues.warning.length, suggestion: latest.result.issues.suggestion.length })};
const bars = [
    { label: 'Critical', value: latest.critical, color: '#e74c3c' },
    { label: 'Warning', value: latest.warning, color: '#f39c12' },
    { label: 'Suggestion', value: latest.suggestion, color: '#3498db' },
];
const maxVal = Math.max(...bars.map(b => b.value), 1);

bars.forEach((bar, i) => {
    const bw = gw / bars.length * 0.5;
    const bx = pad.l + (i + 0.5) * (gw / bars.length) - bw / 2;
    const bh = (bar.value / maxVal) * gh;
    const by = pad.t + gh - bh;
    ctx.fillStyle = bar.color;
    ctx.fillRect(bx, by, bw, bh);
    // 标签
    ctx.fillStyle = '#555'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(bar.label, bx + bw / 2, H - pad.b + 20);
    ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(bar.value, bx + bw / 2, by - 8);
});

// Y轴网格
ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * gh;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
}
})();
</script>
</body>
</html>`;

    writeFileSync(outputPath, html, "utf-8");
    return outputPath;
}

function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
