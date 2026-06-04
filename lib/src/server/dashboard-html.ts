/**
 * Dashboard HTML Generator
 *
 * Generates a self-contained SPA that fetches data from the
 * dashboard server APIs and renders charts using Canvas.
 *
 * Zero external dependencies: pure native JS + Canvas.
 */

export function generateDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frontend Guardian Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; color: #1a1a2e; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
.project-select { margin-bottom: 24px; }
.project-select select { padding: 10px 16px; font-size: 15px; border: 1px solid #ddd; border-radius: 8px; background: #fff; min-width: 300px; cursor: pointer; }
.project-select label { font-size: 14px; color: #666; margin-right: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 32px; }
.card { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card h3 { font-size: 13px; color: #888; margin-bottom: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
.big-number { font-size: 42px; font-weight: 700; color: #1a1a2e; }
.big-number.critical { color: #e74c3c; }
.big-number.warning { color: #f39c12; }
.big-number.suggestion { color: #3498db; }
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
.empty { text-align: center; padding: 60px 20px; color: #999; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #ddd; border-top-color: #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.no-data { color: #999; font-style: italic; padding: 20px; text-align: center; }
</style>
</head>
<body>
<div class="container">
<h1>Frontend Guardian Dashboard</h1>
<p class="subtitle">Multi-project governance trends and scan history</p>

<div class="project-select">
<label for="project-select">Project:</label>
<select id="project-select">
<option value="">Loading projects...</option>
</select>
<span id="loading" style="margin-left:12px;display:none;"><span class="spinner"></span></span>
</div>

<div id="dashboard-content">
<div class="empty">
<div class="empty-icon">&#128202;</div>
<p>Select a project to view dashboard</p>
</div>
</div>

<div class="footer">
Frontend Guardian v3.5.2
</div>
</div>

<script>
// ── Dashboard SPA ─────────────────────────────────────────────────────
const projectSelect = document.getElementById('project-select');
const dashboardContent = document.getElementById('dashboard-content');
const loading = document.getElementById('loading');

let currentProjectId = null;

// Load projects on page load
async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        const projects = data.projects || [];

        projectSelect.innerHTML = '';
        if (projects.length === 0) {
            projectSelect.innerHTML = '<option value="">No projects yet</option>';
            dashboardContent.innerHTML = '<div class="empty"><div class="empty-icon">&#128230;</div><p>No scan reports received yet.</p><p style="font-size:13px;margin-top:8px;">Run: fg-core ./project --scan --server http://' + location.host + '</p></div>';
            return;
        }

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a project...';
        projectSelect.appendChild(placeholder);

        for (const p of projects) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + ' (' + p.reportCount + ' reports)';
            projectSelect.appendChild(opt);
        }
    } catch (err) {
        projectSelect.innerHTML = '<option value="">Failed to load projects</option>';
    }
}

projectSelect.addEventListener('change', async () => {
    const id = projectSelect.value;
    if (!id) {
        dashboardContent.innerHTML = '<div class="empty"><div class="empty-icon">&#128202;</div><p>Select a project to view dashboard</p></div>';
        return;
    }
    currentProjectId = id;
    loading.style.display = 'inline-block';
    await loadDashboard(id);
    loading.style.display = 'none';
});

async function loadDashboard(projectId) {
    try {
        const [trendsRes, latestRes, reportsRes] = await Promise.all([
            fetch('/api/projects/' + projectId + '/trends'),
            fetch('/api/projects/' + projectId + '/latest'),
            fetch('/api/projects/' + projectId + '/reports?limit=20'),
        ]);

        const trendsData = await trendsRes.json();
        const latestData = await latestRes.json();
        const reportsData = await reportsRes.json();

        renderDashboard(trendsData.trends || [], latestData.report || null, reportsData.reports || []);
    } catch (err) {
        dashboardContent.innerHTML = '<div class="empty"><div class="empty-icon">&#9888;</div><p>Failed to load dashboard data</p><p style="font-size:13px;">' + String(err) + '</p></div>';
    }
}

function renderDashboard(trends, latest, reports) {
    const hasData = trends.length > 0;
    const latestCounts = latest ? {
        critical: latest.result.issues.critical.length,
        warning: latest.result.issues.warning.length,
        suggestion: latest.result.issues.suggestion.length,
    } : { critical: 0, warning: 0, suggestion: 0 };

    // Fix rate: compare first and last trend point
    let fixRate = 0;
    let trendDir = '-';
    if (trends.length >= 2) {
        const first = trends[0];
        const last = trends[trends.length - 1];
        const firstTotal = first.critical + first.warning + first.suggestion;
        const lastTotal = last.critical + last.warning + last.suggestion;
        fixRate = firstTotal > 0 ? Math.round(((firstTotal - lastTotal) / firstTotal) * 100) : 0;
        trendDir = fixRate >= 0 ? 'Improving' : 'Worsening';
    }

    let html = '<div class="grid">';
    html += '<div class="card"><h3>Critical</h3><div class="big-number critical">' + latestCounts.critical + '</div></div>';
    html += '<div class="card"><h3>Warning</h3><div class="big-number warning">' + latestCounts.warning + '</div></div>';
    html += '<div class="card"><h3>Suggestion</h3><div class="big-number suggestion">' + latestCounts.suggestion + '</div></div>';
    html += '<div class="card"><h3>Trend</h3><div class="big-number">' + Math.abs(fixRate) + '%</div><span style="font-size:13px;color:#666;">' + trendDir + '</span></div>';
    html += '</div>';

    if (hasData) {
        html += '<div class="chart-container"><h3>Issue Trends</h3><canvas id="trendChart"></canvas></div>';

        html += '<div class="grid">';
        html += '<div class="chart-container"><h3>Severity Distribution</h3><canvas id="severityChart"></canvas></div>';
        html += '<div class="chart-container"><h3>Module Distribution</h3><canvas id="moduleChart"></canvas></div>';
        html += '</div>';
    }

    // Scan history table
    html += '<div class="chart-container"><h3>Scan History</h3>';
    if (reports.length === 0) {
        html += '<p class="no-data">No scan history</p>';
    } else {
        html += '<table><thead><tr><th>Time</th><th>Module</th><th>Critical</th><th>Warning</th><th>Suggestion</th></tr></thead><tbody>';
        for (const r of reports) {
            const d = new Date(r.timestamp);
            const time = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td>' + r.module + '</td>';
            html += '<td class="severity-critical">' + r.counts.critical + '</td>';
            html += '<td class="severity-warning">' + r.counts.warning + '</td>';
            html += '<td class="severity-suggestion">' + r.counts.suggestion + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
    }
    html += '</div>';

    dashboardContent.innerHTML = html;

    if (hasData) {
        drawTrendChart(trends);
        drawSeverityChart(latestCounts);
        drawModuleChart(latest ? latest.module : 'all');
    }
}

function drawTrendChart(trends) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const pad = { t: 30, r: 30, b: 50, l: 50 };
    const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;

    const maxVal = Math.max(...trends.map(d => d.total), 1);
    const getX = i => pad.l + (i / (trends.length - 1 || 1)) * gw;
    const getY = v => pad.t + gh - (v / maxVal) * gh;

    // Grid
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (i / 4) * gh;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
        ctx.fillText(Math.round(maxVal * (1 - i / 4)), 5, y + 4);
    }

    // Axes
    ctx.strokeStyle = '#ddd';
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, H - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, H - pad.b); ctx.lineTo(W - pad.r, H - pad.b); ctx.stroke();

    // Lines
    const colors = { critical: '#e74c3c', warning: '#f39c12', suggestion: '#3498db' };
    ['critical', 'warning', 'suggestion'].forEach(key => {
        ctx.strokeStyle = colors[key]; ctx.lineWidth = 2;
        ctx.beginPath();
        trends.forEach((d, i) => {
            const x = getX(i), y = getY(d[key]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = colors[key];
        trends.forEach((d, i) => {
            const x = getX(i), y = getY(d[key]);
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
    });

    // X labels
    ctx.fillStyle = '#999'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    trends.forEach((d, i) => {
        if (trends.length <= 10 || i % Math.ceil(trends.length / 10) === 0) {
            const date = new Date(d.timestamp);
            const label = String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
            ctx.fillText(label, getX(i), H - pad.b + 20);
        }
    });

    // Legend
    const legend = [{c:'#e74c3c',l:'Critical'},{c:'#f39c12',l:'Warning'},{c:'#3498db',l:'Suggestion'}];
    legend.forEach((item, i) => {
        const lx = W - pad.r - 200 + i * 70;
        ctx.fillStyle = item.c; ctx.fillRect(lx, 10, 12, 12);
        ctx.fillStyle = '#666'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(item.l, lx + 16, 21);
    });
}

function drawSeverityChart(counts) {
    const canvas = document.getElementById('severityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const pad = { t: 30, r: 30, b: 40, l: 50 };
    const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;

    const bars = [
        { label: 'Critical', value: counts.critical, color: '#e74c3c' },
        { label: 'Warning', value: counts.warning, color: '#f39c12' },
        { label: 'Suggestion', value: counts.suggestion, color: '#3498db' },
    ];
    const maxVal = Math.max(...bars.map(b => b.value), 1);

    bars.forEach((bar, i) => {
        const bw = gw / bars.length * 0.5;
        const bx = pad.l + (i + 0.5) * (gw / bars.length) - bw / 2;
        const bh = (bar.value / maxVal) * gh;
        const by = pad.t + gh - bh;
        ctx.fillStyle = bar.color;
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#555'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(bar.label, bx + bw / 2, H - pad.b + 20);
        ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif';
        ctx.fillText(bar.value, bx + bw / 2, by - 8);
    });

    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (i / 4) * gh;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }
}

function drawModuleChart(moduleName) {
    const canvas = document.getElementById('moduleChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    // Simple pie showing just the module name since we aggregate per-module
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 40;
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(moduleName, cx, cy + 6);
    ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
    ctx.fillText('Module', cx, cy + 22);
}

// Auto-refresh every 30 seconds
setInterval(() => {
    if (currentProjectId) loadDashboard(currentProjectId);
}, 30000);

// Initial load
loadProjects();
</script>
</body>
</html>`;
}
