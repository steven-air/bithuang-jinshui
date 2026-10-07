// 同步 BTC 收盘价与 OHLC 数据。
// 收盘价优先使用公开 CSV；CSV 尚未覆盖的新日期用 Yahoo Finance 日线补齐。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const closePath = path.join(dataDir, 'btc_daily.csv');
const ohlcPath = path.join(dataDir, 'btc_ohlc.csv');
const syncMetaPath = path.join(dataDir, 'sync-meta.json');
const closeSourceUrl = 'https://www.btbjb.com/data/btc_daily.csv';

// 将不同来源的日期统一成 ISO 日期，避免按字符串排序时出现错位。
function normalizeDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseCloseCsv(text) {
  const rows = new Map();
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/).slice(1)) {
    const [rawDate, rawPrice] = line.split(',');
    const date = normalizeDate(rawDate);
    const price = Number(rawPrice);
    if (date && Number.isFinite(price) && price > 0) rows.set(date, price);
  }
  return rows;
}

// Yahoo 的时间戳是 UTC 秒；只保留完整字段，避免把空 candle 写入数据层。
async function fetchYahooRows() {
  const period1 = Math.floor(Date.UTC(2010, 6, 1) / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const response = await fetch(url, { headers: { 'user-agent': 'bithuang-jinshui-sync/1.0' } });
  if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) throw new Error('Yahoo Finance 返回缺少日线字段');
  return result.timestamp.flatMap((timestamp, index) => {
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const high = Number(quote.high?.[index]);
    const low = Number(quote.low?.[index]);
    const close = Number(quote.close?.[index]);
    if (![high, low, close].every(Number.isFinite)) return [];
    return [{ date, high, low, close }];
  });
}

function writeCloseCsv(rows) {
  const lines = [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, price]) => {
      const [year, month, day] = date.split('-');
      return `${Number(day)}/${Number(month)}/${year},${price}`;
    });
  fs.writeFileSync(closePath, `date,price\n${lines.join('\n')}\n`);
}

function writeOhlcCsv(rows) {
  const unique = new Map(rows.map((row) => [row.date, row]));
  const lines = [...unique.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => [row.date, row.high, row.low, row.close].join(','));
  fs.writeFileSync(ohlcPath, `date_utc,high_price_usd,low_price_usd,close_price_usd\n${lines.join('\n')}\n`);
  return [...unique.keys()].sort().at(-1) || null;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const localClose = parseCloseCsv(fs.readFileSync(closePath, 'utf8'));
  // 主 CSV 暂时不可用时保留本地快照，继续尝试公开行情 API，避免整次定时任务失败。
  let sourceClose = new Map();
  try {
    const sourceResponse = await fetch(closeSourceUrl, { headers: { 'user-agent': 'bithuang-jinshui-sync/1.0' } });
    if (!sourceResponse.ok) throw new Error(`HTTP ${sourceResponse.status}`);
    sourceClose = parseCloseCsv(await sourceResponse.text());
  } catch (error) {
    console.warn(`收盘价 CSV 暂不可用（${error.message}），使用本地快照并由 Yahoo Finance 补齐`);
  }
  const yahooRows = await fetchYahooRows();

  // 远程 CSV 是主要收盘价来源；Yahoo 只补齐它尚未发布的新日期。
  const mergedClose = sourceClose.size ? sourceClose : localClose;
  const beforeLatest = [...mergedClose.keys()].sort().at(-1) || null;
  let addedRows = 0;
  for (const row of yahooRows) {
    if (row.date > today || mergedClose.has(row.date)) continue;
    mergedClose.set(row.date, row.close);
    addedRows += 1;
  }
  writeCloseCsv(mergedClose);
  const ohlcLatestDate = writeOhlcCsv(yahooRows.filter((row) => row.date <= today));
  const latestDate = [...mergedClose.keys()].sort().at(-1) || beforeLatest;
  const meta = {
    syncedAt: new Date().toISOString(),
    closeSource: closeSourceUrl,
    ohlcSource: 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD',
    previousLatestDate: beforeLatest,
    latestCloseDate: latestDate,
    latestOhlcDate: ohlcLatestDate,
    addedCloseRows: addedRows
  };
  fs.writeFileSync(syncMetaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`同步完成：收盘价 ${latestDate}，OHLC ${ohlcLatestDate}，新增 ${addedRows} 天`);
}

main().catch((error) => {
  console.error(`同步失败：${error.message}`);
  process.exitCode = 1;
});
