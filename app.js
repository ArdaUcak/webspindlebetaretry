import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse as parseUrl } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_TITLE = 'STS - Spindle Takip Sistemi (Web)';
const USERNAME = 'BAKIM';
const PASSWORD = 'MAXIME';
const DATE_FORMATTER = new Intl.DateTimeFormat('tr-TR');

const spindleHeaders = [
  'id',
  'Referans ID',
  'Çalışma Saati',
  'Takılı Olduğu Makine',
  'Makinaya Takıldığı Tarih',
  'Son Güncelleme'
];

const yedekHeaders = [
  'id',
  'Referans ID',
  'Açıklama',
  'Tamirde mi',
  'Bakıma Gönderilme',
  'Geri Dönme',
  'Söküldüğü Makine',
  'Sökülme Tarihi',
  'Son Güncelleme'
];

function today() {
  return DATE_FORMATTER.format(new Date());
}

function ensureCsv(filePath, headers) {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${headers.join(',')}\n`, 'utf-8');
  }
}

function parseCsv(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.trim() ? raw.trim().split(/\r?\n/) : [];
  if (!lines.length) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function stringifyCsv(headers, rows) {
  const body = rows
    .map((row) => headers.map((h) => (row[h] ?? '').replace(/,/g, ' ')).join(','))
    .join('\n');
  return `${headers.join(',')}\n${body}\n`;
}

function nextId(rows) {
  if (!rows.length) return 1;
  return Math.max(...rows.map((r) => Number(r.id))) + 1;
}

class DataManager {
  constructor(filename, headers) {
    this.filepath = path.join(__dirname, filename);
    this.headers = headers;
    ensureCsv(this.filepath, headers);
  }

  all() {
    return parseCsv(this.filepath);
  }

  save(rows) {
    writeFileSync(this.filepath, stringifyCsv(this.headers, rows), 'utf-8');
  }

  add(data) {
    const rows = this.all();
    data.id = String(nextId(rows));
    rows.push(data);
    this.save(rows);
    return data.id;
  }

  update(id, payload) {
    const rows = this.all();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    rows[idx] = { ...rows[idx], ...payload };
    this.save(rows);
    return true;
  }

  delete(id) {
    const rows = this.all();
    const filtered = rows.filter((r) => r.id !== id);
    if (filtered.length === rows.length) return false;
    this.save(filtered);
    return true;
  }
}

const spindleManager = new DataManager('spindle_data.csv', spindleHeaders);
const yedekManager = new DataManager('yedek_data.csv', yedekHeaders);

const sessions = new Map();

function renderLayout(content, options = {}) {
  const { title = APP_TITLE, username, message } = options;
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
  <div class="container-fluid">
    <a class="navbar-brand" href="/spindles">STS</a>
    ${username ? `
    <div>
      <a class="btn btn-outline-light btn-sm me-2" href="/spindles">Spindle</a>
      <a class="btn btn-outline-light btn-sm me-2" href="/yedeks">Yedek</a>
      <a class="btn btn-outline-light btn-sm me-2" href="/export">Excel'e Aktar</a>
      <a class="btn btn-light btn-sm text-primary" href="/logout">Çıkış</a>
    </div>` : ''}
  </div>
</nav>
<div class="container mb-4">
  ${message ? `<div class="alert alert-${escapeHtml(message.type)} alert-dismissible fade show" role="alert">${escapeHtml(message.text)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>` : ''}
  ${content}
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

function renderLogin(message) {
  const content = `
<div class="row justify-content-center">
  <div class="col-md-4">
    <div class="card shadow-sm">
      <div class="card-header text-center"><h5 class="mb-0">Giriş Ekranı</h5></div>
      <div class="card-body">
        <form method="post" action="/login">
          <div class="mb-3"><label class="form-label">Kullanıcı Adı</label><input class="form-control" name="username" autofocus></div>
          <div class="mb-3"><label class="form-label">Şifre</label><input class="form-control" type="password" name="password"></div>
          <button class="btn btn-primary w-100" type="submit">Giriş</button>
        </form>
      </div>
      <div class="card-footer text-end small text-muted">Created by: Arda UÇAK</div>
    </div>
  </div>
</div>`;
  return renderLayout(content, { message });
}

function renderSpindles(rows, query) {
  const tableRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row['Referans ID'])}</td>
      <td>${escapeHtml(row['Çalışma Saati'])}</td>
      <td>${escapeHtml(row['Takılı Olduğu Makine'])}</td>
      <td>${escapeHtml(row['Makinaya Takıldığı Tarih'])}</td>
      <td>${escapeHtml(row['Son Güncelleme'])}</td>
      <td class="text-end">
        <a class="btn btn-sm btn-outline-primary" href="/spindles/${encodeURIComponent(row.id)}/edit">Düzenle</a>
        <form class="d-inline" method="post" action="/spindles/${encodeURIComponent(row.id)}/delete" onsubmit="return confirm('Silmek istediğinize emin misiniz?');">
          <button class="btn btn-sm btn-outline-danger" type="submit">Sil</button>
        </form>
      </td>
    </tr>`).join('\n');

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <h4>Spindle Takip Sistemi</h4>
  <a class="btn btn-success" href="/spindles/add">Spindle Ekle</a>
</div>
<form class="row gy-2 gx-2 align-items-center mb-3" method="get" action="/spindles">
  <div class="col-auto"><label class="col-form-label">Referans ID ile Ara:</label></div>
  <div class="col-auto"><input class="form-control" name="q" value="${escapeHtml(query ?? '')}"></div>
  <div class="col-auto">
    <button class="btn btn-primary" type="submit">Ara</button>
    <a class="btn btn-secondary" href="/spindles">Temizle</a>
  </div>
</form>
<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive">
  <table class="table table-striped table-hover mb-0">
    <thead class="table-light"><tr><th>ID</th><th>Referans ID</th><th>Çalışma Saati</th><th>Takılı Olduğu Makine</th><th>Makinaya Takıldığı Tarih</th><th>Son Güncelleme</th><th class="text-end">İşlemler</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="7" class="text-center py-3">Kayıt bulunamadı.</td></tr>'}</tbody>
  </table>
</div></div></div>`;
  return renderLayout(content, { username: true });
}

function renderSpindleForm(mode, record) {
  const isAdd = mode === 'add';
  const content = `
<h4>${isAdd ? 'Spindle Ekle' : 'Spindle Düzenle'}</h4>
<div class="card shadow-sm mt-3"><div class="card-body">
  <form method="post">
    <div class="mb-3"><label class="form-label">Referans ID</label><input required class="form-control" name="Referans ID" value="${escapeHtml(record?.['Referans ID'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Çalışma Saati</label><input class="form-control" name="Çalışma Saati" value="${escapeHtml(record?.['Çalışma Saati'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Takılı Olduğu Makine</label><input class="form-control" name="Takılı Olduğu Makine" value="${escapeHtml(record?.['Takılı Olduğu Makine'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Makinaya Takıldığı Tarih</label><input class="form-control" name="Makinaya Takıldığı Tarih" placeholder="gg-aa-yyyy" value="${escapeHtml(record?.['Makinaya Takıldığı Tarih'] ?? today())}"></div>
    <button class="btn btn-primary" type="submit">Kaydet</button>
    <a class="btn btn-secondary" href="/spindles">İptal</a>
  </form>
</div></div>`;
  return renderLayout(content, { username: true });
}

function renderYedeks(rows, query) {
  const tableRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row['Referans ID'])}</td>
      <td>${escapeHtml(row['Açıklama'])}</td>
      <td>${escapeHtml(row['Tamirde mi'])}</td>
      <td>${escapeHtml(row['Bakıma Gönderilme'])}</td>
      <td>${escapeHtml(row['Geri Dönme'])}</td>
      <td>${escapeHtml(row['Söküldüğü Makine'])}</td>
      <td>${escapeHtml(row['Sökülme Tarihi'])}</td>
      <td>${escapeHtml(row['Son Güncelleme'])}</td>
      <td class="text-end">
        <a class="btn btn-sm btn-outline-primary" href="/yedeks/${encodeURIComponent(row.id)}/edit">Düzenle</a>
        <form class="d-inline" method="post" action="/yedeks/${encodeURIComponent(row.id)}/delete" onsubmit="return confirm('Silmek istediğinize emin misiniz?');">
          <button class="btn btn-sm btn-outline-danger" type="submit">Sil</button>
        </form>
      </td>
    </tr>`).join('\n');

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <h4>Yedek Takip Sistemi</h4>
  <a class="btn btn-success" href="/yedeks/add">Yedek Ekle</a>
</div>
<form class="row gy-2 gx-2 align-items-center mb-3" method="get" action="/yedeks">
  <div class="col-auto"><label class="col-form-label">Referans ID ile Ara:</label></div>
  <div class="col-auto"><input class="form-control" name="q" value="${escapeHtml(query ?? '')}"></div>
  <div class="col-auto">
    <button class="btn btn-primary" type="submit">Ara</button>
    <a class="btn btn-secondary" href="/yedeks">Temizle</a>
  </div>
</form>
<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive">
  <table class="table table-striped table-hover mb-0">
    <thead class="table-light"><tr><th>ID</th><th>Referans ID</th><th>Açıklama</th><th>Tamirde mi</th><th>Bakıma Gönderilme</th><th>Geri Dönme</th><th>Söküldüğü Makine</th><th>Sökülme Tarihi</th><th>Son Güncelleme</th><th class="text-end">İşlemler</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="10" class="text-center py-3">Kayıt bulunamadı.</td></tr>'}</tbody>
  </table>
</div></div></div>`;
  return renderLayout(content, { username: true });
}

function renderYedekForm(mode, record) {
  const isAdd = mode === 'add';
  const currentTamirde = record?.['Tamirde mi'] ?? 'Hayır';
  const content = `
<h4>${isAdd ? 'Yedek Ekle' : 'Yedek Düzenle'}</h4>
<div class="card shadow-sm mt-3"><div class="card-body">
  <form method="post">
    <div class="mb-3"><label class="form-label">Referans ID</label><input required class="form-control" name="Referans ID" value="${escapeHtml(record?.['Referans ID'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Açıklama</label><input class="form-control" name="Açıklama" value="${escapeHtml(record?.['Açıklama'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Tamirde mi</label>
      <select class="form-select" name="Tamirde mi">
        <option value="Evet" ${currentTamirde === 'Evet' ? 'selected' : ''}>Evet</option>
        <option value="Hayır" ${currentTamirde === 'Hayır' ? 'selected' : ''}>Hayır</option>
      </select>
    </div>
    <div class="mb-3"><label class="form-label">Bakıma Gönderilme</label><input class="form-control" name="Bakıma Gönderilme" placeholder="gg-aa-yyyy" value="${escapeHtml(record?.['Bakıma Gönderilme'] ?? today())}"></div>
    <div class="mb-3"><label class="form-label">Geri Dönme</label><input class="form-control" name="Geri Dönme" placeholder="gg-aa-yyyy" value="${escapeHtml(record?.['Geri Dönme'] ?? today())}"></div>
    <div class="mb-3"><label class="form-label">Söküldüğü Makine</label><input class="form-control" name="Söküldüğü Makine" value="${escapeHtml(record?.['Söküldüğü Makine'] ?? '')}"></div>
    <div class="mb-3"><label class="form-label">Sökülme Tarihi</label><input class="form-control" name="Sökülme Tarihi" placeholder="gg-aa-yyyy" value="${escapeHtml(record?.['Sökülme Tarihi'] ?? today())}"></div>
    <button class="btn btn-primary" type="submit">Kaydet</button>
    <a class="btn btn-secondary" href="/yedeks">İptal</a>
  </form>
</div></div>`;
  return renderLayout(content, { username: true });
}

function parseFormData(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const obj = {};
      for (const [key, value] of params.entries()) {
        obj[key] = value;
      }
      resolve(obj);
    });
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (!key) return;
    list[key] = decodeURIComponent(parts.join('='));
  });
  return list;
}

function requireAuth(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies['sid'];
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }
  res.writeHead(302, { Location: '/login' });
  res.end();
  return null;
}

function handleLogin(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderLogin());
    return;
  }

  parseFormData(req).then((data) => {
    if (data.username === USERNAME && data.password === PASSWORD) {
      const sid = crypto.randomBytes(16).toString('hex');
      sessions.set(sid, { username: USERNAME });
      res.writeHead(302, { 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/`, Location: '/spindles' });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLogin({ type: 'danger', text: 'Kullanıcı adı veya şifre hatalı.' }));
    }
  });
}

