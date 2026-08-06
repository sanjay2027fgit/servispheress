const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const otpServicePath = require.resolve('../utils/otpService');

test('sendOtpEmail retries with the Resend sandbox sender when the configured sender is rejected', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'noreply@servisphere.app';

  const calls = [];
  class MockResend {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    emails = {
      send: async (params) => {
        calls.push(params.from);
        if (params.from === 'noreply@servisphere.app') {
          return { error: { message: 'domain is not verified' } };
        }
        return { data: { id: 'mock-email-id' } };
      }
    };
  }

  const originalLoad = Module._load;

  try {
    Module._load = function (request, parent, isMain) {
      if (request === 'resend') {
        return { Resend: MockResend };
      }
      return originalLoad.apply(this, arguments);
    };

    delete require.cache[otpServicePath];
    const otpService = require('../utils/otpService');

    const result = await otpService.sendOtpEmail('user@example.com', '123456');

    assert.equal(result.data.id, 'mock-email-id');
    assert.deepEqual(calls, ['noreply@servisphere.app', 'onboarding@resend.dev']);
  } finally {
    Module._load = originalLoad;
    delete require.cache[otpServicePath];
  }
});
