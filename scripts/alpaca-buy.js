#!/usr/bin/env node
// Places a simple market order via the Alpaca Trading API (paper or live,
// depending on ALPACA_BASE_URL). Reads credentials from environment
// variables only — never hardcode keys here.
//
// Usage:
//   node scripts/alpaca-buy.js <SYMBOL> <QTY>
//   node scripts/alpaca-buy.js TSLA 1

require('dotenv').config();

const API_KEY = process.env.ALPACA_API_KEY_ID;
const API_SECRET = process.env.ALPACA_API_SECRET_KEY;
const BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

const [symbol, qtyArg] = process.argv.slice(2);

async function main() {
  if (!API_KEY || !API_SECRET) {
    console.error('Missing ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY in environment (.env).');
    process.exit(1);
  }
  if (!symbol || !qtyArg) {
    console.error('Usage: node scripts/alpaca-buy.js <SYMBOL> <QTY>');
    process.exit(1);
  }

  const headers = {
    'APCA-API-KEY-ID': API_KEY,
    'APCA-API-SECRET-KEY': API_SECRET,
    'Content-Type': 'application/json',
  };

  const account = await fetch(`${BASE_URL}/v2/account`, { headers }).then((r) => r.json());
  if (account.account_blocked || account.trading_blocked) {
    console.error('Account is blocked from trading:', account);
    process.exit(1);
  }
  console.log(`Account ${account.account_number} (${BASE_URL.includes('paper') ? 'PAPER' : 'LIVE'}) — buying power: $${account.buying_power}`);

  const order = {
    symbol,
    qty: qtyArg,
    side: 'buy',
    type: 'market',
    time_in_force: 'day',
  };

  const res = await fetch(`${BASE_URL}/v2/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(order),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error('Order failed:', res.status, body);
    process.exit(1);
  }

  console.log('Order submitted:');
  console.log(`  id:     ${body.id}`);
  console.log(`  symbol: ${body.symbol}`);
  console.log(`  qty:    ${body.qty}`);
  console.log(`  side:   ${body.side}`);
  console.log(`  status: ${body.status}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
