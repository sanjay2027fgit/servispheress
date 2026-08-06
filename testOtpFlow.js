#!/usr/bin/env node
/**
 * Test script for OTP signup flow
 * Usage: node testOtpFlow.js
 */

const http = require('http');

const API_BASE = 'http://localhost:5000';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testOtpFlow() {
  console.log('🧪 Testing Servisphere OTP Signup Flow\n');

  const testEmail = 'test.signup@gmail.com'; // Use a real Gmail
  const testPassword = 'TestPassword123!';

  console.log(`📧 Test Email: ${testEmail}`);
  console.log(`🔐 Test Password: ${testPassword}`);
  console.log(`\n⏳ Sending OTP... (check your Gmail inbox for OTP)\n`);

  try {
    // Step 1: Send OTP
    console.log('1️⃣  Sending OTP...');
    let res = await makeRequest('POST', '/api/auth/send-otp', {
      email: testEmail,
      role: 'user'
    });
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, res.data);
    
    if (res.status !== 200) {
      console.error('❌ Failed to send OTP');
      return;
    }

    // Extract OTP from message (in dev mode it's shown in backend console)
    console.log('\n✅ OTP sent! (Check backend terminal for OTP in dev mode)');
    console.log('⏳ Waiting 2 seconds...\n');

    // In production, user would receive email. In dev mode, we need to check backend console
    // For testing, we can extract from logs or manually enter
    let otpValue = '';
    
    // Try common test OTP values
    const commonOtps = ['123456', '000000', '111111'];
    
    console.log('2️⃣  Attempting OTP verification with test values...');
    for (const testOtp of commonOtps) {
      console.log(`   Trying OTP: ${testOtp}`);
      
      res = await makeRequest('POST', '/api/auth/signup/user', {
        email: testEmail,
        password: testPassword,
        otp: testOtp
      });
      
      console.log(`   Response: ${res.status} - ${res.data.message}`);
      
      if (res.status === 201) {
        console.log('\n✅ User signup successful!');
        console.log(`   User ID: ${res.data._id}`);
        console.log(`   Email: ${res.data.email}`);
        console.log(`   Token: ${res.data.token.substring(0, 20)}...`);
        otpValue = testOtp;
        break;
      }
    }

    if (!otpValue) {
      console.log('\n⚠️  Signup with common test OTPs failed.');
      console.log('📌 In development mode:');
      console.log('   1. Check backend console for: "⚠️ [DEV MODE] OTP for..."');
      console.log('   2. Use that OTP in the signup form');
      console.log('   3. Or modify this script to include the OTP from backend logs\n');
      return;
    }

    // Step 3: Login
    console.log('3️⃣  Testing login with credentials...');
    res = await makeRequest('POST', '/api/auth/login/user', {
      email: testEmail,
      password: testPassword
    });
    
    console.log(`   Status: ${res.status}`);
    console.log(`   Response:`, res.data);

    if (res.status === 200) {
      console.log('\n✅ Login successful!');
      console.log(`   Token: ${res.data.token.substring(0, 20)}...`);
    } else {
      console.log('\n❌ Login failed');
    }

    console.log('\n✅ OTP Flow Test Complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n⚠️  Make sure backend is running:');
    console.error('   cd backend && node server.js');
  }
}

testOtpFlow();
