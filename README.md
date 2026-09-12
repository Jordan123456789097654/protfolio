# Full-Stack Portfolio Website & Admin CMS

A modern, fast, single-page personal portfolio website with a built-in content management admin panel. Powered by **Node.js**, **Express**, and **Supabase PostgreSQL**.

---

## 🌟 Features

- **Hero / Landing**: Bold title, name, tagline, animated gradient background, and smooth down-scroll indicator.
- **About Me**: Rich-text bio (bold, lists, code blocks) with circular avatar photo support.
- **Projects**: Filterable card grid displaying dates, descriptions, images, and external links.
- **Skills**: Skill bars grouped by custom categories with animated progress indicators on scroll.
- **Experience Timeline**: Alternating vertical timeline for work history or education.
- **Spotify "Now Playing" Widget**: A live floating widget showing the track currently playing on your connected Spotify account, updated in real time.
- **Draft / Published Toggles**: Hide or publish individual Projects, Skills, Experience entries, and Social Links with a single click — drafts never appear on the live site.
- **Contact Form**: Form with validation that saves messages straight to the database + social link icons (GitHub, LinkedIn, Twitter, Email, etc.).
- **Scroll Animations**: Smooth inertia scrolling (Lenis) with staggered, scroll-driven reveal animations and parallax depth.
- **CMS Admin Panel**: Password-gated dashboard at `/admin.html` to edit site config, manage content, and access the new Settings tab:
  - **Drag & Drop Image Uploads** — upload photos directly to Supabase Storage instead of pasting URLs.
  - **Admin Password Manager** — change your login password from the UI, no `.env` editing required.
  - **Database Export & Backup** — one-click download of a full JSON backup of your portfolio data.

---

## 🛠️ Getting Started

### 1. Requirements
- Node.js (v18+ — the Spotify and image-upload integrations use the built-in `fetch` API)
- A Supabase PostgreSQL database URL (configured in `.env`)

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Supabase Postgres connection string |
| `SESSION_SECRET` | Everything | Any long random string |
| `PORT` | — | Defaults to `3000` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Image uploads | Settings → API in your Supabase project |
| `SUPABASE_BUCKET` | — | Defaults to `portfolio-uploads`, created automatically |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify widget | Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) |
| `SPOTIFY_REDIRECT_URI` | Spotify widget | Must match a Redirect URI registered on your Spotify app |

Uploads and the Spotify widget both degrade gracefully if unconfigured — the rest of the site and admin panel work fine without them.

### 3. Set up Supabase Storage (for image uploads)
1. In your Supabase project, go to **Settings → API** and copy the **Project URL** and **`service_role` key** into `.env` as `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
2. That's it — the app creates the `portfolio-uploads` bucket automatically on startup if it doesn't already exist (as a public bucket, since uploaded images need to be viewable on your live site).

### 4. Set up Spotify (for the Now Playing widget)
1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add a Redirect URI that matches `SPOTIFY_REDIRECT_URI` in your `.env` (e.g. `http://localhost:3000/admin/spotify/callback` for local dev, or `https://yourdomain.com/admin/spotify/callback` in production).
3. Copy the Client ID and Client Secret into `.env`.
4. Start the server, log in to `/admin.html`, open the **Settings** tab, and click **Connect Spotify**.

### 5. Run the server locally
```bash
npm install
npm start
```

- **Public Website**: [http://localhost:3000](http://localhost:3000)
- **Admin Panel**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 🔐 Admin Panel

Access the Admin Panel by navigating to:
**`http://localhost:3000/admin.html`**

- **Default password**: `SERVICE`
- The password is stored (hashed) in the database, not `.env`. Change it any time from **Settings → Admin Password** — no server restart or file editing required. The first successful login with the default password automatically upgrades it to a secure hash behind the scenes.

From the admin panel, you can:
- Update your Name, Job Title, Tagline, Bio (via the rich-text editor), and Profile Photo (drag & drop or paste a URL).
- Add, Edit, or Delete Projects, Skills, Experience entries, and Social Links.
- Toggle any entry between **Draft** and **Published** — drafts are hidden from the public site but stay editable.
- Connect/disconnect Spotify and manage your admin password from the **Settings** tab.
- Download a full JSON backup of your data from **Settings → Database Backup**.
- View and manage incoming messages sent through your website's contact form.

---

## 🗄️ Database Structure

The project uses Supabase PostgreSQL with the following tables:
- `site_config` — Name, Title, Tagline, Bio (HTML), Photo URL, hashed admin password
- `projects` — Title, Description, Image URL, Link URL, Dates, Ongoing status, Published status
- `skills` — Name, Category, Proficiency %, Sort Order, Published status
- `experience` — Job Title, Company, Description, Dates, Ongoing status, Published status
- `social_links` — Platform, URL, Icon identifier, Published status
- `contact_messages` — Inbound messages (Name, Email, Message, Created Date)
- `spotify_auth` — Spotify OAuth access/refresh tokens (single connected account)

To re-initialize or reset database tables (safe to re-run — uses `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`), run:
```bash
npm run init-db
```

---

## 📁 Project Structure

```
portfolio/
├── .env                   # Environment variables (see .env.example)
├── .env.example           # Documented template of all environment variables
├── server.js              # Express web server & DB pool initialization
├── schema.sql             # PostgreSQL database tables setup script
├── init-db.js             # Script to run schema migration on Supabase
├── lib/
│   ├── auth.js            # Password hashing (scrypt) & verification
│   ├── authMiddleware.js  # Shared session-auth guard for protected routes
│   ├── spotify.js         # Spotify OAuth + now-playing lookup
│   └── supabaseStorage.js # Supabase Storage upload helper (raw REST, no SDK)
├── routes/
│   ├── api.js             # Public API endpoints (/api/config, /api/projects, /api/spotify/now-playing, etc.)
│   ├── admin.js           # Protected Admin API endpoints, CRUD, settings, upload, export
│   └── spotify.js         # Admin-only Spotify OAuth connect/disconnect routes
├── public/
│   ├── index.html         # Main single-page portfolio layout
│   ├── admin.html         # Admin CMS panel interface (incl. Settings tab)
│   ├── css/
│   │   ├── style.css      # Main portfolio styling & animations
│   │   └── admin.css      # Admin panel styling
│   └── js/
│       ├── main.js        # Main portfolio dynamic fetch & render logic
│       └── admin.js       # Admin dashboard interactive CRUD script
└── README.md              # Documentation
```
