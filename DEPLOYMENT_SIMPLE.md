# Ninja FieldSight Dashboard — Deployment (No Google Setup)

**TL;DR:** Deploy backend to Railway, frontend to Vercel. Data stored as JSON on disk. Takes 15 minutes.

## Backend: Railway (5 minutes)

### 1. Create Railway project
- Go to https://railway.app
- Sign up (free, GitHub)
- New → GitHub repo

### 2. Push code to GitHub
```bash
git init
git add backend.js package.json .env.example .gitignore
git commit -m "Initial"
git remote add origin https://github.com/YOUR_USERNAME/fieldsight-backend.git
git push -u origin main
```

### 3. Deploy in Railway
- Click "New" → "GitHub repo"
- Select your repo
- Railway auto-detects Node.js, deploys automatically

### 4. Set environment variables in Railway
- Go to "Variables"
- Add `UPLOAD_PASSWORD`: your strong password (e.g., `SecurePass123`)
- Save

### 5. Get your backend URL
- Go to "Deployments" → latest
- URL looks like: `https://fieldsight-abc123.railway.app`
- **Save this URL**

## Frontend: Vercel (5 minutes)

### 1. Build dashboard with backend URL
```bash
BACKEND_URL="https://fieldsight-abc123.railway.app" \
BACKEND_PASSWORD="SecurePass123" \
python3 assemble_v4.py
```

This injects your backend into the HTML file.

### 2. Deploy to Vercel
- Go to https://vercel.com
- Drag & drop `ninja_fieldsight_pmm_dashboard.html`
- Click "Deploy"
- Done! You get a live URL

## Test

```bash
# Test backend is up:
curl https://fieldsight-abc123.railway.app/health

# Test data endpoint (with password):
curl -H "X-Password: SecurePass123" \
  https://fieldsight-abc123.railway.app/api/jobs
```

## Share with team

Give them your Vercel URL. That's it — they visit, dashboard loads, all data is there.

Only you can upload ZIPs (password protected). Everyone else sees shared results.

## Cost

- Railway: $0 (free tier)
- Vercel: $0 (free)
- Total: $0/month

Done! 🚀
