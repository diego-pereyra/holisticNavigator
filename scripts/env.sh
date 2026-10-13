#!/bin/bash
# Toolchain + flags livianos para WSL. Usar:  source scripts/env.sh
HN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HN_ROOT/.tools/node/bin:$PATH"
export NODE_OPTIONS="--dns-result-order=ipv4first"
export HN_ROOT
