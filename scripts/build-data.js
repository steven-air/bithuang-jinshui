// 生成 BTC 农历 / 八字能量研究数据。
// 说明：价格日期来自 UTC 日线；八字只使用日柱与月柱，不推断时柱。
const fs = require('node:fs');
const path = require('node:path');
const { Solar } = require('lunar-javascript');

const root = path.resolve(__dirname, '..');
const csvPath = path.join(root, 'data', 'btc_daily.csv');
const ohlcPath = path.join(root, 'data', 'btc_ohlc.csv');
const outputPath = path.join(root, 'data', 'analysis.json');
const syncMetaPath = path.join(root, 'data', 'sync-meta.json');
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim();
const rows = raw.split(/\r?\n/).slice(1).map((line) => {
  const [date, price] = line.split(',');
  const [day, month, year] = date.split('/').map(Number);
  return { date: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, price: Number(price) };
}).filter((row) => row.date && Number.isFinite(row.price));

// OHLC 独立来源只覆盖 2014 年以后；早期样本保留为空，避免把收盘价伪装成高低点。
const ohlc = new Map();
if (fs.existsSync(ohlcPath)) {
  const ohlcRaw = fs.readFileSync(ohlcPath, 'utf8').trim();
  ohlcRaw.split(/\r?\n/).slice(1).forEach((line) => {
    const [date, high, low, close] = line.split(',');
    if (date && [high, low, close].every((value) => Number.isFinite(Number(value)))) {
      ohlc.set(date, { high: Number(high), low: Number(low), close: Number(close) });
    }
  });
}

