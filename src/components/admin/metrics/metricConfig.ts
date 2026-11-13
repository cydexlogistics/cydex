// ---------------------------------------------------------------------------
// Badge colour per metric. Every metric starts with invertColor: false
// (green = up, red = down). Set it to true where lower is better, e.g. churn,
// dormant users or the delivery and preparation times.
// ---------------------------------------------------------------------------
export const METRIC_CONFIG = {
  opens_customer: { invertColor: false },
  opens_rider: { invertColor: false },
  opens_vendor: { invertColor: false },
  total_customers: { invertColor: false },
  peak_customer: { invertColor: false },
  peak_rider: { invertColor: false },
  peak_vendor: { invertColor: false },
  dormant_customer: { invertColor: false },
  dormant_rider: { invertColor: false },
  dormant_vendor: { invertColor: false },
  churn_customer: { invertColor: false },
  churn_rider: { invertColor: false },
  churn_vendor: { invertColor: false },
  fulfilment_customer: { invertColor: false },
  fulfilment_vendor: { invertColor: false },
  fulfilment_rider: { invertColor: false },
  delivery_time: { invertColor: false },
  prep_time: { invertColor: false },
  active_vendor: { invertColor: false },
  active_rider: { invertColor: false },
  active_customer: { invertColor: false },
} satisfies Record<string, { invertColor: boolean }>;

export type MetricId = keyof typeof METRIC_CONFIG;

// 0 -> "12am", 13 -> "1pm"
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
