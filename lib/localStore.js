const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const INITIAL_DATA = {
  config: {
    id: 1,
    name: 'Jordan',
    title: 'Full-Stack Developer & Robotics Engineer',
    tagline: 'Building intelligent software and web applications',
    about_photo_url: '',
    about_bio: 'Passionate developer building modern web applications, robotics automation scripts, and creative tools.',
    stat_years_involved: 4,
    stat_clubs_joined: 5,
    quote_text: 'Innovation distinguishes between a leader and a follower.',
    quote_author: 'Steve Jobs',
    class_year: '2026',
    admin_password: 'SERVICE',
    show_grades_publicly: false,
    gpa_unweighted: '4.0',
    gpa_weighted: '4.4'
  },
  grades: [
    {
      id: 1,
      subject: 'AP Computer Science A',
      grade: 'A+',
      gpa: '4.0',
      school_year: '2025-2026',
      term: 'Semester 1',
      report_card_url: '',
      is_published: true,
      sort_order: 1
    },
    {
      id: 2,
      subject: 'Honors Physics',
      grade: 'A',
      gpa: '4.0',
      school_year: '2025-2026',
      term: 'Semester 1',
      report_card_url: '',
      is_published: true,
      sort_order: 2
    }
  ],
  projects: [
    {
      id: 1,
      title: 'Competitive Robotics Telemetry & Control',
      description: 'Programmed driver-controlled code for robots while maintaining engineering notebooks and performance metrics.',
      github_url: 'https://github.com/Jordan123456789097654/protfolio',
      live_url: '',
      image_url: '',
      tags: ['C++', 'Robotics', 'Telemetry'],
      is_published: true,
      sort_order: 1,
      created_at: new Date().toISOString()
    }
  ],
  skills: [
    { id: 1, name: 'Robotics Programming & System Tuning', category: 'Technical Skills', type: 'technical', is_published: true, sort_order: 1 },
    { id: 2, name: 'Full-Stack Web Development (Node.js/Express)', category: 'Technical Skills', type: 'technical', is_published: true, sort_order: 2 },
    { id: 3, name: 'FBLA Chapter Leadership & Record Keeping', category: 'Strengths & Leadership', type: 'strength', is_published: true, sort_order: 3 }
  ],
  experience: [
    {
      id: 1,
      job_title: 'Robotics Team Lead Programmer',
      company: 'Robotics Club',
      start_date: '2022',
      end_date: 'Present',
      description: 'Programmed driver-controlled code for our robots while maintaining engineering notebook logs.',
      is_current: true,
      is_published: true,
      sort_order: 1
    },
    {
      id: 2,
      job_title: 'FBLA Chapter Secretary',
      company: 'FBLA',
      start_date: '2023',
      end_date: 'Present',
      description: 'Organizing meeting logs, tracking achievements, and coordinating operations.',
      is_current: true,
      is_published: true,
      sort_order: 2
    }
  ],
  certifications: [],
  achievements: [],
  gallery: [],
  testimonials: [],
  social_links: [
    { id: 1, platform: 'GitHub', url: 'https://github.com/Jordan123456789097654/protfolio', icon: 'github', is_published: true, sort_order: 1 }
  ],
  recommendations: [],
  faqs: [],
  sections: [
    { id: 1, section_key: 'about', title: 'About Me', is_visible: true, sort_order: 1 },
    { id: 2, section_key: 'experience', title: 'Experience & Activities', is_visible: true, sort_order: 2 },
    { id: 3, section_key: 'projects', title: 'Featured Projects', is_visible: true, sort_order: 3 },
    { id: 4, section_key: 'certifications', title: 'Certifications', is_visible: true, sort_order: 4 },
    { id: 5, section_key: 'skills', title: 'Skills & Strengths', is_visible: true, sort_order: 5 },
    { id: 6, section_key: 'achievements', title: 'Achievements & Awards', is_visible: true, sort_order: 6 },
    { id: 7, section_key: 'gallery', title: 'Photo Gallery', is_visible: true, sort_order: 7 },
    { id: 8, section_key: 'recommendations', title: 'Recommendations', is_visible: true, sort_order: 8 },
    { id: 9, section_key: 'testimonials', title: 'Testimonials', is_visible: true, sort_order: 9 },
    { id: 10, section_key: 'faqs', title: 'FAQ', is_visible: true, sort_order: 10 },
    { id: 11, section_key: 'contact', title: 'Contact Me', is_visible: true, sort_order: 11 }
  ],
  messages: [],
  analytics_events: []
};

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf8');
  }
}

function readData() {
  ensureData();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data.grades) data.grades = INITIAL_DATA.grades;
    if (data.config && data.config.show_grades_publicly === undefined) {
      data.config.show_grades_publicly = false;
      data.config.gpa_unweighted = '4.0';
      data.config.gpa_weighted = '4.4';
    }
    return data;
  } catch (e) {
    return INITIAL_DATA;
  }
}

function writeData(data) {
  ensureData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { readData, writeData, INITIAL_DATA };
