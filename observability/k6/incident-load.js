import http from 'k6/http';
import { check, sleep } from 'k6';

const target = __ENV.TARGET_BASE_URL || 'http://localhost:8080';
/** Max allowed HTTP failure rate for lab/demo (OTel demo returns errors on some paths under load). Override: K6_HTTP_FAIL_MAX_RATE=0.5 */
const parsedFailMax = Number(__ENV.K6_HTTP_FAIL_MAX_RATE);
const httpFailMaxRate =
  Number.isFinite(parsedFailMax) && parsedFailMax > 0 && parsedFailMax <= 1 ? parsedFailMax : 0.42;

export const options = {
  vus: Number(__ENV.K6_VUS || 20),
  duration: __ENV.K6_DURATION || '10m',
  thresholds: {
    http_req_failed: [`rate<${httpFailMaxRate}`],
    http_req_duration: ['p(95)<2500'],
  },
};

export default function () {
  const responses = http.batch([
    ['GET', `${target}/`],
    ['GET', `${target}/api/products`],
    ['GET', `${target}/api/recommendations`],
  ]);

  for (const response of responses) {
    check(response, {
      'request completed': (res) => res.status > 0,
    });
  }

  sleep(1);
}
