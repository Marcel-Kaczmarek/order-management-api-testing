/**
 * Load test: sustained, expected concurrent usage (ramp → steady state → ramp down).
 */
import {
  setup as baseSetup,
  userFlow,
  thresholds,
  summaryTrendStats,
  buildSummary,
} from './lib/common.js';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '3m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds,
  summaryTrendStats,
};

export const setup = baseSetup;
export default function (data) {
  userFlow(data);
}
export const handleSummary = buildSummary('load');
