# Lógica e inteligencia de sesiones — App Entrenamiento (Esteban)

> **Propósito de este documento:** explicar cómo la app genera prescripciones de gym y trail, progresa cargas, detecta estancamiento y persiste datos — para revisión por Claude u otro asistente en busca de errores, inconsistencias y mejoras.
>
> **Fuente de verdad en código:** `www/index.html` (single-file app, ~3100 líneas).
>
> **Generado para revisión:** 2026-08-11

---

## 1. Resumen ejecutivo

La app es una PWA/Capacitor para un atleta en **Uvita, Costa Rica** que combina:

| Disciplina | Frecuencia | Cuándo |
|------------|------------|--------|
| Surf | Casi diario (mañana) | Antes de gym/trail |
| Gym | Lunes, Miércoles, Viernes | Push+Core / Piernas+Olímpico / Pull+Hombros |
| Trail | Martes (corto), Sábado (largo) | Con prescripción por zonas de FC |
| Movilidad | Domingo | Stretching |
| Descanso activo | Jueves | Surf opcional |

**Dos motores de prescripción distintos:**

1. **Gym (`dynamicBlocks` en `openSheet`)** — ejercicios, series/reps y accesorios rotativos según semana del programa y bloque de periodización.
2. **Trail (`getTrailSession`)** — distancia, desnivel, zonas de FC, duración y reglas según día (martes/sábado), tipo de semana (carga/deload) y bloque.

**Eje temporal único:** `programStartDate` → `getWeekNumber(date)` → todo lo demás (bloque, prescripción gym, prescripción trail, rotación accesorios).

---

## 2. Eje temporal y semanas

### 2.1 Fecha de inicio del programa

```javascript
const PROGRAM_START_FALLBACK = '2026-07-01'; // respaldo en código
// Prioridad: localStorage 'esteban_program_start' > fallback
// Editable manualmente en ⚙️ → "Inicio del programa"
```

- Semana 0 = primera semana desde `programStartDate` (día 0–6).
- `getWeekNumber(date) = floor((date - programStartDate) / 7 días)`, mínimo 0.
- **Semana mostrada al usuario** = `weekNum + 1` (1-indexed en UI).

### 2.2 Bloques de periodización (gym + trail comparten bloque)

```javascript
function getBlock(weekNum) {
  return Math.floor(weekNum / 4) % 3; // cicla 0→1→2→0… cada 12 semanas
}
// 0 = Adaptación, 1 = Hipertrofia, 2 = Fuerza
```

| Semanas del programa (weekNum) | Bloque | Etiqueta |
|-------------------------------|--------|----------|
| 0–3 (Semanas 1–4) | 0 | Adaptación |
| 4–7 (Semanas 5–8) | 1 | Hipertrofia |
| 8–11 (Semanas 9–12) | 2 | Fuerza |
| 12–15 | 0 | Adaptación (repite ciclo) |
| … | … | … |

### 2.3 Tipo de semana (trail): carga vs deload

```javascript
function getWeekType(weekNum) {
  return (weekNum % 4 === 3) ? 'deload' : 'carga';
}
```

- Semanas 4, 8, 12… del bloque (weekNum 3, 7, 11…) = **deload** (4ª semana de cada bloque de 4).
- Semanas 1–3 de cada bloque = **carga**.

---

## 3. Semana tipo (WEEK_PLAN) — plantilla estática

`WEEK_PLAN[dow]` define qué hay cada día (`dow`: 0=Dom … 6=Sáb):

| Día | type | label | surf |
|-----|------|-------|------|
| Lun (1) | gym | Push + Core | sí |
| Mar (2) | trail | Trail corto | sí |
| Mié (3) | gym | Piernas + Olímpico | sí |
| Jue (4) | rest | Descanso | sí |
| Vie (5) | gym | Pull + Hombros | sí |
| Sáb (6) | trail | Trail largo | sí |
| Dom (0) | mob | Movilidad | no |

**Importante:** `WEEK_PLAN` incluye bloques gym detallados con series **fijas** (template). Esos bloques **NO se usan para renderizar** la UI en vivo. La UI usa `dynamicBlocks` (sección 4). `WEEK_PLAN` solo alimenta `getDayPlan()` para el calendario y metadatos (`type`, `label`, `surf`).

---

## 4. Motor GYM — `dynamicBlocks` (lo que ve el usuario)

Al abrir un día de gym en `openSheet()`, se construye `dynamicBlocks` según `dow` y `weekNum = getWeekNumber(date)`.

