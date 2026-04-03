# Personal OS — AI-Powered Personal Workspace

A **production-ready, full-stack web app** built with pure HTML + CSS + Vanilla JavaScript. Features notes, YouTube AI summarizer, AI research, and an admin dashboard — all powered by **Supabase** (auth + DB) and **Google Gemini** (AI).

---

## 🗂 Project Structure

```
personal-os/
│── index.html          ← Login page (Google OAuth)
│── dashboard.html      ← User dashboard
│── admin.html          ← Admin dashboard (role-protected)
│── .env.local          ← 🔑 Local environment variables
│── supabase_setup.sql  ← Run once in Supabase SQL Editor
│
├── css/
│   └── styles.css      ← Full design system
│
├── js/
│   ├── auth.js         ← Google OAuth, session guards, role checks
│   ├── dashboard.js    ← Dashboard orchestrator
│   ├── notes.js        ← Full CRUD + Quill editor
│   ├── youtube.js      ← YouTube summarizer
│   ├── research.js     ← AI research tool
│   └── admin.js        ← Admin user management
│
├── services/
│   ├── supabaseClient.js  ← Supabase singleton
│   └── api.js             ← Gemini AI + YouTube API calls
│
└── utils/
    └── helpers.js      ← Toast, debounce, sanitize, date, skeleton
```

---

## ⚙️ Setup Instructions

### 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → create a new project
2. Navigate to **SQL Editor** → **New Query**
3. Paste the entire contents of `supabase_setup.sql` and run it
4. Go to **Authentication → Providers → Google** and enable it:
   - Add your Google OAuth Client ID & Secret
   - Add Redirect URL: `http://localhost:5500/dashboard.html` (and your prod domain)
5. Copy your project URL and `anon` key from **Project Settings → API**

### 2. Google Cloud OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google+ API** and **YouTube Data API v3**
4. Create **OAuth 2.0 Credentials** → Web Application
5. Add Authorized redirect URIs:
   - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`

### 3. Google Gemini API

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Create an API key (free tier available)

### 4. Configure Environment Variables

This project uses `process.env` for security. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_GEMINI_API_KEY=YOUR_GEMINI_API_KEY
NEXT_PUBLIC_YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
```

> [!IMPORTANT]
> Since this is a vanilla JS project, you MUST use a build step (like Vite or Next.js) or a deployment platform like Vercel that handles `process.env` injection to make these variables available in the browser.

> ⚠️ **NEVER commit `.env.local` (or any .env files) to git!**

---

## 🚀 Running the App

### Option A: VS Code Live Server (Recommended)

1. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. Right-click `index.html` → **Open with Live Server**
3. App opens at `http://localhost:5500`

### Option B: Python HTTP Server

```bash
cd "e:\AI ML\personal-os"
python -m http.server 5500
# Open: http://localhost:5500
```

### Option C: Node http-server

```bash
npx http-server . -p 5500 -o
```

---

## 🔐 Authentication Flow

1. User clicks **Continue with Google** on `index.html`
2. Supabase redirects to Google OAuth
3. Google returns → Supabase handles token → redirects to `dashboard.html`
4. `auth.js` reads session, creates/fetches profile row
5. First registered user automatically becomes **admin**

---

## 📊 Database Tables

| Table | Description |
|-------|-------------|
| `profiles` | One row per user. Fields: id, email, name, role, disabled |
| `notes` | User notes. Fields: id, user_id, title, content, created_at |
| `activity` | Action log. Fields: id, user_id, type, data (JSONB), created_at |

All tables have **Row Level Security** — users can only access their own data.

---

## 🎯 Features

| Feature | Details |
|---------|---------|
| 🔐 Auth | Google OAuth via Supabase, no guest access |
| 📝 Notes | CRUD with Quill rich-text editor, search, sort, AI search |
| 🎥 YouTube | URL → AI summary + key points → save as note |
| 🔍 Research | Question → Gemini answer + sources → save as note |
| 📊 Activity | Full action history feed |
| ⚙️ Admin | User list, stats, disable/delete users |
| 🌙 Theme | Dark/Light mode toggle, persisted in localStorage |
| 📱 Responsive | Mobile-friendly with collapsible sidebar |

---

## 🛡️ Security

- **No API keys in git** — all secrets in environment variables (gitignored)
- **Row Level Security** on all Supabase tables
- **Input sanitization** via `sanitizeInput()` / `sanitizeHTML()` 
- **Admin route protection** — server-side role check in `requireAdmin()`
- **XSS prevention** — all user content rendered through `sanitizeHTML()`

---

## 📦 Dependencies (All CDN — No npm needed)

| Library | Purpose | CDN |
|---------|---------|-----|
| Supabase JS v2 | Auth + Database | jsdelivr |
| Quill 1.3.7 | Rich text editor | quilljs.com |
| Google Fonts (Inter) | Typography | fonts.googleapis.com |

---

## 🗒️ .gitignore

Create a `.gitignore` file:

```gitignore
.env
.env.local
.DS_Store
Thumbs.db
```

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page after login | Check browser console for errors; verify Supabase URL/key in `env-config.js` |
| OAuth redirect error | Add correct redirect URL in both Google Console and Supabase Auth settings |
| AI not working | Verify `NEXT_PUBLIC_GEMINI_API_KEY` is set correctly |
| CORS errors | Serve via Live Server or http-server, not by opening HTML directly |
| "Could not create profile" | Ensure `supabase_setup.sql` ran successfully; check RLS policies |
| Videos not summarizing | YouTube Data API key optional; app falls back to mock metadata |

---

## Made with ❤️ using

- **Supabase** — Backend as a Service
- **Google Gemini 1.5 Flash** — AI engine
- **Quill.js** — Rich text editing
- **Vanilla JS** — No frameworks, pure web standards
