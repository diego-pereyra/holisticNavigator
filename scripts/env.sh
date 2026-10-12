#!/bin/bash
# Toolchain + flags livianos para WSL. Usar:  source scripts/env.sh
HN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="$HN_ROOT/.tools/jdk"
export PATH="$JAVA_HOME/bin:$HN_ROOT/.tools/node/bin:$HN_ROOT/.tools/gradle/gradle-9.8.1/bin:$PATH"
export NODE_OPTIONS="--dns-result-order=ipv4first"
export HN_ROOT
