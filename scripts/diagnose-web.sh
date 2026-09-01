#!/usr/bin/env bash
# Diagnóstico: ¿por qué localhost rechaza la conexión?
set -eu

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/rastro-web"
PORT="${PORT:-5173}"

echo "=== Rastro Web — diagnóstico ==="
echo ""

# 1. ¿Terminal remota (Cursor Cloud / SSH)?
if [ -d /workspace ] && pwd | grep -q workspace; then
  echo "⚠️  TERMINAL REMOTA detectada ($(pwd))"
  echo ""
  echo "   Vite corre en la VM, NO en tu PC."
  echo "   El navegador de Windows en localhost:5173 NO verá el servidor."
  echo ""
  echo "   Solución A — Port forwarding en Cursor:"
  echo "     1. Arranca: bash scripts/start-web.sh"
  echo "     2. Panel 'Ports' / 'Puertos' (abajo en Cursor)"
  echo "     3. Forward puerto $PORT → abre el link que te da Cursor"
  echo ""
  echo "   Solución B — Correr en TU PC (PowerShell local, fuera de Cursor remoto):"
  echo "     cd ~\\appsperu"
  echo "     .\\scripts\\start-web.ps1"
  echo ""
else
  echo "✓ Terminal local (o no remota)"
fi

echo "--- Comprobaciones ---"

if [ ! -f "$WEB/package.json" ]; then
  echo "✗ Falta $WEB/package.json — ¿estás en la raíz del repo?"
  exit 1
fi
echo "✓ package.json en apps/rastro-web"

if [ ! -f "$WEB/.env" ]; then
  echo "✗ Falta .env — ejecuta: cp apps/rastro-web/.env.example apps/rastro-web/.env"
else
  echo "✓ .env existe"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node no instalado"
else
  echo "✓ Node $(node -v)"
fi

if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "✓ Servidor respondiendo en http://127.0.0.1:${PORT}/"
  echo ""
  echo "   Si el navegador sigue fallando → casi seguro es terminal REMOTA."
  echo "   Usa port forwarding o corre start-web en PowerShell local."
else
  echo "✗ Nada escuchando en puerto $PORT"
  echo ""
  echo "   Arranca el servidor:"
  echo "     bash scripts/start-web.sh"
  echo "   y deja la terminal ABIERTA hasta ver: Local: http://localhost:$PORT/"
fi

echo ""
echo "=== fin ==="
