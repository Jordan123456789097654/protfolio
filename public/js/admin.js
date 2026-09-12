document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Event Listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    document.getElementById('config-form').addEventListener('submit', handleConfigSave);
    
    // Add buttons
    document.getElementById('add-project-btn').addEventListener('click', () => openProjectModal());
    document.getElementById('add-skill-btn').addEventListener('click', () => openSkillModal());
    document.getElementById('add-experience-btn').addEventListener('click', () => openExperienceModal());
    document.getElementById('add-achievement-btn').addEventListener('click', () => openAchievementModal());
    document.getElementById('add-gallery-btn').addEventListener('click', () => openGalleryModal());
    document.getElementById('add-testimonial-btn').addEventListener('click', () => openTestimonialModal());
    document.getElementById('add-social-btn').addEventListener('click', () => openSocialModal());

    // Modal
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-form').addEventListener('submit', handleModalSubmit);

    // Settings tab
    document.getElementById('password-form').addEventListener('submit', handlePasswordChange);
    document.getElementById('export-btn').addEventListener('click', handleExport);
    document.getElementById('spotify-connect-btn').addEventListener('click', () => {
        window.location.href = '/admin/spotify/login';
    });
    document.getElementById('spotify-disconnect-btn').addEventListener('click', handleSpotifyDisconnect);

    // Rich text bio editor + photo dropzone
    initRichTextToolbar('config-bio-editor', 'config-bio');
    setupDropzone('config-photo-dropzone', 'config-photo-file', 'config-photo', 'config-photo-preview');

    // Show a toast if we just came back from the Spotify OAuth redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
        showToast('Spotify connected', 'success');
        window.history.replaceState({}, '', '/admin.html');
    } else if (params.get('spotify') === 'error') {
        showToast('Spotify connection failed', 'error');
        window.history.replaceState({}, '', '/admin.html');
    }
});

