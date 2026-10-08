// 生成 BTC 农历 / 八字能量研究数据。
// 说明：价格日期来自 UTC 日线；八字只使用日柱与月柱，不推断时柱。
const fs = require('node:fs');
const path = require('node:path');
const { Solar } = require('lunar-javascript');

const root = path.resolve(__dirname, '..');
// 本地开发优先参考用户提供的 CSV；部署或自动构建时回退到仓库内副本。
const priceCsvCandidates = [
  process.env.BTC_DAILY_CSV,
  'D:\\download\\btc_daily.csv',
  path.join(root, 'data', 'btc_daily.csv')
].filter(Boolean);
const csvPath = priceCsvCandidates.find((candidate) => fs.existsSync(candidate));
if (!csvPath) throw new Error('找不到 BTC 日线 CSV，请设置 BTC_DAILY_CSV 或提供 data/btc_daily.csv');
const ohlcPath = path.join(root, 'data', 'btc_ohlc.csv');
const outputPath = path.join(root, 'data', 'analysis.json');
const syncMetaPath = path.join(root, 'data', 'sync-meta.json');
const lunarCalendarDir = path.join(root, 'data', 'lunar-calendar');
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim();
const rows = raw.split(/\r?\n/).slice(1).map((line) => {
  const [date, price] = line.split(',');
  if (!date || !price) return null;
  const [day, month, year] = date.split('/').map(Number);
  if (![day, month, year].every(Number.isFinite)) return null;
  return { date: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, price: Number(price) };
}).filter((row) => row?.date && Number.isFinite(row.price)).sort((left, right) => left.date.localeCompare(right.date));
const priceByDate = new Map(rows.map((row) => [row.date, row]));
const previousPriceByDate = new Map(rows.map((row, index) => [row.date, rows[index - 1]?.price ?? null]));

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
// 日历只保留主要节日，过滤库内的纪念日、国际日和其他扩展节日。
const calendarFestivalNames = new Set([
  '元旦节', '除夕', '春节', '元宵节', '清明节', '端午节', '七夕节',
  '中元节', '中秋节', '重阳节', '国庆节', '劳动节', '圣诞节'
]);
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