### 4.1 Lunes — Push + Core (`dow === 1`)

| Bloque | Ejercicios | Keys de peso |
|--------|-----------|--------------|
| Entrada en calor | Trote, rotaciones, flexiones, press vacía | — |
| Olímpico | Push jerk / Split jerk | `pushjerk` |
| Pliométrico | Plyo push-ups, med ball chest pass, **medicine ball overhead throw** | — |
| Fuerza | Bench DB, dips, military DB, accesorio push | `bench`, `dips`, `military_db`, acc |
| Core | Pallof, ab wheel, plancha | — |
| Movilidad | Estiramientos | — |

### 4.2 Miércoles — Piernas + Olímpico (`dow === 3`)

| Bloque | Ejercicios | Keys de peso |
|--------|-----------|--------------|
| Olímpico | Snatch, Clean & jerk | `snatch`, `cleanjerk` |
| Pliométrico | Box jumps, single leg hops, broad jumps | — |
| Fuerza | Front squat, RDL, acc legs, acc legs_vol, gemelos | `squat`, `deadlift`, acc keys, `calves` |
| Core + movilidad | … | — |

**Accesorios rotativos miércoles:**
- `legs`: Zancadas ↔ Step-ups (cada 8 semanas)
- `legs_vol`: **Prensa de piernas ↔ Hack squat** (cada 8 semanas) — keys `acc_legs_b`

### 4.3 Viernes — Pull + Hombros (`dow === 5`)

| Bloque | Ejercicios | Keys de peso |
|--------|-----------|--------------|
| Olímpico | Clean & jerk | `cleanjerk` |
| Fuerza | Pullups, remo acc, **military bar**, facepull | `pullups`, acc, `military_bar`, `facepull` |

**Claves military separadas (Bug fix aplicado):**
- Lunes → `military_db` (mancuernas)
- Viernes → `military_bar` (barra)
- `suggestWeight()` tiene fallback a clave legacy `military` si no hay datos nuevos.

### 4.4 Prescripción de series/reps — `getPrescription(exKey, weekNum)`

Usa `block = getBlock(weekNum)` (0, 1 o 2) para indexar tabla:

| exKey | Bloque 0 (Adaptación) | Bloque 1 (Hipertrofia) | Bloque 2 (Fuerza) |
|-------|----------------------|------------------------|-------------------|
| snatch | 5×3 técnico | 5×3 80% | 6×2 85–90% |
| cleanjerk | 4×3 técnico | 4×3 80% | 5×2 85–90% |
| pushjerk | 4×3 técnico | 4×3 80% | 5×2 85% |
| frontsquat | 4×5 | 5×4 | 5×3 pesado |
| deadlift | 3×8 | 4×6 | 4×4 |
| pullups | 4×6–8 | 5×5 | 5×3–4 (+ peso) |
| military | 4×8 | 4×6 | 5×4 |
| bench | 4×8–10 | 4×8 | 4×5–6 |
| dips | 3×10–12 | 4×8 | 4×6 (+ peso) |
| acc_legs_a/b, acc_pull_a, acc_push_a | … | … | … |
| calves | 4×15–20 | 4×15–20 | 4×12–15 |
| facepull | 3×15 | 3×15 | 3×12 |
| core | 3×12 | 3×12 | 3×10 |

### 4.5 Rotación de accesorios — cada 8 semanas

```javascript
getAccessorySet(weekNum) = floor(weekNum / 8) % 2  // alterna 0 ↔ 1
```

| type | Set 0 | Set 1 |
|------|-------|-------|
| legs | Zancadas caminando | Step-ups con mancuernas |
| pull | Remo con barra | Remo en polea sentado |
| push_acc | Elevaciones laterales | Pájaros (rear delt) |
| legs_vol | Prensa de piernas | Hack squat |

### 4.6 Descansos entre series

| Bloque | Segundos |
|--------|----------|
| Olímpico | 180 |
| Pliométrico | 120 |
| Fuerza (lifts pesados*) | 180 |
| Fuerza (resto) | 90 |
| Core | 60 |

*Pesados: squat, deadlift, bench, military_db, military_bar, pullups, dips, snatch, cleanjerk, pushjerk

### 4.7 Duración estimada sesión gym

`SESSION_DURATION`: Lun 70 min, Mié 80 min, Vie 75 min

---

## 5. Inteligencia de pesos — `suggestWeight()` y estancamiento

### 5.1 Sugerencia de peso

