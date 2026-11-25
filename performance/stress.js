/**
 * Stress test: increases load step by step beyond the expected level to find
 * where latency or error-rate thresholds break. A threshold failure here is a
 * finding (capacity limit), recorded in docs/test-execution-summary.md.
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
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 25 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 150 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds,
  summaryTrendStats,
};

export const setup = baseSetup;
export default function (data) {
  userFlow(data);
}
export const handleSummary = buildSummary('stress');
