# OTP Signup Testing Guide

## ✅ Current Status
- Backend server running on `http://localhost:5000`
- MongoDB connected
- Email service configured (uses Gmail SMTP)
- OTP system working and tested

## 🧪 How to Test Signup (User)

### Step 1: Open Signup Page
```
http://localhost:5000/user/signup.html
```

### Step 2: Enter Email
- Use any valid email address (Gmail recommended for testing)
- Examples:
  - `yourname@gmail.com`
  - `test123@gmail.com`

### Step 3: Click "Send OTP"
- Wait for confirmation message
- **Check your email inbox** for OTP code
- OTP arrives within 30 seconds

### Step 4: Enter OTP
- Copy OTP from email
- Paste into "Enter OTP" field
- Click "Create Account"

### Step 5: Verify Signup Success
- Should see: "Account created successfully! Please login."
- Redirects to login page

### Step 6: Login
- Use same email and password
- Click login
- Should enter user dashboard

---

## 👷 How to Test Signup (Worker)

### Step 1: Open Worker Signup
```
http://localhost:5000/worker/signup.html
```

### Step 2: Fill Form
- **Email**: Any valid email
- **Password**: Strong password
- **Name**: Your name
- **Aadhar**: Any 12-digit number (e.g., 123456789012)
- **Role**: Select from dropdown
- **Experience**: Years of experience
- **City**: Your city
- **State**: Your state

### Step 3: Send OTP
- Click "Send OTP"
- Check email inbox

### Step 4: Enter OTP & Sign Up
- Copy OTP from email
- Paste into form
- Click "Create Account"

### Step 5: Login
- Go to `http://localhost:5000/worker/login.html`
- Enter email and password
- Access worker dashboard

---

## 📊 Database Verification

### Check if User/Worker Saved in MongoDB

```javascript
// In MongoDB Shell:
use servisphere
db.users.find({ email: "yourname@gmail.com" })
db.workers.find({ email: "yourname@gmail.com" })
```

**Expected fields for User:**
```json
{
  "_id": ObjectId,
  "email": "test@gmail.com",
  "password": "<hashed>",
  "city": "...",
  "state": "...",
  "createdAt": Date,
  "updatedAt": Date
}
```

**Expected fields for Worker:**
```json
{
  "_id": ObjectId,
  "email": "test@gmail.com",
  "password": "<hashed>",
  "name": "Name",
  "aadhar": "123456789012",
  "role": "Plumber",
  "experience": 5,
  "city": "City",
  "state": "State",
  "createdAt": Date,
  "updatedAt": Date
}
```

---

## 🔧 Troubleshooting

### OTP Not Arriving?
1. **Check spam/promotions folder** in Gmail
2. **Verify Gmail credentials** in `.env`:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ```
3. **Use Google App Password** (not regular password)
   - Enable 2FA on Google Account
   - Get [App Password here](https://myaccount.google.com/apppasswords)

### Backend Console Shows Email Error?
- Check the terminal for error message
- Common issues:
  - Invalid Gmail credentials
  - SMTP connection timeout
  - Network firewall blocking port 587

### Login Fails After Signup?
- Ensure OTP was entered correctly during signup
- OTP expires after 5 minutes
- Request new OTP and try again

### "User/Worker Already Exists" Error?
- Email is already registered
- Use a different email address

---

## 🚀 Production Deployment

When deploying to production:

1. **Deploy Backend to Render**
   - Push to GitHub
   - Deploy at render.com
   - Set environment variables

2. **Deploy Frontend to Netlify**
   - Push to GitHub
   - Auto-deploys at netlify.com
   - Frontend redirects to Render backend

3. **Email Service** (Same code works in production)
   - Uses real Gmail SMTP
   - OTPs actually sent to emails
   - No fallback mode in production

---

## ✅ Test Checklist

- [ ] User signup with valid email
- [ ] OTP received in email
- [ ] OTP entered correctly, account created
- [ ] User saved in MongoDB
- [ ] User can login with credentials
- [ ] Worker signup with all fields
- [ ] Worker OTP received
- [ ] Worker account created and saved
- [ ] Worker can login

---

## 📧 Email Testing

**Test Email Account** (for development):
- Use: `sanjay2027fgit@gmail.com` (for demo)
- Or create test Gmail account
- Gmail is free and receives emails instantly

**Verify Email Was Sent:**
1. Check Inbox
2. If not found, check Spam/Promotions
3. Check backend terminal for any errors

---

Last Updated: 2026-08-06
