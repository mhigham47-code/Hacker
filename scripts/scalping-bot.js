#!/usr/bin/env node
// EMA-crossover scalping bot for BTC/USD and ETH/USD on Alpaca.
//
// Strategy: on each poll, sample the latest trade price per symbol and update
// a fast/slow EMA incrementally in memory. A fast-over-slow cross opens a
// position; the position is closed on a take-profit, a stop-loss, or the
// fast EMA crossing back below the slow EMA — whichever comes first.
//
// This samples the live "latest trade" endpoint rather than Alpaca's 1-minute
// bars endpoint: on some data plans, crypto bars can lag by hours while the
// latest-trade price stays real-time, which would otherwise make the bot
// trade on stale prices without any error being raised.
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

// Per-symbol EMA state, updated incrementally as live prices are sampled
// (rather than recomputed from historical bars on every poll).
const emaState = new Map();

function updateEma(symbol, price) {
  const fastK = 2 / (CONFIG.fastEmaPeriod + 1);
  const slowK = 2 / (CONFIG.slowEmaPeriod + 1);
  const state = emaState.get(symbol);

  if (!state) {
    const fresh = { fastEma: price, slowEma: price, prevFastEma: null, prevSlowEma: null, samples: 1 };
    emaState.set(symbol, fresh);
    return fresh;
  }

  state.prevFastEma = state.fastEma;
  state.prevSlowEma = state.slowEma;
  state.fastEma = price * fastK + state.fastEma * (1 - fastK);
  state.slowEma = price * slowK + state.slowEma * (1 - slowK);
  state.samples += 1;
  return state;
}

async function fetchLatestPrice(symbol) {
  const url = new URL(`${DATA_BASE_URL}/v1beta3/crypto/us/latest/trades`);
  url.searchParams.set('symbols', symbol);

  const res = await fetch(url, { headers });
  const body = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(`Failed to fetch latest trade: ${res.status} ${JSON.stringify(body)}`);
  }
  const trade = body.trades && body.trades[symbol];
  if (!trade) {
    throw new Error(`No trade data returned for ${symbol}`);
  }
  return trade.p;
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

async function evaluateSymbol(symbol, price) {
  const state = updateEma(symbol, price);

  if (state.samples <= CONFIG.slowEmaPeriod || state.prevFastEma === null) {
    console.log(`[${symbol}] warming up EMA (${state.samples}/${CONFIG.slowEmaPeriod} samples). price=$${price.toFixed(2)}`);
    return;
  }

  const { fastEma, slowEma, prevFastEma, prevSlowEma } = state;
  const bullishCross = prevFastEma <= prevSlowEma && fastEma > slowEma;
  const bearishCross = prevFastEma >= prevSlowEma && fastEma < slowEma;

  const position = await getOpenPosition(symbol);

  if (!position) {
    if (bullishCross) {
      console.log(`[${symbol}] bullish EMA cross @ $${price.toFixed(2)} — opening $${CONFIG.positionUsd} position.`);
      const order = await submitOrder(symbol, 'buy', { notional: CONFIG.positionUsd });
      console.log(`[${symbol}] buy order submitted: id=${order.id} status=${order.status}`);
    } else {
      console.log(`[${symbol}] flat, no signal. price=$${price.toFixed(2)} fastEma=${fastEma.toFixed(2)} slowEma=${slowEma.toFixed(2)}`);
    }
    return;
  }

  const entryPrice = Number(position.avg_entry_price);
  const changePct = (price - entryPrice) / entryPrice;
  const qty = position.qty;

  const hitTakeProfit = changePct >= CONFIG.takeProfitPct;
  const hitStopLoss = changePct <= -CONFIG.stopLossPct;

  if (hitTakeProfit || hitStopLoss || bearishCross) {
    const reason = hitTakeProfit ? 'take-profit' : hitStopLoss ? 'stop-loss' : 'bearish EMA cross';
    console.log(`[${symbol}] closing position (${reason}): entry=$${entryPrice.toFixed(2)} last=$${price.toFixed(2)} change=${(changePct * 100).toFixed(2)}%`);
    const order = await submitOrder(symbol, 'sell', { qty });
    console.log(`[${symbol}] sell order submitted: id=${order.id} status=${order.status}`);
  } else {
    console.log(`[${symbol}] holding position. entry=$${entryPrice.toFixed(2)} last=$${price.toFixed(2)} change=${(changePct * 100).toFixed(2)}%`);
  }
}

async function pollOnce() {
  for (const symbol of CONFIG.symbols) {
    try {
      const price = await fetchLatestPrice(symbol);
      await evaluateSymbol(symbol, price);
    } catch (err) {
      console.error(`[${symbol}] error during evaluation:`, err.message);
    }
  }
}

async function main() {
  assertConfigured();

  console.log(`Scalping bot starting — ${IS_PAPER ? 'PAPER' : 'LIVE'} trading on ${TRADING_BASE_URL}`);
  console.log(`Symbols: ${CONFIG.symbols.join(', ')} | polling live trade price every ${CONFIG.pollIntervalMs / 1000}s | fastEMA=${CONFIG.fastEmaPeriod} slowEMA=${CONFIG.slowEmaPeriod} samples`);
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
