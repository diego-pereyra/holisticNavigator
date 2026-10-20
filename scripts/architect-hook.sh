#!/bin/bash
# Hook del arquitecto (Claude): mira SEMAFORO.md cada 15 s.
#
# 1. Si termina en "Status: DONE": registra el cierre y carga la primera
#    tarea de queue/ en el semáforo. Si la cola está VACÍA, escribe ESPERAR.
# 2. Si está en ESPERAR y la cola se rellena: carga la primera automáticamente.
#
# Corridas de carrera cubiertas (bug de la E13.4, ver BLOCKERS):
# - La tarea recién cerrada jamás puede ser "la siguiente": se excluye por
#   código de tarea (E13.4-el-429 no se recarga tras cerrar E13.4).
# - La tarea se mueve a queue/done/ ANTES de escribir el semáforo, con el
#   estado de queue/ estagado en git primero (por si el archivo llegó sin
#   commitear) y verificación dura de que ya no está en queue/.
#
# Arrancar:  setsid bash scripts/architect-hook.sh </dev/null >/dev/null 2>&1 &
# Parar:     kill $(cat .architect-hook.pid)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

exec 9> .architect-hook.lock
if ! flock -n 9; then echo "hook ya corriendo" >&2; exit 1; fi
echo $$ > .architect-hook.pid

LOG="$ROOT/.architect-hook.log"
INTERVAL=15
DONE_RE='^status: *done *$'

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
log "hook iniciado (pid $$)"
# Toda muerte queda registrada (con código de salida) para dejar de perder
# hooks en silencio.
trap 'log "hook murió (exit $?)"' EXIT

sem_done() { tail -3 SEMAFORO.md 2>/dev/null | grep -qiE "$DONE_RE"; }
sem_esperar() { head -1 SEMAFORO.md 2>/dev/null | grep -q '^ESPERAR'; }
sem_task() { grep -m1 'TAREA ÚNICA' SEMAFORO.md 2>/dev/null | sed 's/^TAREA ÚNICA: //' | head -c 120; }
sem_code() { sem_task | grep -oE '[A-Z]{1,3}[0-9]+\.[0-9]+[a-z]?' | head -1; }

# Carga la primera tarea de queue/ en el semáforo y la mueve a queue/done/.
# $1 = código de la tarea recién cerrada (para excluir la re-emisión) o vacío.
load_next() {
  local closed="$1" next name task code
  next="$(ls queue/*.md 2>/dev/null | sort | head -1)"
  [ -z "$next" ] && return 1
  name="$(basename "$next" .md)"
  code="$(echo "$name" | grep -oE '[A-Z]{1,3}[0-9]+\.[0-9]+[a-z]?' | head -1)"
  if [ -n "$closed" ] && [ "$code" = "$closed" ]; then
    log "omitida $name: es la tarea que recién se cerró (carrera)"
    return 1
  fi
  task="$(sem_task)"
  # 1) Estagar todo el estado de queue/ (la tarea puede haber llegado sin commit).
  git add -A queue/ 2>/dev/null
  # 2) Moverla a done/ ANTES de tocar el semáforo, y verificar que se fue.
  mkdir -p queue/done
  git mv "$next" "queue/done/$name.md" 2>/dev/null || mv "$next" "queue/done/$name.md"
  if [ -e "$next" ]; then
    log "ERROR: $name no se pudo mover a queue/done/ — no cargo nada"
    return 1
  fi
  # 3) Recién ahora el semáforo: registrar el cierre y cargar la tarea.
  git add SEMAFORO.md 2>/dev/null
  git commit -q -m "SEMAFORO: ${task:-tarea} — Status:done (Big Pickle)" 2>/dev/null
  cp "queue/done/$name.md" SEMAFORO.md
  printf '\nStatus: ready\n' >> SEMAFORO.md
  git add SEMAFORO.md queue/ 2>/dev/null
  git commit -q -m "SEMAFORO: siguiente tarea $name (auto desde la cola)" 2>/dev/null
  log "cargada $name${closed:+ (cerrada antes: $closed)}"
  return 0
}

while true; do
  sleep "$INTERVAL"
  if sem_done; then
    closed="$(sem_code)"
    load_next "$closed" || {
      task="$(sem_task)"
      printf 'ESPERAR\n\nNo hay tareas en la cola. Cargá la siguiente en queue/ (se toma\nautomáticamente en menos de 15 s) o esperá al arquitecto.\n' > SEMAFORO.md
      git add SEMAFORO.md 2>/dev/null
      git commit -q -m "SEMAFORO: ESPERAR — cola vacía" 2>/dev/null
      log "done: ${task:-?} (código ${closed:-?}) — cola vacía → ESPERAR"
    }
  elif sem_esperar && ls queue/*.md >/dev/null 2>&1; then
    load_next "" || log "no pude cargar la tarea de la cola"
  fi
done