// 为农历日历筛选节日，并补上部分库版本没有内置的中元节。
function calendarFestivals(solar, lunar) {
  const inferred = lunar.getMonth() === 7 && lunar.getDay() === 15 ? ['中元节'] : [];
  return unique([
    ...solar.getFestivals(),
    ...solar.getOtherFestivals(),
    ...lunar.getFestivals(),
    ...inferred
  ]).filter((name) => calendarFestivalNames.has(name));
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

// 把年、月、日三柱共六个干支统一拆成五行计数，供日历做每日能量对照。
function countPillarElements(pillars) {
  const counts = { 金: 0, 水: 0, 木: 0, 火: 0, 土: 0 };
  pillars.forEach(({ gan, zhi }) => {
    counts[ganElement[gan]] += 1;
    counts[zhiElement[zhi]] += 1;
  });
  return counts;
}

// 生成一个公历年的每一天；农历文本、闰月、节气与三柱全部来自 lunar-javascript。
function collectLunarCalendarYear(year) {
  return localDateRange(`${year}-01-01`, `${year}-12-31`).map((date) => {
    const solar = solarParts(date);
    const lunar = solar.getLunar();
    const eight = lunar.getEightChar();
    const yearGan = eight.getYearGan();
    const yearZhi = eight.getYearZhi();
    const monthGan = eight.getMonthGan();
    const monthZhi = eight.getMonthZhi();
    const dayGan = eight.getDayGan();
    const dayZhi = eight.getDayZhi();
    const dayStemElement = ganElement[dayGan];
    const dayBranchElement = zhiElement[dayZhi];
    const elementCounts = countPillarElements([
      { gan: yearGan, zhi: yearZhi },
      { gan: monthGan, zhi: monthZhi },
      { gan: dayGan, zhi: dayZhi }
    ]);
    const metalWaterScore = elementCounts.金 + elementCounts.水;
    const earthScore = elementCounts.土;
    const dayMetalWaterScore = Number(['金', '水'].includes(dayStemElement)) + Number(['金', '水'].includes(dayBranchElement));
    const dayEarthScore = Number(dayStemElement === '土') + Number(dayBranchElement === '土');
    const dominantCount = Math.max(...Object.values(elementCounts));
    const dominantElements = Object.entries(elementCounts).filter(([, count]) => count === dominantCount).map(([element]) => element);
    const solarTerm = solarTermNames[lunar.getJieQi()] ?? lunar.getJieQi();
    const festivals = calendarFestivals(solar, lunar);
    const priceRow = priceByDate.get(date);
    const previousPrice = previousPriceByDate.get(date);
    const returnPct = priceRow && previousPrice ? Number(((priceRow.price / previousPrice - 1) * 100).toFixed(4)) : null;
    let energyLabel = '平衡观察';
    if (dayMetalWaterScore && dayEarthScore) energyLabel = '金水 · 土并见';
    else if (dayMetalWaterScore === 2) energyLabel = '金水双强日';
    else if (dayMetalWaterScore === 1) energyLabel = '金水属性日';
    else if (dayEarthScore) energyLabel = '土属性日';
    return {
      date,
      price: priceRow?.price ?? null,
      previousPrice,
      returnPct,
      priceAvailable: Boolean(priceRow),
      year,
      month: Number(date.slice(5, 7)),
      day: Number(date.slice(8, 10)),
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      lunarText: lunar.toString(),
      lunarYear: lunar.getYear(),
      lunarMonth: lunar.getMonth(),
      lunarDay: lunar.getDay(),
      lunarYearText: lunar.getYearInChinese(),
      lunarMonthText: lunar.getMonthInChinese(),
      lunarDayText: lunar.getDayInChinese(),
      zodiac: lunar.getYearShengXiao(),
      yearPillar: `${yearGan}${yearZhi}`,
      monthPillar: `${monthGan}${monthZhi}`,
      dayPillar: `${dayGan}${dayZhi}`,
      yearElements: `${ganElement[yearGan]} / ${zhiElement[yearZhi]}`,
      monthElements: `${ganElement[monthGan]} / ${zhiElement[monthZhi]}`,
      dayElements: `${dayStemElement} / ${dayBranchElement}`,
      elementCounts,
      metalWaterScore,
      earthScore,
      dayMetalWaterScore,
      dayEarthScore,
      isMetalWaterDay: dayMetalWaterScore > 0,
      isEarthDay: dayEarthScore > 0,
      dominantElements,
      energyLabel,
      solarTerm,
      festivals
    };
  });
}

// 用已知春节日期校对农历转换，库升级或时区处理发生偏差时立即停止写出错误数据。
function verifyLunarCalendar() {
  const samples = [
    ['2011-02-03', 2011, 1, 1],
    ['2024-02-10', 2024, 1, 1],
    ['2025-01-29', 2025, 1, 1],
    ['2026-02-17', 2026, 1, 1]
  ];
  samples.forEach(([date, expectedYear, expectedMonth, expectedDay]) => {
    const lunar = solarParts(date).getLunar();
    if (lunar.getYear() !== expectedYear || lunar.getMonth() !== expectedMonth || lunar.getDay() !== expectedDay) {
      throw new Error(`农历校对失败：${date} -> ${lunar.toString()}`);
    }
  });
}

// 日历按年拆分，页面只加载所选年份，避免一次下载三十多年的每日记录。
function writeLunarCalendars(startYear, endYear) {
  verifyLunarCalendar();
  fs.mkdirSync(lunarCalendarDir, { recursive: true });
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const days = collectLunarCalendarYear(year);
    fs.writeFileSync(path.join(lunarCalendarDir, `${year}.json`), JSON.stringify({ year, days }));
    years.push(year);
  }
  fs.writeFileSync(path.join(lunarCalendarDir, 'index.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    startYear,
    endYear,
    years,
    priceReference: 'BTC 日线来自 data/btc_daily.csv；本地构建可用 BTC_DAILY_CSV 指向外部参考文件',
    eventPolicy: '仅保留二十四节气与主要节日；中元节按农历七月十五补充',
    calendar: '公历日期按 UTC 日界；农历与年月日柱由 lunar-javascript 计算；不推断时柱',
    verifiedSamples: ['2011-02-03', '2024-02-10', '2025-01-29', '2026-02-17']
  }));
  return years.length;
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
// 固定生成 2011—2026 年完整节气历史，页面可按年份筛选并复核月柱切换。
const historicalSolarTerms = collectSolarTermForecast('2011-01-01', '2026-12-31');
const lunarCalendarYears = writeLunarCalendars(2011, 2042);
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
console.log(`生成 ${outputPath}: ${daily.length} 条日线，${dingYouMonths.length} 个丁酉月，${lunarCalendarYears} 年农历日历`);