function handleLogout(res) {
  res.writeHead(302, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' , Location: '/login' });
  res.end();
}

function handleSpindles(req, res, user) {
  const url = parseUrl(req.url, true);
  const q = url.query.q?.toString().trim();
  const rows = spindleManager.all().filter((row) => !q || row['Referans ID'].toLowerCase().includes(q.toLowerCase()));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderSpindles(rows, q));
}

function handleSpindleAdd(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderSpindleForm('add'));
    return;
  }

  parseFormData(req).then((data) => {
    if (!data['Referans ID']) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderSpindleForm('add'));
      return;
    }
    const record = {
      'Referans ID': data['Referans ID'],
      'Çalışma Saati': data['Çalışma Saati'] || '',
      'Takılı Olduğu Makine': data['Takılı Olduğu Makine'] || '',
      'Makinaya Takıldığı Tarih': data['Makinaya Takıldığı Tarih'] || today(),
      'Son Güncelleme': today()
    };
    spindleManager.add(record);
    res.writeHead(302, { Location: '/spindles' });
    res.end();
  });
}

function handleSpindleEdit(req, res, id) {
  const rows = spindleManager.all();
  const record = rows.find((r) => r.id === id);
  if (!record) {
    res.writeHead(302, { Location: '/spindles' });
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderSpindleForm('edit', record));
    return;
  }

  parseFormData(req).then((data) => {
    if (!data['Referans ID']) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderSpindleForm('edit', record));
      return;
    }
    const payload = {
      'Referans ID': data['Referans ID'],
      'Çalışma Saati': data['Çalışma Saati'] || '',
      'Takılı Olduğu Makine': data['Takılı Olduğu Makine'] || '',
      'Makinaya Takıldığı Tarih': data['Makinaya Takıldığı Tarih'] || '',
      'Son Güncelleme': today()
    };
    spindleManager.update(id, payload);
    res.writeHead(302, { Location: '/spindles' });
    res.end();
  });
}