```javascript
suggestWeight(exKey):
  1. Busca en savedData los últimos 4 "slots" semanales (±3 días alrededor de cada semana hacia atrás)
  2. Toma el último peso registrado cronológicamente
  3. Si hay ≥3 registros y los últimos 3 son iguales → stagnated: true, sugiere mismo peso
  4. Si no estancado → sugiere último + 2.5 kg
  5. Fallbacks: pushjerk/snatch/cleanjerk → clave legacy 'olympic'; military_db/bar → 'military'
```

**Progresión implícita:** +2.5 kg/semana si no hay estancamiento.

### 5.2 Detección de estancamiento — `checkStagnation(dow)`

Lifts monitoreados por día:

| Día | Lifts |
|-----|-------|
| Lunes | pushjerk, bench, military_db |
| Miércoles | snatch, cleanjerk, squat, deadlift |
| Viernes | cleanjerk, pullups, military_bar |

Si `suggestWeight` devuelve `stagnated: true`, muestra alerta amarilla en la sesión.

### 5.3 Registro de pesos

- Tab "Registrar pesos" → inputs por ejercicio con key (solo bloques Olímpico + Fuerza).
- Botón "Guardar sesión ✓" → `saveDay(key, exKeys)` → `savedData[dateKey].weights`.
- **Bug corregido:** el onclick del botón usaba `JSON.stringify` con comillas dobles dentro de atributo HTML, rompiendo el guardado. Fix: comillas simples en el array.

---

## 6. Motor TRAIL — `getTrailSession(dow, weekNum)`

### 6.1 Datos del atleta

```javascript
HR_MAX = 184
HR_ZONES = [
  { zone: 1, 92–110,  Calentamiento },
  { zone: 2, 110–129, Base aeróbica },
  { zone: 3, 129–147, Umbral aeróbico },
  { zone: 4, 147–166, Umbral anaeróbico },
  { zone: 5, 166–184, Máximo esfuerzo },
]
```

### 6.2 Martes — Recuperación activa (`dow === 2`)

**Semana de carga:**

| Parámetro | Valor |
|-----------|-------|
| Distancia | 6–10 km |
| Desnivel | por bloque: Adapt [80–150], Hiper [150–250], Fuerza [200–350] m |
| Zonas | 80% Z2, 20% Z3 (solo subidas) |
| Duración | 40–60 min |
| Foco | Cadencia y técnica |
| Regla FC | Si >147 ppm en subida → caminar hasta 125 ppm |

**Semana deload:**

| Parámetro | Valor |
|-----------|-------|
| Distancia | 4–5 km |
| Desnivel | máx 80 m |
| Zonas | 100% Z2 |
| Duración | 25–35 min |
| Regla FC | Nunca superar 129 ppm |

### 6.3 Sábado — Desarrollo aeróbico (`dow === 6`)

**Semana de carga:**

| Parámetro | Valor |
|-----------|-------|
| Distancia | `getSabadoDistanceKm(weekNum)` — progresión por bloque |
| Desnivel | por bloque: Adapt [200–350], Hiper [350–550], Fuerza [500–800] m |
| Zonas | 70% Z2, 25% Z3, 5% Z4 (solo cimas) |
| Duración | 70–110 min |
| Foco | Tiempo en pies. Bajadas controladas. |
| Regla FC | Z4 solo picos cortos |

**Progresión distancia sábado (`getSabadoDistanceKm`):**

```
blockIndex = floor(weekNum / 4)
blockStartMin = 10 + blockIndex * 2   // km mínimo al inicio de cada bloque de 4 semanas
weekInBlock = weekNum % 4

Semana 1 del bloque (weekInBlock=0): [blockStartMin, blockStartMin+2]
Semana 2 (weekInBlock=1):            [blockStartMin+2, blockStartMin+4]
Semana 3 (weekInBlock=2):            [blockStartMin+4, blockStartMin+8]
Semana 4 deload (weekInBlock=3):     [6, 8] km fijo
```

Ejemplo bloque 0 (semanas 1–4 del programa): 10–12, 12–14, 14–18, deload 6–8 km.

**Semana deload sábado:** 6–8 km, 100–150 m desnivel, 100% Z2, 45–60 min.

### 6.4 Rutas sugeridas — `TRAIL_PROGRESSION` + `getTrailForDate()`

**Separado de `getTrailSession`:** además de la prescripción por zonas FC, la app muestra una **ruta concreta** de Uvita/Ojochal según:

```javascript
idx = min(floor(weekNum / 2) * 2 + (weekNum % 2), 7)
// martes → TRAIL_PROGRESSION.martes[idx]
// sábado → TRAIL_PROGRESSION.sabado[idx]
```

