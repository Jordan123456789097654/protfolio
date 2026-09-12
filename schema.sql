-- Portfolio Database Schema
-- Run with: npm run init-db

-- Site Configuration (single row)
CREATE TABLE IF NOT EXISTS site_config (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) DEFAULT 'Your Name',
  title VARCHAR(255) DEFAULT 'Your Title',
  tagline TEXT DEFAULT 'Welcome to my portfolio',
  about_bio TEXT DEFAULT 'Tell your story here...',
  about_photo_url TEXT DEFAULT '',
  admin_password VARCHAR(255) DEFAULT 'SERVICE'
);

-- Safely add columns if table already exists
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS admin_password VARCHAR(255) DEFAULT 'SERVICE';

-- Stats shown in the animated counters section on the public site
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS stat_years_involved INTEGER DEFAULT 0;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS stat_hours_volunteered INTEGER DEFAULT 0;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS stat_clubs_joined INTEGER DEFAULT 0;

-- Graduation year, shown as a small badge near the hero
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS class_year VARCHAR(20) DEFAULT '';

-- Default featured quote shown in the About section (rotating testimonials,
-- if any are added, take over from this once they exist)
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS quote_text TEXT DEFAULT '';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS quote_author VARCHAR(255) DEFAULT '';
-- NOTE: admin_password starts as the plaintext default above. The first successful
-- login transparently rehashes it (scrypt) in the database — see lib/auth.js.

-- Seed default config row if table is empty
INSERT INTO site_config (name, title, tagline, about_bio, about_photo_url, admin_password)
SELECT 'Jordan', 'Developer & Creator', 'Building things that matter.', 
       'I''m a passionate developer who loves creating beautiful, functional experiences. Edit this section from the admin panel to tell your story.',
       '', 'SERVICE'
WHERE NOT EXISTS (SELECT 1 FROM site_config);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  start_date VARCHAR(50),
  end_date VARCHAR(50),
  is_current BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Skills (technical skills AND "strengths" like leadership/teamwork)
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) DEFAULT 'General',
  proficiency INTEGER DEFAULT 50 CHECK (proficiency >= 0 AND proficiency <= 100),
  sort_order INTEGER DEFAULT 0,
  skill_type VARCHAR(20) DEFAULT 'technical' -- 'technical' or 'strength'
);

-- Safely add column if table already exists
ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_type VARCHAR(20) DEFAULT 'technical';

-- Achievements & Awards (honor roll, competition placements, certificates)
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255),
  description TEXT,
  category VARCHAR(50) DEFAULT 'award', -- 'award', 'competition', 'certificate', 'honor-roll'
  date_earned VARCHAR(50),
  image_url TEXT,
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Testimonials (quotes from teachers, coaches, club advisors)
CREATE TABLE IF NOT EXISTS testimonials (
  id SERIAL PRIMARY KEY,
  quote TEXT NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  author_role VARCHAR(255), -- e.g. "Robotics Club Advisor"
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Experience
CREATE TABLE IF NOT EXISTS experience (
  id SERIAL PRIMARY KEY,
  job_title VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  description TEXT,
  start_date VARCHAR(50),
  end_date VARCHAR(50),
  is_current BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Safely add is_published column if table already exists
ALTER TABLE experience ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- Draft/Published support for the other content types
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE social_links ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- Social Links
CREATE TABLE IF NOT EXISTS social_links (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  icon VARCHAR(50) DEFAULT 'link',
  sort_order INTEGER DEFAULT 0
);

-- Gallery / Photos (event photos, competition shots, club activities)
CREATE TABLE IF NOT EXISTS gallery (
  id SERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption VARCHAR(255),
  category VARCHAR(50) DEFAULT 'event', -- 'event', 'competition', 'club', 'other'
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contact Messages
CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Spotify OAuth tokens (single row — one connected account)
CREATE TABLE IF NOT EXISTS spotify_auth (
  id SERIAL PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
