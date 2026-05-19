================================================================================
NINJA FIELDSIGHT PMM DASHBOARD — COMPLETE STEP-BY-STEP GUIDE
For people who have never created a website before
================================================================================

IMPORTANT: Read this entire guide BEFORE you start. Takes 5 minutes to read.

================================================================================
OVERVIEW: What you're building
================================================================================

You're creating a live website that your PMM team can visit and see real-time
survey data.

Three pieces:
1. Backend (server on Railway) — stores your data as JSON files
2. Frontend (website on Vercel) — the dashboard your team visits
3. GitHub (file hosting) — keeps your code backed up

All free. Takes 20-30 minutes once you start.

================================================================================
PART 0: SETUP — What you need before starting
================================================================================

You need:
✓ A GitHub account (github.com) — it's free, takes 5 minutes to create
✓ A Vercel account (vercel.com) — it's free, you can sign up with GitHub
✓ A Railway account (railway.app) — it's free, you can sign up with GitHub
✓ These files in a folder:
  - backend.js
  - package.json
  - .env.example
  - .gitignore
  - README.md

✓ Terminal/Command line access (Mac: Terminal, Windows: PowerShell or WSL)
✓ Git installed (git-scm.com)

DO THIS FIRST (5 minutes):
1. Go to github.com, sign up (free)
2. Go to vercel.com, sign up with GitHub
3. Go to railway.app, sign up with GitHub

Once you have accounts, continue below.

================================================================================
PART 1: DEPLOY BACKEND TO RAILWAY (15 minutes)
================================================================================

This creates a live server that stores your data.

STEP 1.1: Create a GitHub repository for your backend
──────────────────────────────────────────────────────

