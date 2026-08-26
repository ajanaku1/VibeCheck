#!/usr/bin/env bash
set -euo pipefail

echo "==> VibeCheck Setup"
echo ""

# 1. Check Node version
NODE_V=$(node --version 2>/dev/null || echo "none")
echo "Node: $NODE_V"
if ! node --version 2>/dev/null | grep -q "^v2[2-9]\|^v[3-9]"; then
  echo "ERROR: Node 22+ required."
  exit 1
fi

# 2. Install Minds CLI
if ! command -v minds &>/dev/null; then
  echo "==> Installing Minds CLI..."
  npm install -g @animocabrands/minds-cli
else
  echo "Minds CLI: $(minds --version)"
fi

# 3. Install project dependencies
echo "==> Installing project dependencies..."
npm install

# 4. Check for .env
if [ ! -f .env ]; then
  echo ""
  echo "==> .env not found. Creating .env from template..."
  cat > .env << 'ENVEOF'
MINDS_BUILDER_API_KEY=
TELEGRAM_BOT_TOKEN=
ENVEOF
  echo "WARNING: Edit .env and add your Minds Builder API key and Telegram bot token."
  echo "         Get your API key at: https://build.hellominds.ai/console"
  echo "         Get a bot token from: https://t.me/BotFather"
  echo ""
fi

# 5. Verify Minds connection
if grep -q "MINDS_BUILDER_API_KEY=ey" .env 2>/dev/null; then
  echo "==> Verifying Minds connection..."
  source .env 2>/dev/null || true
  minds doctor --quiet 2>/dev/null && echo "Connected." || echo "Could not verify connection."
fi

# 6. Build the dashboard
echo "==> Building dashboard..."
npm run build 2>/dev/null && echo "Done." || echo "Build skipped (will work after npm install)."

echo ""
echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Add your keys to .env"
echo "  2. Run  minds doctor  to verify"
echo "  3. Run  npm run dev  to open the dashboard"
echo "  4. Run  minds send <alias> \"hello\"  to test the Mind"