function handleSpindleDelete(res, id) {
  spindleManager.delete(id);
  res.writeHead(302, { Location: '/spindles' });
  res.end();
}

function handleYedeks(req, res) {
  const url = parseUrl(req.url, true);
  const q = url.query.q?.toString().trim();
  const rows = yedekManager.all().filter((row) => !q || row['Referans ID'].toLowerCase().includes(q.toLowerCase()));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderYedeks(rows, q));
}

function handleYedekAdd(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderYedekForm('add'));
    return;
  }

  parseFormData(req).then((data) => {
    if (!data['Referans ID']) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderYedekForm('add'));
      return;
    }
    const now = today();
    const record = {
      'Referans ID': data['Referans ID'],
      'Açıklama': data['Açıklama'] || '',
      'Tamirde mi': data['Tamirde mi'] || 'Hayır',
      'Bakıma Gönderilme': data['Bakıma Gönderilme'] || now,
      'Geri Dönme': data['Geri Dönme'] || now,
      'Söküldüğü Makine': data['Söküldüğü Makine'] || '',
      'Sökülme Tarihi': data['Sökülme Tarihi'] || now,
      'Son Güncelleme': now
    };
    yedekManager.add(record);
    res.writeHead(302, { Location: '/yedeks' });
    res.end();
  });
}

