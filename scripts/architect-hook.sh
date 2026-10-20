#!/bin/bash
# Hook del arquitecto (Claude): mira SEMAFORO.md cada 15 s.
#
# 1. Si termina en "Status: DONE": registra el cierre y carga la primera
#    tarea de queue/ en el semáforo. Si la cola está VACÍA, escribe ESPERAR
#    (resuelve el done y evita quedarse trabado esperando para siempre).
# 2. Si está en ESPERAR y la cola se rellena: carga la primera automáticamente.
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

sem_done() { tail -3 SEMAFORO.md 2>/dev/null | grep -qiE "$DONE_RE"; }
sem_esperar() { head -1 SEMAFORO.md 2>/dev/null | grep -q '^ESPERAR'; }

# Carga la primera tarea de queue/ en el semáforo y la mueve a queue/done/.
load_next() {
  local next name task
  next="$(ls queue/*.md 2>/dev/null | sort | head -1)"
  [ -z "$next" ] && return 1
  name="$(basename "$next" .md)"
  task="$(grep -m1 'TAREA ÚNICA' SEMAFORO.md 2>/dev/null | sed 's/^TAREA ÚNICA: //' | head -c 120)"
  git add SEMAFORO.md 2>/dev/null
  git commit -q -m "SEMAFORO: ${task:-tarea} — Status:done (Big Pickle)" 2>/dev/null
  cp "$next" SEMAFORO.md
  printf '\nStatus: ready\n' >> SEMAFORO.md
  mkdir -p queue/done
  git mv "$next" "queue/done/$name.md" 2>/dev/null || mv "$next" "queue/done/$name.md"
  git add SEMAFORO.md queue/ 2>/dev/null
  git commit -q -m "SEMAFORO: siguiente tarea $name (auto desde la cola)" 2>/dev/null
  log "done: ${task:-?} → cargada $name"
  return 0
}

while true; do
  sleep "$INTERVAL"
  if sem_done; then
    load_next || {
      # Cola vacía: ESPERAR resuelve el done y el loop sigue vivo; si la
      # cola se rellena, el caso de abajo la carga sola.
      task="$(grep -m1 'TAREA ÚNICA' SEMAFORO.md 2>/dev/null | sed 's/^TAREA ÚNICA: //' | head -c 120)"
      printf 'ESPERAR\n\nNo hay tareas en la cola. Cargá la siguiente en queue/ (se toma\nautomáticamente en menos de 15 s) o esperá al arquitecto.\n' > SEMAFORO.md
      git add SEMAFORO.md 2>/dev/null
      git commit -q -m "SEMAFORO: ESPERAR — cola vacía" 2>/dev/null
      log "done: ${task:-?} — cola vacía → ESPERAR (se reanuda solo si se llena la cola)"
    }
  elif sem_esperar && ls queue/*.md >/dev/null 2>&1; then
    name="$(basename "$(ls queue/*.md 2>/dev/null | sort | head -1)" .md)"
    cp "$(ls queue/*.md | sort | head -1)" SEMAFORO.md
    printf '\nStatus: ready\n' >> SEMAFORO.md
    mkdir -p queue/done
    git mv "$(ls queue/*.md | sort | head -1)" "queue/done/$name.md" 2>/dev/null
    git add SEMAFORO.md queue/ 2>/dev/null
    git commit -q -m "SEMAFORO: cargada $name (la cola se rellenó durante ESPERAR)" 2>/dev/null
    log "ESPERAR → cargada $name (la cola se rellenó)"
  fi
done
