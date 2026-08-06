# Deployment Guide for Servisphere

## Quick Start - Deploy Everything

### 1. Deploy Backend to Render
1. Go to [render.com](https://render.com)
2. Create a new **Web Service**
3. Connect your GitHub repo (servisphere)
4. Set these values:
   - **Name**: `servisphere-api`
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && node server.js`
   - **Region**: Choose closest to your users

5. Add Environment Variables:
   - `MONGO_URI` - Your MongoDB connection string
   - `JWT_SECRET` - A strong random string
   - `RAZORPAY_KEY_ID` - From Razorpay dashboard
   - `RAZORPAY_KEY_SECRET` - From Razorpay dashboard
   - `EMAIL_USER` - Gmail address
   - `EMAIL_PASS` - Gmail app password (not regular password)
   - `PORT` - 5000 (default)

6. Deploy and copy your Render URL (e.g., `https://servisphere-api.onrender.com`)

### 2. Update Frontend Configuration
Once you have the Render backend URL:

1. Edit `frontend/config.js` and update:
   ```javascript
   production: 'https://servisphere-api.onrender.com'
   ```

2. Redeploy to Netlify

### 3. Deploy Frontend to Netlify
1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Connect repo
4. Set **Publish directory**: `frontend`
5. Deploy!

## Testing Locally

1. Backend runs on `http://localhost:5000`
2. Open frontend at `http://localhost:5000` or `file://...html`
3. Send OTP - check terminal for dev-mode OTP output

## Email Configuration

### Gmail Setup (FREE)
1. Enable 2FA on your Google Account
2. Create [App Password](https://myaccount.google.com/apppasswords)
3. Use that as `EMAIL_PASS` in .env

### Environment Variables Needed
```
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
JWT_SECRET=your-super-secret-jwt-key
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=app-password-from-google
```

## Testing OTP Flow

### Development (Fallback Mode)
If email service fails, OTP is logged to terminal:
```
⚠️ [DEV MODE] OTP for test@example.com: 123456
```

### Production
OTP is sent via email to the provided address.

## Troubleshooting

**"Connection timeout" error?**
- Ensure backend is deployed and running on Render
- Check `frontend/config.js` has correct backend URL
- Verify CORS is enabled in server.js

**Email not sending?**
- Check Gmail app password is correct
- Enable "Less secure app access" if using regular password
- Check Email credentials in .env

**MongoDB connection fails?**
- Verify `MONGO_URI` is correct
- Add Render IP to MongoDB whitelist (or set to 0.0.0.0/0 for testing)

## API Endpoints

```
POST /api/auth/send-otp
  { email, role: "user|worker" }

POST /api/auth/signup/user
  { email, password, otp }

POST /api/auth/signup/worker
  { email, password, otp, name, aadhar, role, experience, city, state }

POST /api/auth/login
  { email, password }
```