1. Go to https://github.com/new
2. You'll see a form

   Repository name: fieldsight-backend
   Description: (optional) Ninja FieldSight PMM Dashboard Backend
   Public / Private: Public (doesn't matter for free)
   
3. Click the green "Create repository" button
4. You'll see a page that says "Quick setup"

SCREENSHOT DESCRIPTION:
"Quick setup — HTTPS"
Two options: "create a new repository on the command line" and 
"push an existing repository from the command line"

You want the SECOND one. Copy the commands. They look like:
  git remote add origin https://github.com/YOUR_USERNAME/fieldsight-backend.git
  git branch -M main
  git push -u origin main

STEP 1.2: Upload your code to GitHub
──────────────────────────────────────

Open Terminal (Mac) or PowerShell (Windows).

Navigate to the folder where you saved backend.js, package.json, etc.

Type these commands ONE AT A TIME and press Enter after each:

  git init
  
  git add backend.js package.json .env.example .gitignore README.md
  
  git commit -m "Initial commit"
  
  git remote add origin https://github.com/YOUR_USERNAME/fieldsight-backend.git
  (Replace YOUR_USERNAME with your actual GitHub username)
  
  git branch -M main
  
  git push -u origin main

When you run the last command, GitHub will ask for your username and password.
Enter them.

WHAT YOU'LL SEE:
  Enumerating objects: 5, done.
  Counting objects: 100% (5/5), done.
  Delta compression using up to 8 threads
  Compressing objects: 100% (4/4), done.
  Writing objects: 100% (5/5), ...
  
That means it worked!

STEP 1.3: Create a Railway project and deploy
───────────────────────────────────────────────

1. Go to https://railway.app
2. Click "Dashboard" (top right)
3. Click "New Project" (middle of screen)
4. Select "GitHub Repo"
5. GitHub will ask permission — click "Authorize railway"
6. Find and select "fieldsight-backend"
7. Railway will start deploying automatically

WHAT YOU'LL SEE:
You'll see a screen that says "Deploying..." with a progress bar.
It takes about 2-3 minutes.
When it's done, you'll see green checkmarks and a big message like:
  "Build Succeeded" or "Deployment Complete"

STEP 1.4: Set your password in Railway
───────────────────────────────────────

1. In Railway, click your project (should be on the page)
2. Click "Variables" in the left menu
3. Click "RAW Editor"
4. Add this line:
   UPLOAD_PASSWORD=YourStrongPassword123!
   
   (Replace with a password you'll remember. Something like: MyFieldSight2024!)

5. Click "Save"
6. Railway will redeploy (takes 30 seconds)

STEP 1.5: Get your backend URL
────────────────────────────────

1. In Railway, go back to your project
2. Click "Deployments" (in the left menu)
3. Click the latest deployment (top one, should be green)
4. At the TOP of the page, you'll see a URL that looks like:
   
   https://fieldsight-abc123.railway.app
   
   (The abc123 part will be different)

5. **SAVE THIS URL SOMEWHERE SAFE** — you'll need it in Part 2

STEP 1.6: Test that your backend is working
──────────────────────────────────────────────

1. Open a new browser tab
2. Go to: https://fieldsight-abc123.railway.app/health
   (Replace abc123 with the actual code from your URL)

3. You should see something like:
   {"ok":true,"timestamp":"2026-05-18T..."}

If you see that, you're done with Part 1! 🎉

If you see an error, check:
- The URL is correct (copy-paste from Railway)
- Wait 1-2 minutes and try again (sometimes deployment takes longer)
- Check Railway "Logs" tab for errors

================================================================================
PART 2: BUILD & DEPLOY FRONTEND TO VERCEL (15 minutes)
================================================================================

This creates the website your team will visit.

STEP 2.1: Build the dashboard HTML with your backend information
─────────────────────────────────────────────────────────────────

You need:
- Your backend URL (from Step 1.5)
- Your password (from Step 1.4)

Open Terminal and go to the folder with your files.

Type this command (all on one line, or use backslash to continue):

  BACKEND_URL="https://fieldsight-abc123.railway.app" \
  BACKEND_PASSWORD="MyFieldSight2024!" \
  python3 assemble_v4.py

Replace:
- fieldsight-abc123.railway.app with YOUR URL
- MyFieldSight2024! with YOUR password

WHAT YOU'LL SEE:
  ✓ Compiled OK: 69704 chars
  Wrote 392,694 chars (383.5 KB)
  Backend URL: https://fieldsight-abc123.railway.app
  Backend Password: ********

That means it worked! Your HTML file has been updated with your backend info.

STEP 2.2: Create a Vercel account and deploy
───────────────────────────────────────────────

1. Go to https://vercel.com
2. Click "Sign Up" (top right)
3. Click "Continue with GitHub"
4. GitHub asks for permission — click "Authorize Vercel"
5. You'll be logged in to Vercel

STEP 2.3: Deploy to Vercel (the easy way)
──────────────────────────────────────────

1. Go to https://vercel.com
2. You should see a page that says "Add New..." or similar
3. You can either:
   
   OPTION A (easiest): Drag and drop
   - Find ninja_fieldsight_pmm_dashboard.html in your file explorer
   - Drag it into the Vercel page
   - Click "Deploy"
   
   OPTION B: Upload via button
   - Click "New Project"
   - Click "Upload" or "Select Files"
   - Find and select ninja_fieldsight_pmm_dashboard.html
   - Click "Deploy"

WHAT YOU'LL SEE:
A progress bar saying "Deploying..."
It takes about 30 seconds.
Then you'll see:
  "Congratulations! Your project has been successfully deployed"
  
And a URL like: https://fieldsight-abc123.vercel.app

STEP 2.4: Save your frontend URL
──────────────────────────────────

The URL you see after deployment is your DASHBOARD URL.
This is what you'll give to your PMM team.

**SAVE THIS URL**

It looks like: https://fieldsight-abc123.vercel.app

================================================================================
PART 3: TEST EVERYTHING (10 minutes)
================================================================================

STEP 3.1: Test your backend is responding
───────────────────────────────────────────

Open a browser.
Go to: https://fieldsight-abc123.railway.app/health

You should see JSON: {"ok":true,"timestamp":"..."}

If this works, ✓ Backend is good.

STEP 3.2: Test your frontend loads
───────────────────────────────────

Open a browser.
Go to: https://fieldsight-abc123.vercel.app

You should see your dashboard with:
- Dark background
- "Ninja FieldSight" title
- KPI cards with numbers
- Some demo data

If this works, ✓ Frontend is good.

STEP 3.3: Test uploading a ZIP file
─────────────────────────────────────

1. On your dashboard, click the bottom tab: "/06 Upload ZIP"
2. You'll see an upload zone that says "Drop ZIP file here"
3. Drag a real FieldSight ZIP file into the upload zone
   (Or click "Choose file" to browse for one)
4. You should see progress: "Uploading to server..." → "Merged..."
5. The dashboard should update and show real data

If this works, ✓ Everything is connected!

WHAT COULD GO WRONG:

"Dashboard shows empty"
  → Backend URL might be wrong in the HTML
  → Try reloading the page
  → Check that https://your-backend-url.railway.app/health works

"Upload fails"
  → Check that your password is correct
  → Make sure the ZIP has jobs.csv and conversation.csv
  → Check Railway logs for errors

================================================================================
PART 4: SHARE WITH YOUR TEAM (2 minutes)
================================================================================

STEP 4.1: Give your team the dashboard URL
──────────────────────────────────────────

Send them: https://fieldsight-abc123.vercel.app

That's it! They can:
✓ Visit the URL in their browser
✓ See all the survey data
✓ Export CSV files
✓ View photos
✓ No login needed (password is baked in)

STEP 4.2: Only you upload ZIPs
────────────────────────────────

Only you (Eugene) have access to the Upload ZIP tab.
Other team members can see the dashboard but not upload.

When you upload a new ZIP:
1. Dashboard automatically shows updated data to everyone
2. They don't need to refresh (data updates in ~5 seconds)
3. Old data is preserved (cumulative — nothing gets deleted)

================================================================================
PART 5: ONGOING OPERATIONS
================================================================================

UPLOADING NEW DATA (you, once per week or as needed):

1. Go to your dashboard: https://fieldsight-abc123.vercel.app
2. Click "/06 Upload ZIP" tab
3. Drag a new ZIP from FieldSight
4. Wait for "✓ Uploaded" message
5. All your team members see updated data automatically

UPDATING PASSWORDS or SETTINGS:

Edit backend password:
1. Go to Railway dashboard
2. Click your project
3. Click "Variables"
4. Change UPLOAD_PASSWORD
5. Railway redeploys automatically

Rebuild dashboard with new backend URL (if you change servers):
1. Terminal: 
   BACKEND_URL="new-url" BACKEND_PASSWORD="password" python3 assemble_v4.py
2. Re-upload HTML to Vercel

CHECKING DATA on the server:

All your data is stored in data.json on Railway.
To see it:
1. Go to Railway → Deployments → latest
2. Click "Shell" tab (if available)
3. Type: cat data.json

================================================================================
TROUBLESHOOTING
================================================================================

"I can't connect to GitHub"
→ Make sure you're logged in to GitHub
→ Make sure you created an account first

"Git command not found"
→ Git isn't installed
→ Download from git-scm.com and install it
→ Restart Terminal after installing

"My backend URL looks wrong"
→ Make sure you copied it from Railway → Deployments → your deployment
→ It should be: https://something.railway.app (HTTPS, not HTTP)

"Dashboard loads but shows empty data"
→ Backend URL in HTML might be wrong
→ Run the build command again with correct URL
→ Re-upload to Vercel

"Upload fails with 401 Unauthorized"
→ Your password doesn't match
→ Rebuild HTML with correct password
→ Or change Railway variable to match

"Can't remember my password"
→ Go to Railway → Variables
→ Check what's in UPLOAD_PASSWORD
→ Rebuild HTML with that password

"Data didn't update on everyone's screen"
→ They might need to refresh the browser (F5)
→ Or wait 10 seconds, it auto-refreshes

"I want to change the dashboard URL"
→ Go to Vercel → your project → Settings → Domains
→ Add a custom domain if you want
→ Or just use the railway.app URL (it's free)

================================================================================
SUMMARY: What you just created
================================================================================

✓ A live dashboard at https://your-dashboard.vercel.app
✓ A backend server at https://your-backend.railway.app
✓ Data storage (JSON files on Railway disk)
✓ Password-protected upload (only you can add ZIPs)
✓ Real-time sharing (everyone on the team sees same data)
✓ Photo viewing, CSV export, KPI cards, charts
✓ Cost: $0/month (free tier)

Your PMM team can now:
✓ Visit the dashboard URL
✓ See all survey data in real-time
✓ Search by job ID, city, owner
✓ Export data as CSV
✓ View shop photos and dispenser photos
✓ No login, no confusion, no setup needed on their end

You can:
✓ Upload new FieldSight ZIPs once a week
✓ Data auto-merges and deduplicates
✓ Everyone sees updates immediately

================================================================================
NEXT STEPS
================================================================================

1. Create GitHub, Vercel, Railway accounts (5 min)
2. Follow Part 1 (deploy backend) — 15 min
3. Follow Part 2 (deploy frontend) — 15 min
4. Follow Part 3 (test) — 10 min
5. Follow Part 4 (share with team) — 2 min

Total: ~50 minutes (first time)

Future uploads: ~2 minutes each

Questions? Re-read this guide or ask Claude.

Good luck! 🚀

================================================================================
