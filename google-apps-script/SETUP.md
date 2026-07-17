# Fase 2 — Sync automático a Google Drive

## Qué obtienés

- **Google Sheet** con pestañas: `sessions`, `weights`, `trails`, `meta`
- **Carpeta en Drive** `Entrenamiento Esteban` con:
  - `entrenamiento-ai.json`
  - `entrenamiento-log.md` ← ideal para AI
  - `entrenamiento-log.jsonl`
- Sync desde la app con un botón (o automático al guardar)

---

## Paso 1 — Crear el Google Sheet

1. Andá a [sheets.google.com](https://sheets.google.com)
2. **Hoja de cálculo en blanco**
3. Nombrala: `Entrenamiento Esteban`

---

## Paso 2 — Apps Script

1. En el Sheet: **Extensiones → Apps Script**
2. Borrá el contenido de `Code.gs`
3. Copiá y pegá todo el archivo `Code.gs` de esta carpeta
4. **Cambiá la línea 11:**
   ```javascript
   const SYNC_SECRET = 'CAMBIAR_ESTE_TOKEN_123';
   ```
   Por un token secreto tuyo, por ejemplo:
   ```javascript
   const SYNC_SECRET = 'esteban-uvita-2026-xK9mP';
   ```
   (El mismo token lo pondrás en la app en ⚙️)

5. Guardá el proyecto (Ctrl+S)

---

## Paso 3 — Inicializar hojas

1. En Apps Script, seleccioná la función **`initializeSheets`**
2. Clic **Ejecutar** ▶
3. Autorizá permisos (Sheet + Drive) la primera vez
4. Verificá que en el Sheet aparecieron las pestañas: `meta`, `sessions`, `weights`, `trails`

---

## Paso 4 — Publicar como App web

1. **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo**
4. Quién tiene acceso: **Cualquier persona**
5. **Implementar**
6. **Copiá la URL** (termina en `/exec`)

Ejemplo:
```
https://script.google.com/macros/s/AKfycb....../exec
```

---

## Paso 5 — Configurar la app

1. Abrí tu app de entrenamiento
2. **⚙️ → Sincronización en la nube**
3. Pegá la **URL de Apps Script**
4. Pegá el **mismo token** que pusiste en `SYNC_SECRET`
5. Tocá **☁️ Sincronizar ahora**

Si funciona, verás:
- Datos en el Google Sheet
- Archivos en Drive → carpeta `Entrenamiento Esteban`

---

## Paso 6 — Auto-sync (opcional)

Activá **Sincronizar al guardar** en ⚙️. Cada vez que guardás pesos, trail o completás una sesión, se sube solo (con 2 seg de delay).

---

## Restaurar en otro dispositivo

1. ⚙️ → Configurá URL y token
2. Tocá **⬇️ Descargar desde nube**
3. Se importan todos los datos desde `entrenamiento-ai.json` en Drive

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `unauthorized` | Token distinto en app vs Apps Script |
| No pasa nada al sync | Verificá que la URL termine en `/exec` |
| Permisos | Re-ejecutá `initializeSheets` y aceptá permisos de Drive |
| iPhone no confirma sync | Normal; revisá el Sheet para ver si llegaron datos |
