import type { UsageSummary } from '@client/shared/utils/usageTracker';

export type UsageHeatmapRange = 'year' | 'half_year' | 'quarter' | 'rolling';

export interface UsageHeatmapCell {
  dateKey: string;
  dayName: string;
  count: number;
  tokens: number;
  costUsd: number;
  costRmb: number;
  imageCount: number;
  videoCount: number;
  promptTokens: number;
  completionTokens: number;
  isToday: boolean;
  isFuture: boolean;
}

export function buildUsageHeatmap(usageSummary: Pick<UsageSummary, 'heatmapActiveMap' | 'heatmapDetailsMap'>, heatmapRange: UsageHeatmapRange, currentYear: number, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let calendarStart: Date;
    let totalWeeks: number;

    if (heatmapRange === 'year') {
      // 🌟 当年全景：以当前年份 (如 2026) 1 月 1 日所在自然周周一为起点，整年 53 周全景
      const jan1 = new Date(currentYear, 0, 1);
      const jan1DayOfWeek = jan1.getDay() === 0 ? 6 : jan1.getDay() - 1; // 0=周一, 6=周日
      calendarStart = new Date(jan1);
      calendarStart.setDate(jan1.getDate() - jan1DayOfWeek);
      const yearDays = (Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1)) / 86400000;
      totalWeeks = Math.ceil((jan1DayOfWeek + yearDays) / 7);
    } else {
      totalWeeks = heatmapRange === 'quarter' ? 13 : heatmapRange === 'half_year' ? 26 : 53;
      // 以本周周日为截止基准倒推对应周数
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const daysUntilSunday = 6 - dayOfWeek;
      const calendarEnd = new Date(today);
      calendarEnd.setDate(today.getDate() + daysUntilSunday);
      calendarStart = new Date(calendarEnd);
      calendarStart.setDate(calendarEnd.getDate() - (totalWeeks * 7 - 1));
    }

    const weeks: {
      weekIdx: number;
      monthLabel?: string;
      days: UsageHeatmapCell[];
    }[] = [];

    const cursor = new Date(calendarStart);
    let lastLabelWeek = -99;
    const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    for (let w = 0; w < totalWeeks; w++) {
      const days: UsageHeatmapCell[] = [];

      let containsDay1 = false;
      let day1Month = -1;

      for (let d = 0; d < 7; d++) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth() + 1;
        const dayOfMonth = cursor.getDate();
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
        
        // 检查当周是否包含新月第一天 (1号)
        if (dayOfMonth === 1) {
          containsDay1 = true;
          day1Month = month;
        }

        const isToday = dateKey === todayKey;
        const outsideYear = heatmapRange === 'year' && year !== currentYear;
        const isFuture = cursor > today || outsideYear;

        const count = isFuture ? 0 : usageSummary.heatmapActiveMap?.[dateKey] || 0;
        const details = usageSummary.heatmapDetailsMap?.[dateKey];
        days.push({
          dateKey,
          dayName: DAY_NAMES[d],
          count,
          tokens: details?.tokens || 0,
          costUsd: details?.costUsd || 0,
          costRmb: details?.costRmb || 0,
          imageCount: details?.imageCount || 0,
          videoCount: details?.videoCount || 0,
          promptTokens: details?.promptTokens || 0,
          completionTokens: details?.completionTokens || 0,
          isToday,
          isFuture,
        });

        cursor.setDate(cursor.getDate() + 1);
      }

      // 🌟 月份标签防碰撞与干净排布算法
      let monthLabel: string | undefined = undefined;

      if (heatmapRange === 'year') {
        if (w === 0) {
          // 当前年第一周固定标 1月
          monthLabel = '1月';
          lastLabelWeek = 0;
        } else if (containsDay1) {
          // 每个新月 1 号所在周标明月份，至少间隔 4 周且排除年底边缘的次年 1 月
          if (w - lastLabelWeek >= 4 && !(day1Month === 1 && w > 45)) {
            monthLabel = `${day1Month}月`;
            lastLabelWeek = w;
          }
        }
      } else if (w === 0) {
        monthLabel = `${Number(days[0]?.dateKey.slice(5, 7))}月`;
        lastLabelWeek = 0;
      } else if (containsDay1 && w - lastLabelWeek >= 2) {
        monthLabel = `${day1Month}月`;
        lastLabelWeek = w;
      }

      weeks.push({ weekIdx: w, monthLabel, days });
    }
    return weeks;
}
