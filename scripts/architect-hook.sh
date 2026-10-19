#!/bin/bash
# Hook del arquitecto (Claude): mira SEMAFORO.md cada 15 s; cuando Big Pickle
# escribe "Status:done" al final, commitea el done, carga automáticamente la
# siguiente tarea de queue/ en el semáforo y commitea. Big Pickle nunca
# espera al arquitecto entre tareas; el arquitecto revisa después con el log
# (.architect-hook.log) y los diffs.
#
# Arrancar:  nohup bash scripts/architect-hook.sh >/dev/null 2>&1 &
# Parar:    kill $(cat .architect-hook.pid)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Una sola instancia.
exec 9> .architect-hook.lock
if ! flock -n 9; then echo "hook ya corriendo" >&2; exit 1; fi
echo $$ > .architect-hook.pid

LOG="$ROOT/.architect-hook.log"
INTERVAL=15
touch "$LOG"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
log "hook iniciado (pid $$)"

while true; do
  sleep "$INTERVAL"
  if ! grep -q "Status:done" SEMAFORO.md 2>/dev/null; then
    continue
  fi

  task="$(grep -m1 'TAREA ÚNICA' SEMAFORO.md 2>/dev/null | sed 's/^TAREA ÚNICA: //' | head -c 120)"
  # Guarda anti-carrera: releer (el arquitecto puede haber avanzado a mano).
  if ! grep -q "Status:done" SEMAFORO.md 2>/dev/null; then
    continue
  fi

  next="$(ls queue/*.md 2>/dev/null | sort | head -1)"
  if [ -n "$next" ]; then
    name="$(basename "$next" .md)"
    # Done de Big Pickle queda registrado en el historial (su commit suele
    # traerlo; si no, lo commitea el hook).
    git add SEMAFORO.md 2>/dev/null
    git commit -q -m "SEMAFORO: ${task:-tarea} — Status:done (Big Pickle)" 2>/dev/null
    cp "$next" SEMAFORO.md
    printf '\nStatus: ready\n' >> SEMAFORO.md
    mkdir -p queue/done
    git mv "$next" "queue/done/$name.md" 2>/dev/null || mv "$next" "queue/done/$name.md"
    git add SEMAFORO.md queue/ 2>/dev/null
    git commit -q -m "SEMAFORO: siguiente tarea $name (auto desde la cola)" 2>/dev/null
    log "done: ${task:-?} → cargada $name"
  else
    log "done: ${task:-?} — cola vacía, se espera a Diego"
  fi

  # Esperar a que el Status:done desaparezca antes de volver a disparar.
  while grep -q "Status:done" SEMAFORO.md 2>/dev/null; do sleep "$INTERVAL"; done
done
