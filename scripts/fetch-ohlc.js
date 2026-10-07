// 拉取 Yahoo Finance 的 BTC-USD 日线 OHLC，作为日历高低点的独立价格来源。
import fs from 'node:fs';

// 结束时间动态取当前 UTC 日期，避免脚本在 2026-10-07 后停止更新。
const period1 = Math.floor(Date.UTC(2014, 8, 1) / 1000);
const period2 = Math.floor(Date.now() / 1000) + 86400;
const url = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=${period1}&period2=${period2}&interval=1d&events=history`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);
const payload = await response.json();
const result = payload.chart.result?.[0];
if (!result?.timestamp || !result.indicators?.quote?.[0]) throw new Error('Yahoo Finance 返回缺少 OHLC 字段');
const quote = result.indicators.quote[0];
const rows = result.timestamp.flatMap((timestamp, index) => {
  const high = quote.high[index];
  const low = quote.low[index];
  const close = quote.close[index];
  if (![high, low, close].every(Number.isFinite)) return [];
  return [[new Date(timestamp * 1000).toISOString().slice(0, 10), high, low, close].join(',')];
});
fs.writeFileSync('data/btc_ohlc.csv', `date_utc,high_price_usd,low_price_usd,close_price_usd\n${rows.join('\n')}\n`);
console.log(`写入 ${rows.length} 条 OHLC 日线`);
