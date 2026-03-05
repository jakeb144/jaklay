// Shared plan limits — used by both client and server
export const PLAN_LIMITS = {
  free:       { runs: 100,    rows: 500,    label: 'Free' },
  starter:    { runs: 2000,   rows: 10000,  label: 'Starter' },
  pro:        { runs: 999999, rows: 999999, label: 'Pro' },
  enterprise: { runs: 999999, rows: 999999, label: 'Enterprise' },
  admin:      { runs: 999999, rows: 999999, label: 'Admin' },
};

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}
