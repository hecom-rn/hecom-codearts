/**
 * 中国法定节假日配置
 *
 * 配置说明：
 * - festivals: 按节日类型组织的假期配置
 * - adjustedWorkdays: 按月份组织的调休工作日
 * - bigSmallWeekWorkdays: 按月份组织的大小周制度工作日
 *
 * 数据来源：国务院办公厅每年发布的节假日安排通知
 */

/** 法定节假日枚举 */
enum FestivalType {
  NewYear = '元旦',
  SpringFestival = '春节',
  TombSweepingDay = '清明节',
  LaborDay = '劳动节',
  DragonBoatFestival = '端午节',
  MidAutumnFestival = '中秋节',
  NationalDay = '国庆节',
}

/** 节日配置 */
interface FestivalConfig {
  type: FestivalType;
  dates: string[];
  adjustedDays?: string[]; // 该节日对应的调休工作日
}

/** 年度假期配置 */
interface HolidayConfig {
  festivals: Record<FestivalType, FestivalConfig>; // 法定节假日列表
  bigWeekWorkdays: [
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
    string[],
  ];
}

export const HOLIDAYS: Record<string, HolidayConfig> = {
  '2026': {
    festivals: {
      [FestivalType.NewYear]: {
        type: FestivalType.NewYear,
        dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
        adjustedDays: ['2026-01-04'], // 1月4日（周日）上班
      },
      [FestivalType.SpringFestival]: {
        type: FestivalType.SpringFestival,
        dates: [
          '2026-02-15',
          '2026-02-16',
          '2026-02-17',
          '2026-02-18',
          '2026-02-19',
          '2026-02-20',
          '2026-02-21',
          '2026-02-22',
          '2026-02-23',
        ],
        adjustedDays: [
          '2026-02-14', // 2月14日（周六）上班
          '2026-02-28', // 2月28日（周六）上班
        ],
      },
      [FestivalType.TombSweepingDay]: {
        type: FestivalType.TombSweepingDay,
        dates: ['2026-04-04', '2026-04-05', '2026-04-06'],
      },
      [FestivalType.LaborDay]: {
        type: FestivalType.LaborDay,
        dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
        adjustedDays: ['2026-05-09'], // 5月9日（周六）上班
      },
      [FestivalType.DragonBoatFestival]: {
        type: FestivalType.DragonBoatFestival,
        dates: ['2026-06-22', '2026-06-23', '2026-06-24'],
      },
      [FestivalType.MidAutumnFestival]: {
        type: FestivalType.MidAutumnFestival,
        dates: ['2026-09-29', '2026-09-30', '2026-10-01'],
      },
      [FestivalType.NationalDay]: {
        type: FestivalType.NationalDay,
        dates: [
          '2026-10-01',
          '2026-10-02',
          '2026-10-03',
          '2026-10-04',
          '2026-10-05',
          '2026-10-06',
          '2026-10-07',
        ],
        adjustedDays: [
          '2026-10-08', // 10月8日（周日）上班
        ],
      },
    },
    bigWeekWorkdays: [
      ['2026-01-17', '2026-01-31'],
      ['2026-02-07', '2026-02-21'],
      ['2026-03-07', '2026-03-21'],
      ['2026-04-11', '2026-04-25'],
      ['2026-05-16', '2026-05-30'], // ?
      ['2026-06-13', '2026-06-27'],
      ['2026-07-11', '2026-07-25'],
      ['2026-08-08', '2026-08-22'],
      ['2026-09-05', '2026-09-19'],
      ['2026-10-17', '2026-10-31'],
      ['2026-11-14', '2026-11-28'],
      ['2026-12-12', '2026-12-26'],
    ],
  },
};

/**
 * 判断是否为周末（周六或周日）
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 判断是否为工作日
 */
export function isWorkday(date: Date, year: string): boolean {
  const dateStr = formatDate(date);
  const yearConfig = HOLIDAYS[year];

  if (!yearConfig) {
    return !isWeekend(date);
  }

  // 检查是否在法定节假日中
  for (const festival of Object.values(yearConfig.festivals)) {
    if (festival.dates.includes(dateStr)) {
      return false;
    }
    // 检查是否是该节日的调休工作日
    if (festival.adjustedDays?.includes(dateStr)) {
      return true;
    }
  }

  // 检查是否在大小周工作日中
  for (const workdays of yearConfig.bigWeekWorkdays) {
    if (workdays.includes(dateStr)) {
      return true;
    }
  }

  return !isWeekend(date);
}

/**
 * 计算工作日
 * @param year 年份
 * @returns 应计工作日天数
 */
export function calculateExpectedWorkdays(year: string): number {
  const yearNum = parseInt(year);
  const currentYear = new Date().getFullYear();
  const currentDate = new Date();

  let endDate: Date;

  if (yearNum < currentYear) {
    // 历史年份，计算全年
    endDate = new Date(yearNum, 11, 31);
  } else if (yearNum === currentYear) {
    // 当前年份，计算到今天
    endDate = currentDate;
  } else {
    // 未来年份，返回0
    return 0;
  }

  const startDate = new Date(yearNum, 0, 1);
  let workdays = 0;

  // 遍历每一天
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (isWorkday(d, year)) {
      workdays++;
    }
  }

  return workdays;
}
