#!/usr/bin/env node
// EMA-crossover scalping bot for BTC/USD and ETH/USD on Alpaca.
//
// Strategy: on each poll, compute a fast and slow EMA from recent 1-minute
// bars per symbol. A fast-over-slow cross opens a position; the position is
// closed on a take-profit, a stop-loss, or the fast EMA crossing back below
// the slow EMA — whichever comes first.
//
// Safety: runs against Alpaca's PAPER endpoint unless ALPACA_BASE_URL is
// overridden AND ALLOW_LIVE_TRADING=true is set explicitly. Never trades
// live by accident.
//
// Usage:
//   node scripts/scalping-bot.js
//   node scripts/scalping-bot.js --once   (single poll, no loop — for testing)

require('dotenv').config();

const CONFIG = {
  symbols: ['BTC/USD', 'ETH/USD'],
  timeframe: '1Min',
  barsLookback: 50,
  fastEmaPeriod: 5,
  slowEmaPeriod: 20,
  takeProfitPct: Number(process.env.SCALPER_TAKE_PROFIT_PCT || 0.006), // 0.6%
  stopLossPct: Number(process.env.SCALPER_STOP_LOSS_PCT || 0.004), // 0.4%
  positionUsd: Number(process.env.SCALPER_POSITION_USD || 100),
  pollIntervalMs: Number(process.env.SCALPER_POLL_INTERVAL_MS || 30_000),
};

// .trim() guards against a stray trailing space/newline from copy-pasting the
// key, which produces an invalid header value and a confusing non-JSON response.
const API_KEY = process.env.ALPACA_API_KEY_ID?.trim();
const API_SECRET = process.env.ALPACA_API_SECRET_KEY?.trim();
const TRADING_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const DATA_BASE_URL = 'https://data.alpaca.markets';
const IS_PAPER = TRADING_BASE_URL.includes('paper');
const ALLOW_LIVE_TRADING = process.env.ALLOW_LIVE_TRADING === 'true';

const headers = {
  'APCA-API-KEY-ID': API_KEY,
  'APCA-API-SECRET-KEY': API_SECRET,
  'Content-Type': 'application/json',
};

function assertConfigured() {
  if (!API_KEY || !API_SECRET) {
    console.error('Missing ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY in environment (.env).');
    process.exit(1);
  }
  if (!IS_PAPER && !ALLOW_LIVE_TRADING) {
    console.error(
      'ALPACA_BASE_URL points at a live endpoint but ALLOW_LIVE_TRADING is not "true".\n' +
        'Refusing to trade real money. Set ALPACA_BASE_URL back to the paper endpoint,\n' +
        'or set ALLOW_LIVE_TRADING=true if you have deliberately decided to go live.'
    );
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Alpaca normally returns JSON, but a proxy, WAF, or malformed request can
// return an HTML/plain-text error page instead. Surface that raw body
// (truncated) instead of letting JSON.parse throw an opaque SyntaxError.
async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status} ${res.statusText}): ${text.slice(0, 300)}`);
  }
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let emaVal = values[0];
  for (let i = 1; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

// Fetched one symbol at a time: requesting multiple symbols in a single call
// paginates across symbols (via next_page_token) rather than returning all of
// them together, so a multi-symbol request silently drops everything but the
// first symbol unless that pagination is followed.
async function fetchBars(symbol) {
  const url = new URL(`${DATA_BASE_URL}/v1beta3/crypto/us/bars`);
  url.searchParams.set('symbols', symbol);
  url.searchParams.set('timeframe', CONFIG.timeframe);
  url.searchParams.set('limit', String(CONFIG.barsLookback));

  const res = await fetch(url, { headers });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch bars: ${res.status} ${JSON.stringify(body)}`);
  }
  return (body.bars && body.bars[symbol]) || [];
}

// Alpaca's crypto position symbols drop the "/" (e.g. "BTC/USD" -> "BTCUSD").
function positionSymbol(symbol) {
  return symbol.replace('/', '');
}