const ganElement = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const zhiElement = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const metalWaterGans = new Set(['庚', '辛', '壬', '癸']);
const metalWaterZhis = new Set(['申', '酉', '亥', '子']);
const lowPointPins = new Map([
  ['2025-10-11', '癸丑日土属性，低点关注'],
  ['2025-10-17', '己未日土属性，低点关注']
]);
const highlightedFestivals = new Set(['中秋节', '国庆节', '春节', '圣诞节']);
// lunar-javascript 的部分版本把冬至键名返回为英文内部标识，这里统一成页面展示用中文。
const solarTermNames = {
  DONG_ZHI: '冬至', XIAO_HAN: '小寒', DA_HAN: '大寒', LI_CHUN: '立春',
  YU_SHUI: '雨水', JING_ZHE: '惊蛰', CHUN_FEN: '春分', QING_MING: '清明',
  GU_YU: '谷雨', LI_XIA: '立夏', XIAO_MAN: '小满', MANG_ZHONG: '芒种',
  XIA_ZHI: '夏至', XIAO_SHU: '小暑', DA_SHU: '大暑', LI_QIU: '立秋',
  CHU_SHU: '处暑', BAI_LU: '白露', QIU_FEN: '秋分', HAN_LU: '寒露',
  SHUANG_JIANG: '霜降', LI_DONG: '立冬', XIAO_XUE: '小雪', DA_XUE: '大雪'
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function solarParts(date) {
  const [year, month, day] = date.split('-').map(Number);
  return Solar.fromYmd(year, month, day);
}

function enrich(row, previous) {
  const solar = solarParts(row.date);
  const lunar = solar.getLunar();
  const eight = lunar.getEightChar();
  const dayGan = eight.getDayGan();
  const dayZhi = eight.getDayZhi();
  const monthGan = eight.getMonthGan();
  const monthZhi = eight.getMonthZhi();
  const score = (metalWaterGans.has(dayGan) ? 1 : 0) + (metalWaterZhis.has(dayZhi) ? 1 : 0);
  const returnPct = previous ? (row.price / previous.price - 1) * 100 : null;
  const dayStemElement = ganElement[dayGan];
  const dayBranchElement = zhiElement[dayZhi];
  const metalWaterElements = unique([
    metalWaterGans.has(dayGan) ? dayStemElement : null,
    metalWaterZhis.has(dayZhi) ? dayBranchElement : null
  ]);
  const solarTerms = Object.entries(lunar.getJieQiTable())
    .filter(([, item]) => item.toYmd() === solar.toYmd())
    .map(([name]) => solarTermNames[name] ?? name);
  const festivals = unique([
    ...solar.getFestivals(),
    ...solar.getOtherFestivals(),
    ...lunar.getFestivals(),
    ...solarTerms.map((name) => `节气·${name}`)
  ]);
  const highlightEvents = unique([
    ...solarTerms.map((name) => `节气·${name}`),
    ...festivals.filter((name) => highlightedFestivals.has(name))
  ]);
  const highLowClose = ohlc.get(row.date);
  const isEarthDay = dayStemElement === '土' || dayBranchElement === '土';
  return {
    date: row.date,
    price: row.price,
    returnPct: returnPct === null ? null : Number(returnPct.toFixed(4)),
    lunar: lunar.toString(),
    dayPillar: `${dayGan}${dayZhi}`,
    dayGan,
    dayZhi,
    dayElement: `${dayStemElement}干 / ${dayBranchElement}支`,
    dayStemElement,
    dayBranchElement,
    isEarthDay,
    earthLabel: isEarthDay ? '土属性日' : '',
    metalWaterElements,
    metalWaterLabel: metalWaterElements.length ? `⭐ ${metalWaterElements.join('·')}` : '—',
    monthPillar: `${monthGan}${monthZhi}`,
    metalWaterScore: score,
    isMetalWaterDay: score > 0,
    energyLabel: score === 2 ? '金水双强' : score === 1 ? '单元素' : '非金水',
    festivals,
    solarTerms,
    highlightEvents,
    highPrice: highLowClose?.high ?? null,
    lowPrice: highLowClose?.low ?? null,
    ohlcClose: highLowClose?.close ?? null,
    ohlcAvailable: Boolean(highLowClose),
    isPinnedLowPoint: lowPointPins.has(row.date),
    lowPointNote: lowPointPins.get(row.date) ?? ''
  };
}

const daily = rows.map((row, index) => enrich(row, rows[index - 1]));
const dailyByDate = new Map(daily.map((row) => [row.date, row]));
const numericReturns = (items) => items.map((item) => item.returnPct).filter((value) => Number.isFinite(value));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const stats = (items, neutralizeSmallMetalDrops = false) => {
  const validItems = items.filter((item) => Number.isFinite(item.returnPct));
  const returns = validItems.map((item) => item.returnPct);
  const neutralWeak = neutralizeSmallMetalDrops ? validItems.filter((item) => item.isMetalWaterDay && item.returnPct < 0 && item.returnPct >= -1).length : 0;
  const down = validItems.filter((item) => item.returnPct < 0 && !(neutralizeSmallMetalDrops && item.isMetalWaterDay && item.returnPct >= -1)).length;
  const up = returns.filter((value) => value > 0).length;
  return {
    samples: returns.length,
    upDays: up,
    downDays: down,
    neutralWeakDays: neutralWeak,
    flatDays: returns.filter((value) => value === 0).length,
    accuracy: returns.length ? Number((up / returns.length * 100).toFixed(2)) : 0,
    directionalAccuracy: up + down ? Number((up / (up + down) * 100).toFixed(2)) : 0,
    avgReturn: Number(average(returns).toFixed(4)),
    medianReturn: Number(median(returns).toFixed(4)),
    cumulativeReturn: Number(((items.at(-1)?.price / items[0]?.price - 1) * 100).toFixed(2))
  };
};

function localDateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// 按节气的精确时刻提取未来月柱，避免节气当天 0 点仍落在上一个月柱。
function collectSolarTermForecast(start, end) {
  const terms = new Map();
  for (const date of localDateRange(start, end)) {
    const lunar = solarParts(date).getLunar();
    for (const [rawName, termSolar] of Object.entries(lunar.getJieQiTable())) {
      const termDate = termSolar.toYmd();
      if (termDate < start || termDate > end) continue;
      const name = solarTermNames[rawName] ?? rawName;
      const termLunar = termSolar.getLunar();
      const monthGan = termLunar.getMonthGanExact();
      const monthZhi = termLunar.getMonthZhiExact();
      const key = `${termDate}:${name}`;
      terms.set(key, {
        date: termDate,
        time: termSolar.toYmdHms().slice(11),
        year: Number(termDate.slice(0, 4)),
        solarTerm: name,
        monthPillar: `${monthGan}${monthZhi}`,
        monthGan,
        monthZhi,
        monthGanElement: ganElement[monthGan],
        monthBranchElement: zhiElement[monthZhi],
        elementLabel: `${ganElement[monthGan]}干 / ${zhiElement[monthZhi]}支`
      });
    }
  }
  return [...terms.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function monthPillar(date) {
  const lunar = solarParts(date).getLunar();
  const eight = lunar.getEightChar();
  return `${eight.getMonthGan()}${eight.getMonthZhi()}`;
}

function findDingYouMonths(start, end) {
  const matches = localDateRange(start, end).filter((date) => monthPillar(date) === '丁酉');
  const groups = [];
  for (const date of matches) {
    const previous = groups.at(-1);
    const dayBefore = new Date(`${date}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const contiguous = previous && dayBefore.toISOString().slice(0, 10) === previous.end;
    if (contiguous) previous.end = date;
    else groups.push({ year: Number(date.slice(0, 4)), pillar: '丁酉', start: date, end: date });
  }
  return groups.map((month) => {
    const historical = daily.filter((row) => row.date >= month.start && row.date <= month.end);
    const first = historical[0]?.price;
    const last = historical.at(-1)?.price;
    const move = first && last ? (last / first - 1) * 100 : null;
    return {
      ...month,
      days: Math.round((new Date(`${month.end}T00:00:00Z`) - new Date(`${month.start}T00:00:00Z`)) / 86400000) + 1,
      firstPrice: first ?? null,
      lastPrice: last ?? null,
      returnPct: move === null ? null : Number(move.toFixed(2)),
      status: historical.length ? (move >= 0 ? '上涨' : '下跌') : '待发生'
    };
  });
}

const allMetalWater = daily.filter((row) => row.isMetalWaterDay);
const strongMetalWater = daily.filter((row) => row.metalWaterScore === 2);
const baseline = stats(daily);
const dingYouMonths = findDingYouMonths('2010-01-01', '2042-12-31');
const historicalDingYou = dingYouMonths.filter((month) => month.firstPrice !== null);
const latest = daily.at(-1);
const recent = daily.slice(-90);
const latestMonth = latest.date.slice(0, 7);
const monthStart = `${latestMonth}-01`;
const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1, 0);
const monthEnd = monthEndDate.toISOString().slice(0, 10);
// 为最新月份补齐整月五行日期；尚未发布价格的日期保留价格为空，但照常计算日柱与月柱。
const monthCalendar = localDateRange(monthStart, monthEnd).map((date) => dailyByDate.get(date) ?? enrich({ date, price: null }, null));
const nextDate = new Date(`${latest.date}T00:00:00Z`);
nextDate.setUTCDate(nextDate.getUTCDate() + 1);
const futureSolarTerms = collectSolarTermForecast(nextDate.toISOString().slice(0, 10), '2042-12-31');
// 固定生成 2018—2026 年完整节气历史，页面可按年份筛选并复核月柱切换。
const historicalSolarTerms = collectSolarTermForecast('2018-01-01', '2026-12-31');
const syncMeta = fs.existsSync(syncMetaPath) ? JSON.parse(fs.readFileSync(syncMetaPath, 'utf8')) : {};

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: 'https://www.btbjb.com/data/btc_daily.csv',
    ohlcSource: 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD',
    sourceLicense: '页面标注 CC BY 4.0；请以源站最新版本为准。',
    timezone: 'UTC 日线；农历换算按公历日期，不含时柱；OHLC 仅在独立来源覆盖日期提供',
    latestDate: latest.date,
    latestPrice: latest.price,
    rowCount: daily.length,
    calendarMonth: latestMonth,
    syncedAt: syncMeta.syncedAt ?? null,
    latestCloseDate: syncMeta.latestCloseDate ?? latest.date,
    latestOhlcDate: syncMeta.latestOhlcDate ?? null,
    addedCloseRows: syncMeta.addedCloseRows ?? 0
  },
  latest,
  recent,
  daily,
  stats: {
    baseline,
    metalWater: stats(allMetalWater, true),
    strongMetalWater: stats(strongMetalWater, true),
    byScore: [0, 1, 2].map((score) => ({ score, ...stats(daily.filter((row) => row.metalWaterScore === score), score > 0) }))
  },
  dingYou: {
    months: dingYouMonths,
    historical: historicalDingYou,
    historicalStats: stats(historicalDingYou.filter((month) => month.returnPct !== null).map((month) => ({ price: month.lastPrice, returnPct: month.returnPct }))),
    future: dingYouMonths.filter((month) => month.start > latest.date)
  },
  calendarMonth: latestMonth,
  monthCalendar,
  historicalSolarTerms,
  futureSolarTerms,
  halvingWindows: [
    { label: '2028 减半周期', anchor: '2028-04-12', window: '2028–2032', note: '日期为源站预计值，区块高度变化会导致实际日期漂移。' },
    { label: '2032 减半周期', anchor: '2032-04-15', window: '2032–2036', note: '按约四年节奏估算，用于窗口对照，不是价格预测。' },
    { label: '2036 减半周期', anchor: '2036-04-18', window: '2036–2040', note: '按约四年节奏估算，用于窗口对照，不是价格预测。' },
    { label: '2040 减半周期', anchor: '2040-04-20', window: '2040–2042+', note: '按约四年节奏估算，用于窗口对照，不是价格预测。' }
  ]
};

fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(`生成 ${outputPath}: ${daily.length} 条日线，${dingYouMonths.length} 个丁酉月`);