// Helper for API calls
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(endpoint, options);
        let data = null;
        try {
            data = await response.json();
        } catch(e) {}
        
        if (!response.ok) {
            throw new Error(data?.error || `HTTP error ${response.status}`);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

// Auth
async function checkAuth() {
    try {
        const res = await apiCall('/admin/check');
        if (res.authenticated) {
            showDashboard();
        } else {
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    const form = document.getElementById('login-form');
    
    try {
        const res = await apiCall('/admin/login', 'POST', { password });
        if (res.success) {
            document.getElementById('password').value = '';
            errorDiv.textContent = '';
            showDashboard();
        }
    } catch (error) {
        errorDiv.textContent = 'Invalid password';
        form.classList.remove('shake');
        void form.offsetWidth; // trigger reflow
        form.classList.add('shake');
    }
}

async function handleLogout() {
    try {
        await apiCall('/admin/logout');
        showLogin();
    } catch (e) {
        console.error('Logout error', e);
    }
}

function showLogin() {
    document.getElementById('dashboard-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    loadConfig();
    loadProjects();
    loadSkills();
    loadExperience();
    loadAchievements();
    loadGallery();
    loadTestimonials();
    loadSocial();
    loadMessages();
    loadSpotifyStatus();
}

// Tabs
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// Config
async function loadConfig() {
    try {
        const config = await apiCall('/admin/config');
        if(config) {
            document.getElementById('config-name').value = config.name || '';
            document.getElementById('config-title').value = config.title || '';
            document.getElementById('config-tagline').value = config.tagline || '';
            document.getElementById('config-class-year').value = config.class_year || '';
            document.getElementById('config-bio').value = config.about_bio || '';
            document.getElementById('config-bio-editor').innerHTML = config.about_bio || '';
            document.getElementById('config-photo').value = config.about_photo_url || '';
            updateDropzonePreview('config-photo-preview', config.about_photo_url || '');
            document.getElementById('config-quote-text').value = config.quote_text || '';
            document.getElementById('config-quote-author').value = config.quote_author || '';
            document.getElementById('config-stat-years').value = config.stat_years_involved || 0;
            document.getElementById('config-stat-clubs').value = config.stat_clubs_joined || 0;
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleConfigSave(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('config-name').value,
        title: document.getElementById('config-title').value,
        tagline: document.getElementById('config-tagline').value,
        class_year: document.getElementById('config-class-year').value,
        about_bio: document.getElementById('config-bio').value,
        about_photo_url: document.getElementById('config-photo').value,
        quote_text: document.getElementById('config-quote-text').value,
        quote_author: document.getElementById('config-quote-author').value,
        stat_years_involved: document.getElementById('config-stat-years').value,
        stat_clubs_joined: document.getElementById('config-stat-clubs').value
    };
    
    try {
        await apiCall('/admin/config', 'PUT', data);
        showToast('Configuration saved successfully', 'success');
    } catch (e) {
        showToast('Error saving configuration', 'error');
    }
}

// Table rendering helpers
function renderTable(tableId, data, renderRow) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = renderRow(item);
        tbody.appendChild(tr);
    });
}

// Publish / Draft toggle switch — reusable across entity tables
function publishToggleHTML(endpoint, item, reloadFnName) {
    const checked = item.is_published !== false ? 'checked' : '';
    return `
        <label class="publish-toggle" title="${item.is_published !== false ? 'Published' : 'Draft'}">
            <input type="checkbox" ${checked} onchange="togglePublish('${endpoint}', ${item.id}, this.checked, ${reloadFnName ? reloadFnName : 'null'})">
            <span class="slider"></span>
        </label>
    `;
}

async function togglePublish(endpoint, id, isPublished, reloadFn) {
    try {
        await apiCall(`${endpoint}/${id}/publish`, 'PATCH', { is_published: isPublished });
        showToast(isPublished ? 'Published' : 'Moved to draft', 'success');
        if (reloadFn) reloadFn();
    } catch (e) {
        showToast('Error updating status', 'error');
    }
}

// Projects
async function loadProjects() {
    try {
        const projects = await apiCall('/admin/projects');
        renderTable('projects-table', projects, p => `
            <td data-label="Title">${p.title}</td>
            <td data-label="Dates">${p.start_date || ''} - ${p.is_current ? 'Present' : (p.end_date || '')}</td>
            <td data-label="Published">${publishToggleHTML('/admin/projects', p, 'loadProjects')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openProjectModal(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/projects', ${p.id}, loadProjects)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function openProjectModal(project = null) {
    const isEdit = !!project;
    const title = isEdit ? 'Edit Project' : 'Add Project';
    const html = `
        <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" value="${project?.title || ''}" required>
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea name="description" required>${project?.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Image</label>
            <div class="dropzone" id="project-photo-dropzone">
                <img id="project-photo-preview" class="dropzone-preview ${project?.image_url ? '' : 'hidden'}" src="${project?.image_url || ''}" alt="Preview">
                <div class="dropzone-hint">
                    <span>Drag & drop an image, or click to browse</span>
                    <input type="file" id="project-photo-file" accept="image/*" class="hidden">
                </div>
            </div>
            <input type="text" name="image_url" id="project-photo-url" value="${project?.image_url || ''}" placeholder="Or paste an image URL">
        </div>
        <div class="form-group">
            <label>Link URL</label>
            <input type="text" name="link_url" value="${project?.link_url || ''}">
        </div>
        <div class="form-group row">
            <label>Start Date</label>
            <input type="date" name="start_date" value="${project?.start_date || ''}" style="margin-left:auto;width:auto">
        </div>
        <div class="form-group row">
            <label>Current?</label>
            <input type="checkbox" name="is_current" id="proj-current" ${project?.is_current ? 'checked' : ''}>
        </div>
        <div class="form-group row">
            <label>End Date</label>
            <input type="date" name="end_date" id="proj-end" value="${project?.end_date || ''}" ${project?.is_current ? 'disabled' : ''} style="margin-left:auto;width:auto">
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${project?.sort_order || 0}" required>
        </div>
    `;
    
    openModal(title, html, async (data) => {
        data.is_current = !!document.getElementById('proj-current').checked;
        if(data.is_current) data.end_date = null;
        try {
            if (isEdit) await apiCall(`/admin/projects/${project.id}`, 'PUT', data);
            else await apiCall('/admin/projects', 'POST', data);
            showToast(`Project ${isEdit ? 'updated' : 'added'}`, 'success');
            loadProjects();
            closeModal();
        } catch (e) {
            showToast('Error saving project', 'error');
        }
    });

    setTimeout(() => {
        const cur = document.getElementById('proj-current');
        const end = document.getElementById('proj-end');
        if(cur && end) {
            cur.addEventListener('change', () => {
                end.disabled = cur.checked;
            });
        }
        setupDropzone('project-photo-dropzone', 'project-photo-file', 'project-photo-url', 'project-photo-preview');
    }, 0);
}

// Skills
async function loadSkills() {
    try {
        const skills = await apiCall('/admin/skills');
        renderTable('skills-table', skills, s => `
            <td data-label="Name">${s.name}</td>
            <td data-label="Type">${s.skill_type === 'strength' ? 'Strength' : 'Technical'}</td>
            <td data-label="Category">${s.category || ''}</td>
            <td data-label="Proficiency">${s.proficiency}%</td>
            <td data-label="Published">${publishToggleHTML('/admin/skills', s, 'loadSkills')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openSkillModal(${JSON.stringify(s).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/skills', ${s.id}, loadSkills)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function openSkillModal(skill = null) {
    const isEdit = !!skill;
    const html = `
        <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" value="${skill?.name || ''}" placeholder="e.g. Python, or Leadership" required>
        </div>
        <div class="form-group">
            <label>Type</label>
            <select name="skill_type">
                <option value="technical" ${(!skill || skill?.skill_type === 'technical') ? 'selected' : ''}>Technical Skill</option>
                <option value="strength" ${skill?.skill_type === 'strength' ? 'selected' : ''}>Strength (leadership, teamwork, etc.)</option>
            </select>
        </div>
        <div class="form-group">
            <label>Category</label>
            <input type="text" name="category" value="${skill?.category || ''}" placeholder="e.g. Languages, Soft Skills">
        </div>
        <div class="form-group">
            <label>Proficiency (0-100)</label>
            <div style="display:flex;gap:1rem;align-items:center;">
                <input type="range" name="proficiency" id="skill-prof" min="0" max="100" value="${skill?.proficiency || 50}" style="flex:1">
                <span id="skill-prof-val">${skill?.proficiency || 50}</span>
            </div>
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${skill?.sort_order || 0}" required>
        </div>
    `;
    openModal(isEdit ? 'Edit Skill' : 'Add Skill', html, async (data) => {
        data.proficiency = parseInt(data.proficiency, 10);
        try {
            if (isEdit) await apiCall(`/admin/skills/${skill.id}`, 'PUT', data);
            else await apiCall('/admin/skills', 'POST', data);
            showToast(`Skill ${isEdit ? 'updated' : 'added'}`, 'success');
            loadSkills();
            closeModal();
        } catch (e) {
            showToast('Error saving skill', 'error');
        }
    });

    setTimeout(() => {
        const slider = document.getElementById('skill-prof');
        const val = document.getElementById('skill-prof-val');
        if(slider && val) {
            slider.addEventListener('input', e => val.textContent = e.target.value);
        }
    }, 0);
}

// Experience
async function loadExperience() {
    try {
        const exp = await apiCall('/admin/experience');
        renderTable('experience-table', exp, e => `
            <td data-label="Role / Position">${e.job_title}</td>
            <td data-label="Club / Organization">${e.company}</td>
            <td data-label="Dates">${e.start_date || ''} - ${e.is_current ? 'Present' : (e.end_date || '')}</td>
            <td data-label="Published">${publishToggleHTML('/admin/experience', e, 'loadExperience')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openExperienceModal(${JSON.stringify(e).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/experience', ${e.id}, loadExperience)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function openExperienceModal(exp = null) {
    const isEdit = !!exp;
    const html = `
        <div class="form-group">
            <label>Role / Position</label>
            <input type="text" name="job_title" value="${exp?.job_title || ''}" placeholder="e.g. Club President, Team Captain, Member" required>
        </div>
        <div class="form-group">
            <label>Club / Organization</label>
            <input type="text" name="company" value="${exp?.company || ''}" placeholder="e.g. Robotics Club, Student Council, Varsity Soccer" required>
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea name="description" placeholder="What you did, achievements, responsibilities...">${exp?.description || ''}</textarea>
        </div>
        <div class="form-group row">
            <label>Start Date</label>
            <input type="date" name="start_date" value="${exp?.start_date || ''}" style="margin-left:auto;width:auto">
        </div>
        <div class="form-group row">
            <label>Current?</label>
            <input type="checkbox" name="is_current" id="exp-current" ${exp?.is_current ? 'checked' : ''}>
        </div>
        <div class="form-group row">
            <label>End Date</label>
            <input type="date" name="end_date" id="exp-end" value="${exp?.end_date || ''}" ${exp?.is_current ? 'disabled' : ''} style="margin-left:auto;width:auto">
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${exp?.sort_order || 0}" required>
        </div>
    `;
    openModal(isEdit ? 'Edit Activity' : 'Add Activity', html, async (data) => {
        data.is_current = !!document.getElementById('exp-current').checked;
        if(data.is_current) data.end_date = null;
        try {
            if (isEdit) await apiCall(`/admin/experience/${exp.id}`, 'PUT', data);
            else await apiCall('/admin/experience', 'POST', data);
            showToast(`Activity ${isEdit ? 'updated' : 'added'}`, 'success');
            loadExperience();
            closeModal();
        } catch (e) {
            showToast('Error saving activity', 'error');
        }
    });

    setTimeout(() => {
        const cur = document.getElementById('exp-current');
        const end = document.getElementById('exp-end');
        if(cur && end) {
            cur.addEventListener('change', () => {
                end.disabled = cur.checked;
            });
        }
    }, 0);
}

// Achievements / Awards
async function loadAchievements() {
    try {
        const items = await apiCall('/admin/achievements');
        renderTable('achievements-table', items, a => `
            <td data-label="Title">${a.title}</td>
            <td data-label="Issuer">${a.issuer || ''}</td>
            <td data-label="Category">${achievementCategoryLabel(a.category)}</td>
            <td data-label="Date">${a.date_earned || ''}</td>
            <td data-label="Published">${publishToggleHTML('/admin/achievements', a, 'loadAchievements')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openAchievementModal(${JSON.stringify(a).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/achievements', ${a.id}, loadAchievements)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function achievementCategoryLabel(cat) {
    const labels = { 'award': 'Award', 'competition': 'Competition', 'certificate': 'Certificate', 'honor-roll': 'Honor Roll' };
    return labels[cat] || 'Award';
}

function openAchievementModal(achievement = null) {
    const isEdit = !!achievement;
    const categories = [
        ['honor-roll', 'Honor Roll'],
        ['competition', 'Competition Placement'],
        ['certificate', 'Certificate'],
        ['award', 'Award']
    ];
    const options = categories.map(([val, label]) => `<option value="${val}" ${achievement?.category === val ? 'selected' : ''}>${label}</option>`).join('');

    const html = `
        <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" value="${achievement?.title || ''}" placeholder="e.g. 1st Place, Regional Science Fair" required>
        </div>
        <div class="form-group">
            <label>Issuing Organization</label>
            <input type="text" name="issuer" value="${achievement?.issuer || ''}" placeholder="e.g. State Science Foundation">
        </div>
        <div class="form-group">
            <label>Category</label>
            <select name="category">${options}</select>
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea name="description" placeholder="Any extra detail worth mentioning...">${achievement?.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Certificate / Badge Image (optional)</label>
            <div class="dropzone" id="achievement-photo-dropzone">
                <img id="achievement-photo-preview" class="dropzone-preview ${achievement?.image_url ? '' : 'hidden'}" src="${achievement?.image_url || ''}" alt="Preview">
                <div class="dropzone-hint">
                    <span>Drag & drop an image, or click to browse</span>
                    <input type="file" id="achievement-photo-file" accept="image/*" class="hidden">
                </div>
            </div>
            <input type="text" name="image_url" id="achievement-photo-url" value="${achievement?.image_url || ''}" placeholder="Or paste an image URL">
        </div>
        <div class="form-group row">
            <label>Date Earned</label>
            <input type="date" name="date_earned" value="${achievement?.date_earned || ''}" style="margin-left:auto;width:auto">
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${achievement?.sort_order || 0}" required>
        </div>
    `;

    openModal(isEdit ? 'Edit Achievement' : 'Add Achievement', html, async (data) => {
        try {
            if (isEdit) await apiCall(`/admin/achievements/${achievement.id}`, 'PUT', data);
            else await apiCall('/admin/achievements', 'POST', data);
            showToast(`Achievement ${isEdit ? 'updated' : 'added'}`, 'success');
            loadAchievements();
            closeModal();
        } catch (e) {
            showToast('Error saving achievement', 'error');
        }
    });

    setTimeout(() => {
        setupDropzone('achievement-photo-dropzone', 'achievement-photo-file', 'achievement-photo-url', 'achievement-photo-preview');
    }, 0);
}

// Gallery / Photos
async function loadGallery() {
    try {
        const items = await apiCall('/admin/gallery');
        renderTable('gallery-table', items, g => `
            <td data-label="Photo">${g.image_url ? `<img src="${g.image_url}" alt="" style="width:60px;height:44px;object-fit:cover;border-radius:6px;">` : ''}</td>
            <td data-label="Caption">${g.caption || ''}</td>
            <td data-label="Category">${galleryCategoryLabel(g.category)}</td>
            <td data-label="Published">${publishToggleHTML('/admin/gallery', g, 'loadGallery')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openGalleryModal(${JSON.stringify(g).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/gallery', ${g.id}, loadGallery)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function galleryCategoryLabel(cat) {
    const labels = { event: 'Event', competition: 'Competition', club: 'Club Activity', other: 'Photo' };
    return labels[cat] || 'Event';
}

function openGalleryModal(photo = null) {
    const isEdit = !!photo;
    const categories = [
        ['event', 'Event'],
        ['competition', 'Competition'],
        ['club', 'Club Activity'],
        ['other', 'Other']
    ];
    const options = categories.map(([val, label]) => `<option value="${val}" ${photo?.category === val ? 'selected' : ''}>${label}</option>`).join('');

    const html = `
        <div class="form-group">
            <label>Photo</label>
            <div class="dropzone" id="gallery-photo-dropzone">
                <img id="gallery-photo-preview" class="dropzone-preview ${photo?.image_url ? '' : 'hidden'}" src="${photo?.image_url || ''}" alt="Preview">
                <div class="dropzone-hint">
                    <span>Drag & drop an image, or click to browse</span>
                    <input type="file" id="gallery-photo-file" accept="image/*" class="hidden">
                </div>
            </div>
            <input type="text" name="image_url" id="gallery-photo-url" value="${photo?.image_url || ''}" placeholder="Or paste an image URL" required>
        </div>
        <div class="form-group">
            <label>Caption</label>
            <input type="text" name="caption" value="${photo?.caption || ''}" placeholder="e.g. Regional Robotics Competition, Spring 2026">
        </div>
        <div class="form-group">
            <label>Category</label>
            <select name="category">${options}</select>
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${photo?.sort_order || 0}" required>
        </div>
    `;

    openModal(isEdit ? 'Edit Photo' : 'Add Photo', html, async (data) => {
        try {
            if (isEdit) await apiCall(`/admin/gallery/${photo.id}`, 'PUT', data);
            else await apiCall('/admin/gallery', 'POST', data);
            showToast(`Photo ${isEdit ? 'updated' : 'added'}`, 'success');
            loadGallery();
            closeModal();
        } catch (e) {
            showToast('Error saving photo', 'error');
        }
    });

    setTimeout(() => {
        setupDropzone('gallery-photo-dropzone', 'gallery-photo-file', 'gallery-photo-url', 'gallery-photo-preview');
    }, 0);
}

// Testimonials
async function loadTestimonials() {
    try {
        const items = await apiCall('/admin/testimonials');
        renderTable('testimonials-table', items, t => `
            <td data-label="Quote" style="max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.quote}</td>
            <td data-label="Author">${t.author_name}</td>
            <td data-label="Role">${t.author_role || ''}</td>
            <td data-label="Published">${publishToggleHTML('/admin/testimonials', t, 'loadTestimonials')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openTestimonialModal(${JSON.stringify(t).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/testimonials', ${t.id}, loadTestimonials)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function openTestimonialModal(testimonial = null) {
    const isEdit = !!testimonial;
    const html = `
        <div class="form-group">
            <label>Quote</label>
            <textarea name="quote" placeholder="What they said about you..." required>${testimonial?.quote || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Author Name</label>
            <input type="text" name="author_name" value="${testimonial?.author_name || ''}" placeholder="e.g. Ms. Rivera" required>
        </div>
        <div class="form-group">
            <label>Author Role</label>
            <input type="text" name="author_role" value="${testimonial?.author_role || ''}" placeholder="e.g. Robotics Club Advisor">
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${testimonial?.sort_order || 0}" required>
        </div>
    `;
    openModal(isEdit ? 'Edit Testimonial' : 'Add Testimonial', html, async (data) => {
        try {
            if (isEdit) await apiCall(`/admin/testimonials/${testimonial.id}`, 'PUT', data);
            else await apiCall('/admin/testimonials', 'POST', data);
            showToast(`Testimonial ${isEdit ? 'updated' : 'added'}`, 'success');
            loadTestimonials();
            closeModal();
        } catch (e) {
            showToast('Error saving testimonial', 'error');
        }
    });
}

// Social
async function loadSocial() {
    try {
        const social = await apiCall('/admin/social');
        renderTable('social-table', social, s => `
            <td data-label="Platform">${s.platform}</td>
            <td data-label="URL"><a href="${s.url}" target="_blank" style="color:var(--accent)">Link</a></td>
            <td data-label="Icon">${s.icon}</td>
            <td data-label="Published">${publishToggleHTML('/admin/social', s, 'loadSocial')}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-outline" onclick='openSocialModal(${JSON.stringify(s).replace(/'/g, "&apos;")})'>Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/social', ${s.id}, loadSocial)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

function openSocialModal(social = null) {
    const isEdit = !!social;
    const icons = ['github', 'linkedin', 'twitter', 'email', 'instagram', 'youtube', 'facebook', 'link'];
    const options = icons.map(i => `<option value="${i}" ${social?.icon === i ? 'selected' : ''}>${i}</option>`).join('');
    
    const html = `
        <div class="form-group">
            <label>Platform</label>
            <input type="text" name="platform" value="${social?.platform || ''}" required>
        </div>
        <div class="form-group">
            <label>URL</label>
            <input type="url" name="url" value="${social?.url || ''}" required>
        </div>
        <div class="form-group">
            <label>Icon</label>
            <select name="icon" required>
                ${options}
            </select>
        </div>
        <div class="form-group">
            <label>Sort Order</label>
            <input type="number" name="sort_order" value="${social?.sort_order || 0}" required>
        </div>
    `;
    openModal(isEdit ? 'Edit Social Link' : 'Add Social Link', html, async (data) => {
        try {
            if (isEdit) await apiCall(`/admin/social/${social.id}`, 'PUT', data);
            else await apiCall('/admin/social', 'POST', data);
            showToast(`Social link ${isEdit ? 'updated' : 'added'}`, 'success');
            loadSocial();
            closeModal();
        } catch (e) {
            showToast('Error saving social link', 'error');
        }
    });
}

// Messages
async function loadMessages() {
    try {
        const msgs = await apiCall('/admin/messages');
        renderTable('messages-table', msgs, m => `
            <td data-label="Name">${m.name}</td>
            <td data-label="Email">${m.email}</td>
            <td data-label="Message" class="msg-cell" style="cursor:pointer;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="this.style.whiteSpace=this.style.whiteSpace==='nowrap'?'normal':'nowrap';this.style.maxWidth='none'">${m.message}</td>
            <td data-label="Date">${new Date(m.created_at).toLocaleString()}</td>
            <td data-label="Actions" class="actions-cell">
                <button class="btn-sm btn-danger" onclick="deleteItem('/admin/messages', ${m.id}, loadMessages)">Delete</button>
            </td>
        `);
    } catch (e) { console.error(e); }
}

async function deleteItem(endpoint, id, reloadFn) {
    if(!confirm('Are you sure you want to delete this item?')) return;
    try {
        await apiCall(`${endpoint}/${id}`, 'DELETE');
        showToast('Item deleted', 'success');
        reloadFn();
    } catch (e) {
        showToast('Error deleting item', 'error');
    }
}

// Modal System
let modalCallback = null;
function openModal(title, formHTML, onSave) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = formHTML;
    document.getElementById('modal-overlay').classList.remove('hidden');
    modalCallback = onSave;
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    modalCallback = null;
}

function handleModalSubmit(e) {
    e.preventDefault();
    if(!modalCallback) return;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    modalCallback(data);
}

// Toast System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ══════════════════════════════════════════════════════════════════
//  Rich Text Bio Editor (execCommand-based WYSIWYG toolbar)
// ══════════════════════════════════════════════════════════════════
function initRichTextToolbar(editorId, hiddenFieldId) {
    const editor = document.getElementById(editorId);
    const hiddenField = document.getElementById(hiddenFieldId);
    if (!editor || !hiddenField) return;

    function syncEditor() {
        hiddenField.value = editor.innerHTML.trim();
    }

    const toolbar = document.querySelector(`.richtext-toolbar[data-target="${editorId}"]`);
    if (toolbar) {
        toolbar.querySelectorAll('.rt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                editor.focus();
                document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
                syncEditor();
            });
        });
    }

    editor.addEventListener('input', syncEditor);
    editor.addEventListener('blur', syncEditor);
}

// ══════════════════════════════════════════════════════════════════
//  Drag & Drop Image Uploads
// ══════════════════════════════════════════════════════════════════
function updateDropzonePreview(previewId, url) {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    if (url) {
        preview.src = url;
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
        preview.removeAttribute('src');
    }
}

async function handleImageUpload(file, dropzone, urlInput, previewId) {
    if (!file.type.startsWith('image/')) {
        showToast('Please choose an image file', 'error');
        return;
    }
    dropzone.classList.add('uploading');
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/admin/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Upload failed');
        urlInput.value = data.url;
        updateDropzonePreview(previewId, data.url);
        showToast('Image uploaded', 'success');
    } catch (e) {
        showToast(e.message || 'Error uploading image', 'error');
    } finally {
        dropzone.classList.remove('uploading');
    }
}

function setupDropzone(dropzoneId, fileInputId, urlInputId, previewId) {
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(fileInputId);
    const urlInput = document.getElementById(urlInputId);
    if (!dropzone || !fileInput || !urlInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
            handleImageUpload(fileInput.files[0], dropzone, urlInput, previewId);
        }
    });

    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });
    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) handleImageUpload(file, dropzone, urlInput, previewId);
    });

    urlInput.addEventListener('input', () => updateDropzonePreview(previewId, urlInput.value));
}

// ══════════════════════════════════════════════════════════════════
//  Settings — Spotify, Password, Backup
// ══════════════════════════════════════════════════════════════════
async function loadSpotifyStatus() {
    const pill = document.getElementById('spotify-status-pill');
    const connectBtn = document.getElementById('spotify-connect-btn');
    const disconnectBtn = document.getElementById('spotify-disconnect-btn');
    if (!pill) return;

    try {
        const status = await apiCall('/admin/spotify/status');

        if (!status.configured) {
            pill.textContent = 'Not configured — add SPOTIFY_CLIENT_ID / SECRET to .env';
            pill.className = 'status-pill disconnected';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.add('hidden');
            return;
        }

        if (status.connected) {
            pill.textContent = 'Connected';
            pill.className = 'status-pill connected';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
        } else {
            pill.textContent = 'Not connected';
            pill.className = 'status-pill disconnected';
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
        }
    } catch (e) {
        pill.textContent = 'Unable to check status';
        pill.className = 'status-pill disconnected';
    }
}

async function handleSpotifyDisconnect() {
    if (!confirm('Disconnect Spotify from your portfolio?')) return;
    try {
        await apiCall('/admin/spotify/disconnect', 'POST');
        showToast('Spotify disconnected', 'success');
        loadSpotifyStatus();
    } catch (e) {
        showToast('Error disconnecting Spotify', 'error');
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    try {
        await apiCall('/admin/settings/password', 'PUT', { currentPassword, newPassword });
        showToast('Password updated successfully', 'success');
        document.getElementById('password-form').reset();
    } catch (e) {
        showToast(e.message || 'Error updating password', 'error');
    }
}

async function handleExport() {
    try {
        const res = await fetch('/admin/export');
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^"]+)"?/);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = match ? match[1] : `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Backup downloaded', 'success');
    } catch (e) {
        showToast('Error downloading backup', 'error');
    }
}
