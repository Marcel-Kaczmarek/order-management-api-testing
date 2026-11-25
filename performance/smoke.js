/**
 * Smoke performance test: minimal load to verify the scripts, the environment
 * and the thresholds work before running heavier profiles.
 */
import {
  setup as baseSetup,
  userFlow,
  thresholds,
  summaryTrendStats,
  buildSummary,
} from './lib/common.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds,
  summaryTrendStats,
};

export const setup = baseSetup;
export default function (data) {
  userFlow(data);
}
export const handleSummary = buildSummary('smoke');
