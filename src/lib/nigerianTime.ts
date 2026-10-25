// Cydex runs on Nigerian time (Africa/Lagos, UTC+1), like the database.
// toISOString() gives the UTC date, which is the day before between midnight
// and 1 am, so dates sent to the database are worked out here instead.

const DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });

// "2026-10-26": the date in Nigeria at that moment (default: now)
export const nigerianDate = (at: Date = new Date()) => DATE.format(at);

// Days before (or after, if negative) a Nigerian date, as "YYYY-MM-DD"
export const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Sunday of this week and the 1st of this month, in Nigeria
export const nigerianWeekStart = (at: Date = new Date()) => {
  const today = nigerianDate(at);
  return shiftDate(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
};
export const nigerianMonthStart = (at: Date = new Date()) => `${nigerianDate(at).slice(0, 8)}01`;