function handleYedekEdit(req, res, id) {
  const rows = yedekManager.all();
  const record = rows.find((r) => r.id === id);
  if (!record) {
    res.writeHead(302, { Location: '/yedeks' });
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderYedekForm('edit', record));
    return;
  }

  parseFormData(req).then((data) => {
    if (!data['Referans ID']) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderYedekForm('edit', record));
      return;
    }
    const now = today();
    const payload = {
      'Referans ID': data['Referans ID'],
      'Açıklama': data['Açıklama'] || '',
      'Tamirde mi': data['Tamirde mi'] || 'Hayır',
      'Bakıma Gönderilme': data['Bakıma Gönderilme'] || '',
      'Geri Dönme': data['Geri Dönme'] || '',
      'Söküldüğü Makine': data['Söküldüğü Makine'] || '',
      'Sökülme Tarihi': data['Sökülme Tarihi'] || '',
      'Son Güncelleme': now
    };
    yedekManager.update(id, payload);
    res.writeHead(302, { Location: '/yedeks' });
    res.end();
  });
}

function handleYedekDelete(res, id) {
  yedekManager.delete(id);
  res.writeHead(302, { Location: '/yedeks' });
  res.end();
}

function handleExport(res) {
  const spindleRows = spindleManager.all();
  const yedekRows = yedekManager.all();
  let csv = '--- Spindle Takip ---\nReferans ID,Saat,Takılı Olduğu Makine,Takıldığı Tarih,Son Güncelleme\n';
  csv += spindleRows.map((r) => [
    r['Referans ID'],
    r['Çalışma Saati'],
    r['Takılı Olduğu Makine'],
    r['Makinaya Takıldığı Tarih'],
    r['Son Güncelleme']
  ].map((v) => v?.replace(/,/g, ' ') || '').join(',')).join('\n');
  csv += '\n\n--- Yedek Takip ---\nReferans ID,Açıklama,Tamirde,Gönderildi,Dönen,Söküldüğü Makine,Sökülme Tarihi,Son Güncelleme\n';
  csv += yedekRows.map((r) => [
    r['Referans ID'],
    r['Açıklama'],
    r['Tamirde mi'],
    r['Bakıma Gönderilme'],
    r['Geri Dönme'],
    r['Söküldüğü Makine'],
    r['Sökülme Tarihi'],
    r['Son Güncelleme']
  ].map((v) => v?.replace(/,/g, ' ') || '').join(',')).join('\n');

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="takip_export.csv"'
  });
  res.end(csv);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