async function getOpenPosition(symbol) {
  const res = await fetch(`${TRADING_BASE_URL}/v2/positions/${positionSymbol(symbol)}`, { headers });
  if (res.status === 404) return null;
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch position for ${symbol}: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function submitOrder(symbol, side, { notional, qty } = {}) {
  const order = {
    symbol,
    side,
    type: 'market',
    time_in_force: 'gtc', // Alpaca crypto orders require gtc or ioc, not day
    ...(notional ? { notional: String(notional) } : { qty: String(qty) }),
  };

  const res = await fetch(`${TRADING_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(order),
  });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(`Order failed for ${symbol}: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function evaluateSymbol(symbol, bars) {
  if (!bars || bars.length < CONFIG.slowEmaPeriod + 1) {
    console.log(`[${symbol}] not enough bars yet (${bars ? bars.length : 0}), skipping.`);
    return;
  }

  const closes = bars.map((b) => b.c);
  const prevCloses = closes.slice(0, -1);
  const lastPrice = closes[closes.length - 1];

  const fastEma = ema(closes.slice(-CONFIG.fastEmaPeriod - 1), CONFIG.fastEmaPeriod);
  const slowEma = ema(closes.slice(-CONFIG.slowEmaPeriod - 1), CONFIG.slowEmaPeriod);
  const prevFastEma = ema(prevCloses.slice(-CONFIG.fastEmaPeriod - 1), CONFIG.fastEmaPeriod);
  const prevSlowEma = ema(prevCloses.slice(-CONFIG.slowEmaPeriod - 1), CONFIG.slowEmaPeriod);

  const bullishCross = prevFastEma <= prevSlowEma && fastEma > slowEma;
  const bearishCross = prevFastEma >= prevSlowEma && fastEma < slowEma;

  const position = await getOpenPosition(symbol);

  if (!position) {
    if (bullishCross) {
      console.log(`[${symbol}] bullish EMA cross @ $${lastPrice.toFixed(2)} — opening $${CONFIG.positionUsd} position.`);
      const order = await submitOrder(symbol, 'buy', { notional: CONFIG.positionUsd });
      console.log(`[${symbol}] buy order submitted: id=${order.id} status=${order.status}`);
    } else {
      console.log(`[${symbol}] flat, no signal. price=$${lastPrice.toFixed(2)} fastEma=${fastEma.toFixed(2)} slowEma=${slowEma.toFixed(2)}`);
    }
    return;
  }

  const entryPrice = Number(position.avg_entry_price);
  const changePct = (lastPrice - entryPrice) / entryPrice;
  const qty = position.qty;

  const hitTakeProfit = changePct >= CONFIG.takeProfitPct;
  const hitStopLoss = changePct <= -CONFIG.stopLossPct;

  if (hitTakeProfit || hitStopLoss || bearishCross) {
    const reason = hitTakeProfit ? 'take-profit' : hitStopLoss ? 'stop-loss' : 'bearish EMA cross';
    console.log(`[${symbol}] closing position (${reason}): entry=$${entryPrice.toFixed(2)} last=$${lastPrice.toFixed(2)} change=${(changePct * 100).toFixed(2)}%`);
    const order = await submitOrder(symbol, 'sell', { qty });
    console.log(`[${symbol}] sell order submitted: id=${order.id} status=${order.status}`);
  } else {
    console.log(`[${symbol}] holding position. entry=$${entryPrice.toFixed(2)} last=$${lastPrice.toFixed(2)} change=${(changePct * 100).toFixed(2)}%`);
  }
}

async function pollOnce() {
  for (const symbol of CONFIG.symbols) {
    try {
      const bars = await fetchBars(symbol);
      await evaluateSymbol(symbol, bars);
    } catch (err) {
      console.error(`[${symbol}] error during evaluation:`, err.message);
    }
  }
}

async function main() {
  assertConfigured();

  console.log(`Scalping bot starting — ${IS_PAPER ? 'PAPER' : 'LIVE'} trading on ${TRADING_BASE_URL}`);
  console.log(`Symbols: ${CONFIG.symbols.join(', ')} | timeframe=${CONFIG.timeframe} | fastEMA=${CONFIG.fastEmaPeriod} slowEMA=${CONFIG.slowEmaPeriod}`);
  console.log(`Position size: $${CONFIG.positionUsd} | take-profit=${(CONFIG.takeProfitPct * 100).toFixed(2)}% stop-loss=${(CONFIG.stopLossPct * 100).toFixed(2)}%`);

  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    await pollOnce();
    return;
  }

  let running = true;
  process.on('SIGINT', () => {
    console.log('\nShutting down (SIGINT received). Open positions are left as-is on Alpaca.');
    running = false;
  });

  while (running) {
    await pollOnce();
    await sleep(CONFIG.pollIntervalMs);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
