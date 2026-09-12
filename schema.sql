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

-- Integrations: Discord Webhook, Kyro AI API Key, Resend Email
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT DEFAULT 'https://discord.com/api/webhooks/1543661253698781335/P65nZ2XKxeWxDP4fiNUMLVRysGU0tt-iOFqihSd2rZUC16yTvTkqdp6DllFn4Q0nB5OB';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS kyro_api_key VARCHAR(255) DEFAULT 'kyro_sk_live_7H64A9P3jEmDr7RRiLOasMF7SjDSLYPB';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS resend_api_key VARCHAR(255) DEFAULT 're_kRnSzQiD_PET41BvpZbzvjhmMy4S7hC7';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255) DEFAULT 'jordan.lmmsfbla@outlook.com';

-- Customizable Email Templates & Subjects
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_email_subject TEXT DEFAULT '📬 New Portfolio Message from {{name}}';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS contact_email_template TEXT DEFAULT '';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS reply_email_subject TEXT DEFAULT 'Re: Portfolio Contact Message from {{name}}';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS reply_email_template TEXT DEFAULT '';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS recommendation_email_subject TEXT DEFAULT 'Letter of Recommendation Request for {{student_name}}';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS recommendation_teacher_email_subject TEXT DEFAULT 'Teacher Recommendation Request for {{student_name}}';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS recommendation_teacher_email_template TEXT DEFAULT '';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS recommendation_mentor_email_subject TEXT DEFAULT 'Mentor Endorsement Request for {{student_name}}';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS recommendation_mentor_email_template TEXT DEFAULT '';
-- Analytics & Event Tracking
CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  details TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Recommendation Requests (Sent to Teachers, Mentors & Therapists)
CREATE TABLE IF NOT EXISTS recommendation_requests (
  id SERIAL PRIMARY KEY,
  teacher_name VARCHAR(255) NOT NULL,
  teacher_email VARCHAR(255) NOT NULL,
  course_or_context VARCHAR(255),
  recipient_type VARCHAR(50) DEFAULT 'teacher',
  token VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE recommendation_requests ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(50) DEFAULT 'teacher';

-- Recommendations & Letters (Teachers, Counselors, Advisors)
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  recommender_name VARCHAR(255) NOT NULL,
  recommender_title VARCHAR(255),
  school_or_org VARCHAR(255),
  quote_excerpt TEXT NOT NULL,
  letter_pdf_url TEXT DEFAULT '',
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- FAQ (Frequently Asked Questions)
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'General',
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Certifications & Badges Shelf
CREATE TABLE IF NOT EXISTS certifications (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  issue_date VARCHAR(50),
  credential_id VARCHAR(255),
  credential_url TEXT,
  badge_image_url TEXT,
  category VARCHAR(100) DEFAULT 'Certification',
  description TEXT,
  is_published BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Site Sections (for dynamic section reordering & visibility)
CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  section_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true
);

INSERT INTO sections (section_id, title, sort_order, is_visible)
VALUES 
  ('about', 'About', 1, true),
  ('experience', 'Clubs & Activities', 2, true),
  ('certifications', 'Certifications', 3, true),
  ('achievements', 'Achievements', 4, true),
  ('gallery', 'Gallery', 5, true),
  ('skills', 'Strengths', 6, true),
  ('recommendations', 'Recommendations', 7, true),
  ('faq', 'FAQ', 8, true),
  ('contact', 'Contact', 9, true)
ON CONFLICT (section_id) DO UPDATE SET title = EXCLUDED.title, sort_order = EXCLUDED.sort_order;

-- Seed Sample FAQs if empty
INSERT INTO faqs (question, answer, category, sort_order)
SELECT 'What are your primary academic interests?', 
       'I am deeply passionate about Computer Science, Applied Mathematics, and STEM research. I love building web applications, exploring AI models, and participating in engineering projects.',
       'Academics', 1
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question LIKE '%academic interests%');

INSERT INTO faqs (question, answer, category, sort_order)
SELECT 'What leadership roles do you hold in school clubs?', 
       'I serve as a team leader and active contributor across student clubs, helping organize STEM workshops, coding competitions, and community outreach projects.',
       'Leadership', 2
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question LIKE '%leadership roles%');

INSERT INTO faqs (question, answer, category, sort_order)
SELECT 'Are you available for summer internships or STEM research projects?', 
       'Yes! I am actively seeking summer pre-college research opportunities, coding internships, and collaborative open-source projects.',
       'Availability', 3
WHERE NOT EXISTS (SELECT 1 FROM faqs WHERE question LIKE '%summer internships%');


