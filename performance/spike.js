/**
 * Spike test: sudden surge from a low baseline, then recovery. Verifies the API
 * absorbs a burst and returns to baseline latency afterwards.
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
    spike: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '10s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '10s', target: 5 },
        { duration: '30s', target: 5 },
        { duration: '10s', target: 0 },
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
export const handleSummary = buildSummary('spike');
