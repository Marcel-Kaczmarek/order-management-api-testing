/**
 * Runs the Postman collection with Newman (CLI, HTML and JUnit reporters).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import newman from 'newman';
import { env } from '../src/config/env';
import { bypassProxyForLocalhost } from './lib';

bypassProxyForLocalhost();

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'reports', 'newman');
mkdirSync(out, { recursive: true });

newman.run(
  {
    collection: path.join(root, 'postman', 'collections', 'orderflow-api.postman_collection.json'),
    environment: path.join(root, 'postman', 'environments', 'local.postman_environment.json'),
    envVar: [
      { key: 'baseUrl', value: `${env.API_BASE_URL.replace(/\/$/, '')}/api` },
      { key: 'adminEmail', value: env.ADMIN_EMAIL },
      { key: 'adminPassword', value: env.ADMIN_PASSWORD },
    ],
    reporters: ['cli', 'htmlextra', 'junit'],
    reporter: {
      htmlextra: {
        export: path.join(out, 'newman-report.html'),
        title: 'OrderFlow API – Postman/Newman run',
        // Never render tokens/passwords in the shared HTML report.
        hideRequestBody: ['Login as admin', 'Login as customer', 'Register customer'],
        hideResponseBody: ['Login as admin', 'Login as customer', 'Register customer'],
        skipSensitiveData: true,
      },
      junit: { export: path.join(out, 'newman-junit.xml') },
    },
    timeoutRequest: 10_000,
  },
  (error, summary) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    const failures = summary.run.failures.length;
    console.log(
      `\nNewman finished with ${failures} failure(s). Report: reports/newman/newman-report.html`,
    );
    process.exit(failures > 0 ? 1 : 0);
  },
);
