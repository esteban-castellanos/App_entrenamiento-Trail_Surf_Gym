/**
 * Entrenamiento Esteban — Sync a Google Sheet + Drive
 *
 * 1. Creá un Google Sheet vacío
 * 2. Extensiones → Apps Script → pegá este archivo
 * 3. Cambiá SYNC_SECRET abajo (mismo token en la app)
 * 4. Ejecutá initializeSheets() una vez
 * 5. Implementar → Nueva implementación → App web → Acceso: Cualquier persona
 */

const SYNC_SECRET = 'CAMBIAR_ESTE_TOKEN_123'; // ← mismo valor en ⚙️ de la app
const DRIVE_FOLDER_NAME = 'Entrenamiento Esteban';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SYNC_SECRET) {
      return jsonOut({ ok: false, error: 'unauthorized' });
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    writeMeta_(ss, data);
    writeSessions_(ss, data.sessions || []);
    writeWeights_(ss, data.sessions || []);
    writeTrails_(ss, data.sessions || []);
    writeDriveFiles_(data);
    return jsonOut({
      ok: true,
      synced_at: new Date().toISOString(),
      sessions: (data.sessions || []).length,
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.secret !== SYNC_SECRET) {
      return jsonOut({ ok: false, error: 'unauthorized' });
    }
    if (p.action === 'pull') {
      const folder = getOrCreateFolder_();
      const files = folder.getFilesByName('entrenamiento-ai.json');
      if (!files.hasNext()) {
        return jsonOut({ ok: false, error: 'no_data' });
      }
      const content = JSON.parse(files.next().getBlob().getDataAsString());
      return jsonOut({ ok: true, data: content });
    }
    return jsonOut({ ok: true, service: 'entrenamiento-sync', version: 2 });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** Ejecutar UNA vez desde el editor de Apps Script */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, 'meta', ['clave', 'valor']);
  ensureSheet_(ss, 'sessions', [
    'fecha', 'dia', 'semana', 'bloque', 'plan_tipo', 'plan_label',
    'surf', 'gym', 'trail', 'movilidad', 'descanso', 'notas_gym', 'notas_trail', 'notas_otras'
  ]);
  ensureSheet_(ss, 'weights', ['fecha', 'ejercicio_key', 'ejercicio', 'kg']);
  ensureSheet_(ss, 'trails', [
    'fecha', 'ruta', 'km_plan', 'km_gps', 'duracion_seg', 'ritmo', 'tiempo_log', 'notas'
  ]);
  SpreadsheetApp.flush();
  Logger.log('Hojas listas: meta, sessions, weights, trails');
}

// --- Escritura Sheet ---

function writeMeta_(ss, data) {
  const sh = ss.getSheetByName('meta');
  const rows = [
    ['ultima_sync', data.exported_at || new Date().toISOString()],
    ['atleta', (data.athlete && data.athlete.name) || 'Esteban'],
    ['programa_inicio', data.program_start || ''],
    ['sesiones_total', String((data.summary && data.summary.sessions_logged) || 0)],
    ['surf_completados', String((data.summary && data.summary.surf_completed) || 0)],
    ['gym_completados', String((data.summary && data.summary.gym_completed) || 0)],
    ['trail_completados', String((data.summary && data.summary.trail_completed) || 0)],
  ];
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([['clave', 'valor']]);
  sh.getRange(2, 1, rows.length + 1, 2).setValues(rows);
}

function writeSessions_(ss, sessions) {
  const sh = ss.getSheetByName('sessions');
  const header = [
    'fecha', 'dia', 'semana', 'bloque', 'plan_tipo', 'plan_label',
    'surf', 'gym', 'trail', 'movilidad', 'descanso', 'notas_gym', 'notas_trail', 'notas_otras'
  ];
  const rows = sessions.map(function(s) {
    const a = s.activities || {};
    return [
      s.date, s.day, s.week, s.block,
      (s.planned && s.planned.type) || '',
      (s.planned && s.planned.label) || '',
      a.surf && a.surf.completed ? 'SI' : '',
      a.gym && a.gym.completed ? 'SI' : '',
      a.trail && a.trail.completed ? 'SI' : '',
      a.mob && a.mob.completed ? 'SI' : '',
      a.rest && a.rest.completed ? 'SI' : '',
      (a.gym && a.gym.notes) || '',
      (a.trail && a.trail.notes) || '',
      (a.mob && a.mob.notes) || (a.rest && a.rest.notes) || '',
    ];
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function writeWeights_(ss, sessions) {
  const sh = ss.getSheetByName('weights');
  const header = ['fecha', 'ejercicio_key', 'ejercicio', 'kg'];
  const rows = [];
  sessions.forEach(function(s) {
    const gym = s.activities && s.activities.gym;
    if (!gym || !gym.weights_kg) return;
    const labeled = gym.weights_labeled || {};
    Object.keys(gym.weights_kg).forEach(function(key) {
      rows.push([s.date, key, labeled[key] || key, gym.weights_kg[key]]);
    });
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function writeTrails_(ss, sessions) {
  const sh = ss.getSheetByName('trails');
  const header = ['fecha', 'ruta', 'km_plan', 'km_gps', 'duracion_seg', 'ritmo', 'tiempo_log', 'notas'];
  const rows = [];
  sessions.forEach(function(s) {
    const t = s.activities && s.activities.trail;
    if (!t) return;
    const gps = t.gps || {};
    rows.push([
      s.date,
      t.route || '',
      t.planned_km != null ? t.planned_km : '',
      gps.km != null ? gps.km : '',
      gps.duration_sec != null ? gps.duration_sec : '',
      gps.pace_min_km || '',
      t.time_logged || '',
      t.notes || '',
    ]);
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

// --- Google Drive ---

function writeDriveFiles_(data) {
  const folder = getOrCreateFolder_();
  upsertFile_(folder, 'entrenamiento-ai.json', JSON.stringify(data, null, 2), 'application/json');
  if (data.markdown) {
    upsertFile_(folder, 'entrenamiento-log.md', data.markdown, 'text/markdown');
  }
  if (data.jsonl) {
    upsertFile_(folder, 'entrenamiento-log.jsonl', data.jsonl, 'text/plain');
  }
}

function getOrCreateFolder_() {
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function upsertFile_(folder, name, content, mime) {
  const it = folder.getFilesByName(name);
  const blob = Utilities.newBlob(content, mime, name);
  if (it.hasNext()) {
    it.next().setContent(blob.getDataAsString());
  } else {
    folder.createFile(blob);
  }
}

// --- Helpers ---

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
