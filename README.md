# BTC 五行周期研究

一个可直接部署到 GitHub Pages 的静态研究面板，把 BTC 公历日线、农历日期、八字日柱元素和丁酉月窗口放到同一张研究桌上。

## 页面内容

- **价格与走势**：源站 CSV 的 90 天、1 年和全历史收盘价图，附最新 14 天价格表。
- **农历能量日历**：按 UTC 公历日展示农历简写、日柱、金水强度与当日涨跌。
- **节日筛选**：事件栏只显示 24 节气，以及中秋节、国庆节、春节、圣诞节；其他节日不标注。
- **历史价格证据**：日历下方提供日内最高、最低、收盘价；OHLC 使用独立 BTC-USD 日线来源，早期无覆盖时显示为空。
- **土属性红色标记**：日干或日支为土的日期统一红色标识；2025-10-11 癸丑、2025-10-17 己未额外显示 `📌` 低点关注。
- **金水日回测**：对比全样本、金水日、金水双强日的上涨率、平均回报和中位数。
- **丁酉月周期**：展示 2011、2016、2021、2026 已覆盖样本，以及 2031、2036、2041 的未来节气窗口。
- **历史节气与五行月柱**：提供独立页面 [`historical-terms.html`](https://steven-air.github.io/bithuang-jinshui/historical-terms.html)，按年份查看 2011—2026 年 384 条节气记录；主研究页也保留同一张表。
- **未来节气五行**：单列当前日期后至 2042 年底的全部节气，支持按年份筛选，展示北京时间、节气月柱、月干五行与月支五行；未来日期不填充价格。
- **完整农历日历**：提供独立页面 [`lunar-calendar.html`](https://steven-air.github.io/bithuang-jinshui/lunar-calendar.html)，支持选择 2011—2042 年和月份，逐日展示公历、农历、生肖、年柱 / 月柱 / 日柱、六字五行计数、金水与土属性能量；金水用绿色、土属性用红色。每年数据拆分在 `data/lunar-calendar/`，闰月与节气由 `lunar-javascript` 直接计算。
- **方法与来源**：公开 CSV、`lunar-javascript` API 链路和本地重建命令。

## 本地运行

```powershell
cd jinshui-reading
node scripts/build-data.js
python -m http.server 4174
```

然后打开 <http://localhost:4174>。直接双击 `index.html` 可能被浏览器的本地文件策略拦截 `fetch`，建议使用静态服务器。

## 数据重建

`data/btc_daily.csv` 是参考站公开文件的本地副本。`scripts/build-data.js` 使用 `lunar-javascript` 计算：

- `Solar → Lunar → EightChar` 的农历、日柱和节气月柱；
- 日干或日支包含金 / 水时标记为金水日；同时保留 0、1、2 级强度；
- 日干或日支为土时标记为土属性日，红色显示；金水日跌幅在 1% 内额外归为“中性偏弱”；
- `npm run fetch:ohlc` 从 Yahoo Finance BTC-USD 日线更新最高 / 最低 / 收盘字段；
- `npm run sync:data` 先拉取 Btbjb 收盘 CSV，再使用公开 Yahoo Finance Chart API 补齐 CSV 尚未覆盖的昨天及最新日线；主 CSV 暂时不可用时保留本地快照并继续补齐。
- 相邻收盘价的日回报、上涨率、平均值和中位数；
- 2010-01-01 至 2042-12-31 的丁酉月节气日期窗口。
- 当前日期后至 2042-12-31 的节气精确时刻与节气月柱五行表。
- 2011-01-01 至 2026-12-31 的完整节气精确时刻与节气月柱五行表（每年 24 条）。
- 2011-01-01 至 2042-12-31 的逐日农历 / 三柱 / 五行日历；构建时自动校对 2011、2024、2025、2026 春节正月初一。

运行脚本会覆盖 `data/analysis.json`。原始 CSV 不会被修改。

## GitHub Pages

仓库已配置 `.github/workflows/pages.yml`：推送到 `main` 后会自动发布静态站点，页面没有构建步骤，`data/analysis.json` 是静态数据层。

公开地址：<https://steven-air.github.io/bithuang-jinshui/>

历史节气专页：<https://steven-air.github.io/bithuang-jinshui/historical-terms.html>

农历日历专页：<https://steven-air.github.io/bithuang-jinshui/lunar-calendar.html>

自动同步：GitHub Actions 每天 UTC 02:17 执行 `.github/workflows/sync-data.yml`；手动同步可在该工作流点击 **Run workflow**。本地同步后提交：

```powershell
npm run sync:data
git add data
git commit -m "同步 BTC 价格与五行分析"
git push
```

## 口径说明

- 数据按源站的 UTC 日线收盘价；农历转换按公历日期，不推断时柱。
- “上涨正确率” = 当日收盘价高于前一日收盘价的样本占比；平盘单列。
- 2026 丁酉月截至数据日尚未结束，页面标注为“未完结”，不会混入已完成丁酉月汇总。
- 回测是描述性统计，不控制趋势、波动率、年份结构和多重比较，不能单独作为交易信号。
