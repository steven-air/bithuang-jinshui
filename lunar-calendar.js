// 独立农历日历：按年懒加载每日数据，并渲染公历月视图与三柱五行明细。
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (selector) => document.querySelector(selector);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const yearCache = new Map();
  const today = new Date();

  // 所有数据来自站内构建产物，仅在载入失败时向页面报告具体文件。
  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  const index = await fetchJson('data/lunar-calendar/index.json');
  const yearSelect = $('#lunar-year-select');
  const monthSelect = $('#lunar-month-select');
  yearSelect.innerHTML = index.years.map((year) => `<option value="${year}">${year} 年</option>`).join('');
  monthSelect.innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1} 月</option>`).join('');
  $('#calendar-range').textContent = `${index.startYear} — ${index.endYear}`;
  $('#calendar-generated-at').textContent = `数据生成 ${new Date(index.generatedAt).toLocaleString('zh-CN', { hour12: false })}`;

  const params = new URLSearchParams(window.location.search);
  const requestedYear = Number(params.get('year'));
  const requestedMonth = Number(params.get('month'));
  const fallbackYear = Math.min(Math.max(today.getFullYear(), index.startYear), index.endYear);
  let selectedYear = index.years.includes(requestedYear) ? requestedYear : fallbackYear;
  let selectedMonth = requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : today.getMonth() + 1;

  // 单日可能同时含金水与土，保留双标签与双边框，不让一种属性覆盖另一种属性。
  function energyClass(day) {
    if (day.isMetalWaterDay && day.isEarthDay) return 'mixed';
    if (day.isMetalWaterDay) return 'metal-water';
    if (day.isEarthDay) return 'earth';
    return 'neutral';
  }

  function energyTags(day) {
    const tags = [];
    if (day.isMetalWaterDay) tags.push('<span class="energy-tag metal-water-tag">金水</span>');
    if (day.isEarthDay) tags.push('<span class="energy-tag earth-tag">土</span>');
    if (!tags.length) tags.push('<span class="energy-tag neutral-tag">其他</span>');
    return tags.join('');
  }

  // 五行计数覆盖年、月、日三柱六个干支，并保持固定顺序便于横向比较。
  function renderElementCounts(counts) {
    return ['金', '水', '木', '火', '土'].map((element) => `<span class="element-count element-${element}">${element}${counts[element]}</span>`).join('');
  }

  async function loadYear(year) {
    if (!yearCache.has(year)) yearCache.set(year, fetchJson(`data/lunar-calendar/${year}.json`));
    return yearCache.get(year);
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('year', selectedYear);
    url.searchParams.set('month', selectedMonth);
    window.history.replaceState({}, '', url);
  }

  // 月视图同时呈现准确农历、三柱和日柱五行，详细计数放在下方表格中。
  async function renderCalendar() {
    yearSelect.value = String(selectedYear);
    monthSelect.value = String(selectedMonth);
    const dataset = await loadYear(selectedYear);
    const days = dataset.days.filter((day) => day.month === selectedMonth);
    const first = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
    const leading = (first.getUTCDay() + 6) % 7;
    const cells = Array.from({ length: leading }, () => '<div class="full-lunar-day empty" aria-hidden="true"></div>');
    days.forEach((day) => {
      const lunarDate = day.lunarDay === 1 ? `${day.lunarMonthText}月初一` : day.lunarDayText;
      const events = [day.solarTerm, ...day.festivals].filter(Boolean);
      cells.push(`<article class="full-lunar-day ${energyClass(day)}"><div class="lunar-day-head"><strong>${day.day}</strong><span>周${weekdays[day.weekday]}</span></div><div class="lunar-date">农历${lunarDate}</div><div class="pillar-stack"><span><b>年</b>${day.yearPillar}<em>${day.yearElements}</em></span><span><b>月</b>${day.monthPillar}<em>${day.monthElements}</em></span><span><b>日</b>${day.dayPillar}<em>${day.dayElements}</em></span></div><div class="day-energy-row">${energyTags(day)}<small>${day.energyLabel}</small></div>${events.length ? `<div class="lunar-events">${events.join(' · ')}</div>` : ''}</article>`);
    });
    $('#full-lunar-grid').innerHTML = cells.join('');
    $('#lunar-detail-table').innerHTML = days.map((day) => {
      const events = [day.solarTerm, ...day.festivals].filter(Boolean).join(' · ') || '—';
      return `<tr><td>${day.date} 周${weekdays[day.weekday]}</td><td>${day.lunarText}</td><td>${day.zodiac}</td><td>${day.yearPillar} · ${day.yearElements}</td><td>${day.monthPillar} · ${day.monthElements}</td><td class="${day.isEarthDay ? 'earth-text' : day.isMetalWaterDay ? 'metal-water-text' : ''}">${day.dayPillar} · ${day.dayElements}</td><td><div class="element-counts">${renderElementCounts(day.elementCounts)}</div></td><td><div class="table-energy">${energyTags(day)}<span>${day.energyLabel}</span></div></td><td>${events}</td></tr>`;
    }).join('');
    const metalWaterDays = days.filter((day) => day.isMetalWaterDay).length;
    const earthDays = days.filter((day) => day.isEarthDay).length;
    const terms = days.filter((day) => day.solarTerm).map((day) => `${day.solarTerm} ${day.date.slice(5)}`);
    $('#lunar-month-title').textContent = `${selectedYear} 年 ${selectedMonth} 月 · ${days.length} 天`;
    $('#metal-water-days').textContent = `${metalWaterDays} 天`;
    $('#earth-days').textContent = `${earthDays} 天`;
    $('#solar-term-days').textContent = terms.join(' / ') || '本月无节气记录';
    $('#lunar-detail-title').textContent = `${selectedYear} 年 ${selectedMonth} 月每日明细`;
    updateUrl();
  }

  async function changeMonth(delta) {
    const next = new Date(Date.UTC(selectedYear, selectedMonth - 1 + delta, 1));
    const year = next.getUTCFullYear();
    if (!index.years.includes(year)) return;
    selectedYear = year;
    selectedMonth = next.getUTCMonth() + 1;
    await renderCalendar();
  }

  yearSelect.addEventListener('change', async () => { selectedYear = Number(yearSelect.value); await renderCalendar(); });
  monthSelect.addEventListener('change', async () => { selectedMonth = Number(monthSelect.value); await renderCalendar(); });
  $('#previous-month').addEventListener('click', () => changeMonth(-1));
  $('#next-month').addEventListener('click', () => changeMonth(1));
  $('#current-month').addEventListener('click', async () => {
    selectedYear = fallbackYear;
    selectedMonth = today.getMonth() + 1;
    await renderCalendar();
  });

  const themeToggle = $('#calendar-theme-toggle');
  if (localStorage.getItem('btc-energy-theme') === 'dark') document.body.classList.add('dark');
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('btc-energy-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });

  await renderCalendar();
  if (window.lucide) window.lucide.createIcons();
});