const server = http.createServer((req, res) => {
  const { pathname } = parseUrl(req.url, true);

  if (pathname === '/login') return handleLogin(req, res);
  if (pathname === '/logout') return handleLogout(res);

  const session = requireAuth(req, res);
  if (!session) return;

  if (pathname === '/' || pathname === '/spindles') {
    return handleSpindles(req, res, session);
  }

  if (pathname === '/spindles/add') {
    return handleSpindleAdd(req, res);
  }

  const spindleEditMatch = pathname.match(/^\/spindles\/(\d+)\/edit$/);
  if (spindleEditMatch) {
    return handleSpindleEdit(req, res, spindleEditMatch[1]);
  }

  const spindleDeleteMatch = pathname.match(/^\/spindles\/(\d+)\/delete$/);
  if (spindleDeleteMatch && req.method === 'POST') {
    return handleSpindleDelete(res, spindleDeleteMatch[1]);
  }

  if (pathname === '/yedeks') {
    return handleYedeks(req, res);
  }

  if (pathname === '/yedeks/add') {
    return handleYedekAdd(req, res);
  }

  const yedekEditMatch = pathname.match(/^\/yedeks\/(\d+)\/edit$/);
  if (yedekEditMatch) {
    return handleYedekEdit(req, res, yedekEditMatch[1]);
  }

  const yedekDeleteMatch = pathname.match(/^\/yedeks\/(\d+)\/delete$/);
  if (yedekDeleteMatch && req.method === 'POST') {
    return handleYedekDelete(res, yedekDeleteMatch[1]);
  }

  if (pathname === '/export') {
    return handleExport(res);
  }

  return notFound(res);
});

const PORT = process.env.PORT || 5000;
const BIND_HOST = process.env.HOST || '0.0.0.0';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function listLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addrs = [];
  Object.values(interfaces).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        addrs.push(entry.address);
      }
    });
  });
  return addrs;
}

server.listen(PORT, BIND_HOST, () => {
  const lanIps = listLanAddresses();
  console.log(`Server running at http://${BIND_HOST}:${PORT}`);
  if (lanIps.length) {
    lanIps.forEach((ip) => {
      console.log(`LAN:   http://${ip}:${PORT}`);
    });
  } else {
    console.log('No LAN IPv4 detected; check network adapter status.');
  }
});