8 rutas progresivas por día con km, desnivel, dificultad y nota. Esto es **información de referencia**, no reemplaza los rangos de `getTrailSession`.

---

## 7. Modelo de datos por día

```javascript
savedData['YYYY-MM-DD'] = {
  completions: { surf, gym, trail, mob, rest: boolean },
  weights: { exKey: number },      // kg
  setProgress: { trackId: number }, // series completadas en vivo
  note: string,
  time: string,                    // trail manual
  gps: { distanceKm, durationSec, pace, points[], status },
  done: boolean
}
```

**Persistencia:** `persistTraining(dateKey)` → localStorage + IndexedDB (backup por día).

---

## 8. Flujo UI relevante

```
programStartDate + date
    → getWeekNumber(date)
        → getBlock(weekNum)           // gym + trail desnivel
        → getWeekType(weekNum)        // trail carga/deload
        → getPrescription(ex, week)   // gym series/reps
        → getAccessory(type, week)    // gym accesorios
        → getTrailSession(dow, week)  // trail prescripción FC
        → getTrailForDate(date)       // ruta sugerida
        → suggestWeight(exKey)        // peso sugerido
        → checkStagnation(dow)        // alerta gym
```

**Render en vivo:** solo `dynamicBlocks` + `getTrailSession`. `WEEK_PLAN.gym.blocks` es legacy/template.

---

## 9. Puntos para revisión (pedir a Claude)

### Posibles inconsistencias

1. **`WEEK_PLAN` vs `dynamicBlocks`:** ¿mantener sincronizados o eliminar bloques gym de WEEK_PLAN para evitar confusión?
2. **`getPrescription('military', …)` vs keys `military_db`/`military_bar`:** la tabla usa key `military` pero los inputs usan keys separadas — ¿correcto?
3. **`getTrailForDate` idx vs `getTrailSession` rangos:** la ruta sugerida puede no coincidir con distancia/desnivel prescritos (dos sistemas paralelos).
4. **Deload gym:** `getWeekType` afecta trail pero ¿gym reduce volumen en semana 4? Actualmente gym usa mismo `getBlock` sin deload explícito en series.
5. **`getSabadoDistanceKm` semana 3:** salto a `blockStartMin+8` — ¿intencional (+4 km vs semana 2)?
6. **`suggestWeight` busca ±3 días × 4 semanas:** ¿ventana demasiado amplia o estrecha?
7. **Semana 0-based vs UI 1-based:** fácil off-by-one en mental model.
8. **`floor(weekNum / 4) % 3`:** semana 12 vuelve a bloque Adaptación — ¿progresión de pesos debería resetear o continuar?

### Mejoras sugeridas a evaluar

- Unificar trail: una sola fuente (prescripción FC + ruta) en vez de dos.
- Deload automático en gym (reducir series en weekNum % 4 === 3).
- Exportar prescripción del día actual en formato JSON estructurado para AI.
- Validar que desnivel de ruta sugerida caiga dentro del rango de `getTrailSession`.
- Tests unitarios para `getWeekNumber`, `getBlock`, `getTrailSession`, `getSabadoDistanceKm`.

---

## 10. Cómo usar este doc con Claude

Prompt sugerido:

```
Sos un entrenador de fuerza y trail running experto en periodización.
Te paso la documentación completa de la lógica de prescripción de mi app
de entrenamiento. Revisá:

1. Errores lógicos o inconsistencias entre gym, trail y calendario
2. Problemas de periodización (deload, progresión, bloques)
3. Si la progresión de pesos (+2.5 kg) y detección de estancamiento es sensata
4. Si las zonas de FC y distancias de trail son coherentes por bloque
5. Mejoras concretas priorizadas (bug / mejora / nice-to-have)

[Pegá este documento completo]
```

---

## 11. Changelog de bugs conocidos (ya corregidos en código)

| Bug | Estado |
|-----|--------|
| Botón "Guardar sesión" con onclick HTML roto (pesos no se guardaban) | ✅ Corregido |
| IndexedDB pisaba localStorage al boot | ✅ Corregido |
| Week strip scroll se reseteaba en cada render | ✅ Corregido |
| Mes calendario y semana seleccionada desincronizados | ✅ Corregido |
| military compartido lunes/viernes | ✅ Separado en military_db / military_bar |
| Prensa sin rotación legs_vol | ✅ Usa getAccessory('legs_vol', weekNum) |

---

*Fin del documento.*
