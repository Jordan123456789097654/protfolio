document.addEventListener('DOMContentLoaded', () => {
    // ── Intro Curtain Loader ──────────────────────────────────────
    document.body.classList.add('is-loading');
    const introLoader = document.getElementById('intro-loader');
    window.addEventListener('load', () => {
        setTimeout(() => {
            introLoader?.classList.add('loader-done');
            document.body.classList.remove('is-loading');
            setTimeout(() => introLoader?.remove(), 1000);
        }, 500);
    });

    // ── Buttery Smooth Inertia Scrolling (Lenis) ───────────────────
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lenis = null;
    if (window.Lenis && !prefersReducedMotion) {
        lenis = new Lenis({
            duration: 1.1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
        });
        const raf = (time) => {
            lenis.raf(time);
            requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
    }

    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Log page view event for analytics
    fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'page_view', details: window.location.pathname })
    }).catch(() => {});

    // Mobile nav toggle
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        document.querySelectorAll('.nav-links li a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // Radial Menu Wheel Toggle
    const radialTrigger = document.getElementById('radial-trigger');
    const radialMenu = document.getElementById('radial-menu');
    if (radialTrigger && radialMenu) {
        radialTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            radialMenu.classList.toggle('active');
        });
        document.addEventListener('click', () => radialMenu.classList.remove('active'));
    }

    // Navbar scroll & 3D room perspective zoom
    const navbar = document.getElementById('navbar');
    const scrollProgress = document.getElementById('scroll-progress');
    const heroSection = document.getElementById('hero');

    // ── Scroll-linked parallax depth (uses the independent CSS
    // `translate` property so it composites cleanly alongside the
    // existing floatBlob/floatBadge keyframe animations on `transform`) ──
    const parallaxBlobs = document.querySelectorAll('.blob');
    const parallaxBadges = document.querySelectorAll('.floating-badge');
    function updateParallax(scrollY) {
        parallaxBlobs.forEach((blob, i) => {
            const speed = 0.08 + i * 0.04;
            blob.style.translate = `0 ${scrollY * speed}px`;
        });
        parallaxBadges.forEach((badge, i) => {
            const speed = 0.05 + i * 0.03;
            badge.style.translate = `0 ${scrollY * -speed}px`;
        });
    }

    // All scroll-driven visual effects are batched into a single
    // rAF-throttled pass instead of separate listeners each writing to the
    // DOM on every scroll event — this matters a lot with Lenis, which
    // fires native scroll events on every animation frame while scrolling.
    let scrollTicking = false;
    function handleScrollEffects() {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;

        if (scrollProgress && docHeight > 0) {
            scrollProgress.style.width = `${(scrollY / docHeight) * 100}%`;
        }

        if (navbar) {
            navbar.classList.toggle('scrolled', scrollY > 50);
        }

        if (heroSection) {
            const scale = Math.max(0.9, 1 - (scrollY * 0.0004));
            const opacity = Math.max(0, 1 - (scrollY * 0.0015));
            heroSection.style.transform = `scale(${scale})`;
            heroSection.style.opacity = opacity;
        }

        updateParallax(scrollY);
        scrollTicking = false;
    }

    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(handleScrollEffects);
        }
    }, { passive: true });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (!target) return;
            if (lenis) {
                lenis.scrollTo(target, { offset: -80, duration: 1.2 });
            } else {
                window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
            }
        });
    });

    // Intersection Observer for scroll reveal & hollow background text
    // — reveals stagger by sibling order within their parent for a more
    // premium, cascading feel instead of popping in all at once.
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const siblings = entry.target.parentElement
                    ? Array.from(entry.target.parentElement.children).filter(el => el.classList.contains('reveal'))
                    : [entry.target];
                const index = siblings.indexOf(entry.target);
                const delay = Math.min(Math.max(index, 0), 5) * 90;

                setTimeout(() => entry.target.classList.add('active'), delay);

                const hollowText = entry.target.closest('section')?.querySelector('.hollow-bg-text');
                if (hollowText) hollowText.style.opacity = '0.08';

                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    // Toast notification system
    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        void toast.offsetWidth; // trigger reflow
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Confetti Burst Particle Canvas
    function launchConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const pieces = [];
        const colors = ['#6c63ff', '#00d4ff', '#ff007f', '#2ed573', '#f1c40f'];

        for (let i = 0; i < 100; i++) {
            pieces.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                vx: (Math.random() - 0.5) * 16,
                vy: (Math.random() - 0.7) * 16,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rspeed: (Math.random() - 0.5) * 10
            });
        }

        let frame = 0;
        function animateConfetti() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.35; // gravity
                p.rotation += p.rspeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });

            frame++;
            if (frame < 120) requestAnimationFrame(animateConfetti);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        animateConfetti();
    }

    // Contact form submit
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());
            
            const submitBtn = contactForm.querySelector('.submit-btn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Sending...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json().catch(() => ({ success: response.ok }));
                
                if (result.success || response.ok) {
                    launchConfetti();
                    showToast(result.message || 'Message sent successfully!');
                    contactForm.reset();
                } else {
                    showToast(result.error || result.message || 'Failed to send message.', true);
                }
            } catch (error) {
                showToast('An error occurred while sending the message.', true);
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // PDF Download event listener
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            generatePDFResume();
        });
    }

    // Fetch data and render portfolio sections
    async function fetchData() {
        try {
            const endpoints = [
                '/api/config',
                '/api/experience',
                '/api/social',
                '/api/achievements',
                '/api/gallery',
                '/api/skills',
                '/api/testimonials',
                '/api/recommendations',
                '/api/faqs',
                '/api/sections',
                '/api/certifications'
            ];

            const promises = endpoints.map(url => fetch(url).then(res => {
                if (!res.ok) throw new Error(`HTTP error ${res.status} for ${url}`);
                return res.json();
            }).catch(err => {
                console.error(`Failed to fetch ${url}:`, err);
                return null;
            }));

            const [config, experience, social, achievements, gallery, skills, testimonials, recommendations, faqs, sections, certifications] = await Promise.all(promises);

            window.portfolioData = { config, experience, social, achievements, gallery, skills, testimonials, recommendations, faqs, sections, certifications };

            if (config) renderHero(config);
            if (config) renderAbout(config);

            renderExperience(experience || []);
            renderSocial(social || []);
            renderAchievements(achievements || []);
            renderCertifications(certifications || []);
            renderGallery(gallery || []);
            renderSkills(skills || []);
            renderTestimonials(testimonials || []);
            renderRecommendations(recommendations || []);
            renderFAQs(faqs || []);
            renderStats(config || {}, experience || []);
            initSpotifyWidget();

            if (sections && Array.isArray(sections)) {
                applySectionOrdering(sections);
            }

            // Re-observe new elements
            document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
            
        } catch (error) {
            console.error('Error fetching initial data:', error);
            showToast('Error loading portfolio data.', true);
        }
    }

    function toggleSectionVisibility(sectionId, hasData) {
        const sectionEl = document.getElementById(sectionId);
        const navLink = document.querySelector(`.nav-links a[href="#${sectionId}"]`);
        const navItem = navLink ? navLink.closest('li') : null;

        if (sectionEl) {
            sectionEl.style.display = hasData ? '' : 'none';
        }
        if (navItem) {
            navItem.style.display = hasData ? '' : 'none';
        }
    }

    function applySectionOrdering(sections) {
        const main = document.querySelector('main');
        if (!main) return;
        
        const orderedSections = sections.filter(sec => sec.section_id !== 'hero' && sec.section_id !== 'contact');

        orderedSections.forEach(sec => {
            const el = document.getElementById(sec.section_id);
            const navLink = document.querySelector(`.nav-links a[href="#${sec.section_id}"]`);
            const navItem = navLink ? navLink.closest('li') : null;

            if (el && el.parentElement === main) {
                if (sec.is_visible === false) {
                    el.style.display = 'none';
                    if (navItem) navItem.style.display = 'none';
                } else {
                    main.appendChild(el);
                }
            }
        });

        // Always pin Contact section at the very end of <main>
        const contactEl = document.getElementById('contact');
        if (contactEl && contactEl.parentElement === main) {
            main.appendChild(contactEl);
        }
    }

    function renderRecommendations(recommendations) {
        const hasData = Array.isArray(recommendations) && recommendations.length > 0;
        toggleSectionVisibility('recommendations', hasData);

        const grid = document.getElementById('recommendations-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!hasData) return;

        recommendations.forEach(rec => {
            const card = document.createElement('div');
            card.className = 'rec-card tilt-card reveal';
            card.innerHTML = `
                <div class="rec-quote">"${rec.quote_excerpt}"</div>
                <div class="rec-author">
                    <span class="rec-name">${rec.recommender_name}</span>
                    <span class="rec-title">${rec.recommender_title || ''}</span>
                    ${rec.school_or_org ? `<span class="rec-org">${rec.school_or_org}</span>` : ''}
                    ${rec.letter_pdf_url ? `<a href="${rec.letter_pdf_url}" target="_blank" rel="noopener noreferrer" class="rec-download-btn"><i data-lucide="file-text"></i> Download Full Letter (PDF)</a>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
    }

    function renderFAQs(faqs) {
        const hasData = Array.isArray(faqs) && faqs.length > 0;
        toggleSectionVisibility('faq', hasData);

        const container = document.getElementById('faq-accordion');
        if (!container) return;
        container.innerHTML = '';

        if (!hasData) return;

        faqs.forEach((faq) => {
            const item = document.createElement('div');
            item.className = 'faq-item reveal';
            item.innerHTML = `
                <button class="faq-header" aria-expanded="false">
                    <span>${faq.question}</span>
                    <i data-lucide="chevron-down" class="faq-icon"></i>
                </button>
                <div class="faq-body">
                    <div class="faq-answer">${faq.answer}</div>
                </div>
            `;

            const btn = item.querySelector('.faq-header');
            btn.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                container.querySelectorAll('.faq-item').forEach(i => {
                    i.classList.remove('active');
                    i.querySelector('.faq-header').setAttribute('aria-expanded', 'false');
                });

                if (!isActive) {
                    item.classList.add('active');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });

            container.appendChild(item);
        });

        if (window.lucide) lucide.createIcons();
    }

    function renderCertifications(certifications) {
        const hasData = Array.isArray(certifications) && certifications.length > 0;
        toggleSectionVisibility('certifications', hasData);

        const grid = document.getElementById('certifications-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!hasData) return;

        certifications.forEach((cert) => {
            const card = document.createElement('div');
            card.className = 'cert-card tilt-card reveal';
            
            const badgeContent = cert.badge_image_url
                ? `<img src="${cert.badge_image_url}" alt="${cert.title} badge">`
                : `<i data-lucide="award"></i>`;

            card.innerHTML = `
                <div class="cert-card-header">
                    <div class="cert-badge-wrap">
                        ${badgeContent}
                    </div>
                    <div class="cert-meta">
                        <span class="cert-category-badge">${cert.category || 'Certification'}</span>
                        <h3 class="cert-title">${cert.title}</h3>
                        <span class="cert-issuer">${cert.issuer}</span>
                    </div>
                </div>
                ${cert.description ? `<p class="cert-description">${cert.description}</p>` : ''}
                <div class="cert-footer">
                    <span class="cert-date">${cert.issue_date ? `Issued: ${cert.issue_date}` : 'Verified Credential'}</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${cert.badge_image_url ? `<a href="${cert.badge_image_url}" target="_blank" rel="noopener noreferrer" class="cert-verify-link" style="background:rgba(0,212,255,0.12);border-color:rgba(0,212,255,0.3);color:var(--accent-secondary);"><i data-lucide="file-text"></i> View Certificate</a>` : ''}
                        ${cert.credential_url ? `<a href="${cert.credential_url}" target="_blank" rel="noopener noreferrer" class="cert-verify-link">Verify Credential <i data-lucide="external-link"></i></a>` : ''}
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
    }

    async function initSpotifyWidget() {
        const widget = document.getElementById('spotify-widget');
        const art = document.getElementById('spotify-art');
        const track = document.getElementById('spotify-track');
        const artist = document.getElementById('spotify-artist');
        if (!widget || !art || !track || !artist) return;

        async function updateSpotifyStatus() {
            try {
                const res = await fetch('/api/spotify/now-playing');
                const data = await res.json();

                if (data && data.isPlaying && data.title) {
                    art.src = data.albumImageUrl || data.album_art || '';
                    track.textContent = data.title;
                    track.href = data.songUrl || data.song_url || '#';
                    artist.textContent = data.artist || '';
                    widget.classList.remove('hidden');
                } else {
                    widget.classList.add('hidden');
                }
            } catch (err) {
                widget.classList.add('hidden');
            }
        }

        updateSpotifyStatus();
        setInterval(updateSpotifyStatus, 15000);
    }

    function renderTestimonials(testimonials) {
        const track = document.getElementById('testimonials-track');
        const dotsContainer = document.getElementById('testimonial-dots');
        const prevBtn = document.getElementById('testimonial-prev-btn');
        const nextBtn = document.getElementById('testimonial-next-btn');

        if (!track) return;
        track.innerHTML = '';
        if (dotsContainer) dotsContainer.innerHTML = '';

        if (!testimonials || testimonials.length === 0) {
            track.innerHTML = emptyStateHTML('quote', 'No Testimonials Yet', 'Quotes and endorsements will appear here.');
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            return;
        }

        if (prevBtn) prevBtn.style.display = '';
        if (nextBtn) nextBtn.style.display = '';

        let currentIndex = 0;

        testimonials.forEach((item, index) => {
            const slide = document.createElement('div');
            slide.className = `testimonial-card-slide ${index === 0 ? 'active' : ''}`;
            slide.style.display = index === 0 ? 'flex' : 'none';
            
            const initial = (item.author_name || 'A').charAt(0).toUpperCase();

            slide.innerHTML = `
                <div class="testimonial-quote-body">"${item.quote}"</div>
                <div class="testimonial-author-row">
                    <div class="testimonial-avatar-placeholder">${initial}</div>
                    <div class="testimonial-author-info">
                        <span class="testimonial-author-name">${item.author_name}</span>
                        <span class="testimonial-author-role">${item.author_role || ''}</span>
                    </div>
                </div>
            `;
            track.appendChild(slide);

            if (dotsContainer) {
                const dot = document.createElement('div');
                dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
                dot.addEventListener('click', () => goToSlide(index));
                dotsContainer.appendChild(dot);
            }
        });

        function goToSlide(index) {
            const slides = track.querySelectorAll('.testimonial-card-slide');
            const dots = dotsContainer ? dotsContainer.querySelectorAll('.carousel-dot') : [];

            slides.forEach((s, i) => {
                s.style.display = i === index ? 'flex' : 'none';
            });
            dots.forEach((d, i) => {
                d.classList.toggle('active', i === index);
            });
            currentIndex = index;
        }

        if (prevBtn) {
            prevBtn.onclick = () => {
                const nextIdx = (currentIndex - 1 + testimonials.length) % testimonials.length;
                goToSlide(nextIdx);
            };
        }

        if (nextBtn) {
            nextBtn.onclick = () => {
                const nextIdx = (currentIndex + 1) % testimonials.length;
                goToSlide(nextIdx);
            };
        }
    }

    function generatePDFResume() {
        const data = window.portfolioData || {};
        const config = data.config || {};
        const experience = data.experience || [];
        const skills = data.skills || [];
        const social = data.social || [];

        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator library loading... Please try again in a moment.', true);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let y = 50;

        // Background header banner
        doc.setFillColor(18, 18, 26);
        doc.rect(0, 0, pageWidth, 110, 'F');

        // Accent bar
        doc.setFillColor(108, 99, 255);
        doc.rect(0, 0, 6, 110, 'F');

        // Name & Title
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text(config.name || 'Your Name', margin, 45);

        doc.setTextColor(0, 212, 255);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text(config.title || 'Developer & Creator', margin, 65);

        // Contact info line in header
        doc.setTextColor(160, 160, 176);
        doc.setFontSize(9);
        const contactLine = [
            config.class_year ? `Graduation: ${config.class_year}` : '',
            social.map(s => s.url).filter(Boolean).slice(0, 2).join('  |  ')
        ].filter(Boolean).join('   •   ');
        if (contactLine) {
            doc.text(contactLine, margin, 88);
        }

        y = 135;

        // Helper for section headings
        function addHeading(title) {
            if (y > pageHeight - 60) { doc.addPage(); y = 50; }
            doc.setFillColor(108, 99, 255);
            doc.rect(margin, y, 4, 16, 'F');
            doc.setTextColor(18, 18, 26);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text(title.toUpperCase(), margin + 12, y + 13);
            y += 22;
            doc.setDrawColor(230, 230, 240);
            doc.setLineWidth(0.75);
            doc.line(margin, y, pageWidth - margin, y);
            y += 15;
        }

        // Bio / Summary
        if (config.about_bio) {
            addHeading('Executive Summary');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(50, 50, 60);
            const bioClean = config.about_bio.replace(/<[^>]*>/g, '');
            const splitBio = doc.splitTextToSize(bioClean, pageWidth - margin * 2);
            doc.text(splitBio, margin, y);
            y += splitBio.length * 14 + 15;
        }

        // Experience / Activities
        if (experience && experience.length > 0) {
            addHeading('Experience & Activities');
            experience.forEach(exp => {
                if (y > pageHeight - 80) { doc.addPage(); y = 50; }
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(20, 20, 30);
                doc.text(exp.job_title || 'Role', margin, y);

                const dateStr = exp.is_current ? `${exp.start_date || ''} – Present` : `${exp.start_date || ''} – ${exp.end_date || ''}`;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(108, 99, 255);
                doc.text(dateStr, pageWidth - margin, y, { align: 'right' });
                y += 14;

                if (exp.company) {
                    doc.setFont('helvetica', 'oblique');
                    doc.setFontSize(9.5);
                    doc.setTextColor(80, 80, 100);
                    doc.text(exp.company, margin, y);
                    y += 14;
                }

                if (exp.description) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(60, 60, 75);
                    const descClean = exp.description.replace(/<[^>]*>/g, '');
                    const splitDesc = doc.splitTextToSize(descClean, pageWidth - margin * 2);
                    doc.text(splitDesc, margin, y);
                    y += splitDesc.length * 13 + 12;
                } else {
                    y += 8;
                }
            });
        }

        // Technical Skills & Strengths
        if (skills && skills.length > 0) {
            addHeading('Skills & Technical Proficiencies');
            const categories = {};
            skills.forEach(s => {
                const cat = s.category || 'General';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(s.name);
            });

            Object.keys(categories).forEach(cat => {
                if (y > pageHeight - 50) { doc.addPage(); y = 50; }
                const catTitle = `${cat}: `;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9.5);
                doc.setTextColor(30, 30, 45);
                doc.text(catTitle, margin, y);

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(70, 70, 85);
                const skillsStr = categories[cat].join(', ');
                const maxSkillWidth = pageWidth - margin * 2 - 140;
                const splitSkills = doc.splitTextToSize(skillsStr, maxSkillWidth);
                doc.text(splitSkills, margin + 140, y);
                y += Math.max(splitSkills.length * 13, 16) + 6;
            });
        }

        const filename = `${(config.name || 'Portfolio').replace(/\s+/g, '_')}_Resume.pdf`;
        doc.save(filename);
        showToast('📄 Resume PDF downloaded!');
    }


    // ── Empty state helper — used across all dynamic sections ────
    function emptyStateHTML(icon, title, subtitle, inline = false) {
        return `
            <div class="empty-state ${inline ? 'empty-state-inline' : ''}">
                <div class="empty-state-icon"><i data-lucide="${icon}"></i></div>
                <div class="empty-state-title">${title}</div>
                ${subtitle ? `<div class="empty-state-subtitle">${subtitle}</div>` : ''}
            </div>
        `;
    }

    function renderHero(config) {
        const nameEl = document.getElementById('hero-name');
        const rawName = config.name || 'Portfolio';
        document.title = rawName ? `${rawName} — Portfolio` : 'Portfolio';
        
        // Kinetic character roll-up text
        let charHtml = '';
        [...rawName].forEach((char, index) => {
            const displayChar = char === ' ' ? '&nbsp;' : char;
            charHtml += `<span class="char" style="animation-delay: ${index * 0.045}s">${displayChar}</span>`;
        });
        nameEl.innerHTML = charHtml;

        document.getElementById('hero-title').textContent = config.title || '';
        document.getElementById('hero-tagline').textContent = config.tagline || '';

        const classYearBadge = document.getElementById('hero-class-year');
        const classYearText = document.getElementById('hero-class-year-text');
        if (classYearBadge && classYearText) {
            if (config.class_year) {
                classYearText.textContent = `Class of ${config.class_year}`;
                classYearBadge.classList.remove('hidden');
            } else {
                classYearBadge.classList.add('hidden');
            }
        }

        if (window.lucide) window.lucide.createIcons();
    }

    // ── Rich-text bio sanitizer ─────────────────────────────────────
    // The admin bio editor produces HTML (bold/italic/lists/code). Only a
    // small whitelist of safe formatting tags is allowed through; anything
    // else (script, style, images, event-handler attributes, etc.) is
    // stripped by unwrapping the element and keeping its text content.
    function sanitizeRichText(html) {
        const allowedTags = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'SPAN', 'A']);
        const template = document.createElement('template');
        template.innerHTML = html || '';

        function clean(node) {
            [...node.childNodes].forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (!allowedTags.has(child.tagName)) {
                        while (child.firstChild) node.insertBefore(child.firstChild, child);
                        node.removeChild(child);
                        return;
                    }
                    [...child.attributes].forEach(attr => {
                        if (child.tagName === 'A' && attr.name === 'href' && /^https?:\/\//i.test(attr.value.trim())) {
                            return; // keep safe http(s) links
                        }
                        child.removeAttribute(attr.name);
                    });
                    if (child.tagName === 'A') {
                        child.setAttribute('target', '_blank');
                        child.setAttribute('rel', 'noopener noreferrer');
                    }
                    clean(child);
                } else if (child.nodeType === Node.COMMENT_NODE) {
                    node.removeChild(child);
                }
            });
        }

        clean(template.content);
        return template.innerHTML;
    }

    function renderAbout(config) {
        const bioEl = document.getElementById('about-bio');
        bioEl.innerHTML = config.about_bio
            ? sanitizeRichText(config.about_bio)
            : '<p class="empty-message">This is where the story goes — add a bio from the admin panel.</p>';

        const photoEl = document.getElementById('about-photo');
        const placeholderEl = document.getElementById('about-photo-placeholder');
        
        if (config.about_photo_url) {
            photoEl.src = config.about_photo_url;
            photoEl.style.display = 'block';
            placeholderEl.style.display = 'none';
        } else {
            photoEl.style.display = 'none';
            placeholderEl.style.display = 'flex';
            placeholderEl.textContent = config.name ? config.name.charAt(0).toUpperCase() : '?';
        }

        // Featured quote — falls back to a friendly prompt if nothing's
        // configured yet; overridden by rotating testimonials in renderTestimonials.
        const quoteText = document.getElementById('quote-text');
        const quoteAuthor = document.getElementById('quote-author');
        if (quoteText) {
            if (config.quote_text) {
                quoteText.textContent = `"${config.quote_text}"`;
                if (quoteAuthor) quoteAuthor.textContent = config.quote_author || '';
            } else {
                quoteText.textContent = 'Add a favorite quote from the admin panel to feature it here.';
                if (quoteAuthor) quoteAuthor.textContent = '';
            }
        }
    }

    function renderExperience(experience) {
        const hasData = Array.isArray(experience) && experience.length > 0;
        toggleSectionVisibility('experience', hasData);

        const container = document.getElementById('experience-timeline');
        if (!container || !hasData) return;

        experience.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const pitches = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4, E4, G4, C5, E5 synth chimes

        let html = '';
        experience.forEach((exp, index) => {
            const side = index % 2 === 0 ? 'left' : 'right';
            let dateStr = exp.start_date || '';
            if (dateStr) {
                if (exp.is_current) {
                    dateStr += ' &ndash; Present';
                } else if (exp.end_date) {
                    dateStr += ' &ndash; ' + exp.end_date;
                }
            }

            const liveBadge = exp.is_current
                ? '<span class="live-badge"><span class="live-dot"></span>Active</span>'
                : '';

            const pitch = pitches[index % pitches.length];

            html += `
                <div class="timeline-item ${side} reveal" data-pitch="${pitch}">
                    <div class="timeline-content tilt-card">
                        <div class="timeline-date">${dateStr}${liveBadge}</div>
                        <h3 class="timeline-title">${exp.job_title}</h3>
                        <div class="timeline-company">${exp.company}</div>
                        <p>${exp.description || ''}</p>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // Bind synth chime hover to timeline items
        setTimeout(() => {
            document.querySelectorAll('.timeline-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    const pitch = parseFloat(item.dataset.pitch || '440');
                    playClickSound(pitch, 0.25);
                });
            });
            if (window.lucide) window.lucide.createIcons();
        }, 100);
    }

    // ── Achievements & Awards ────────────────────────────────────
    function renderAchievements(achievements) {
        const hasData = Array.isArray(achievements) && achievements.length > 0;
        toggleSectionVisibility('achievements', hasData);

        const container = document.getElementById('achievements-grid');
        if (!container || !hasData) return;

        achievements.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const categoryMeta = {
            'honor-roll': { icon: 'graduation-cap', label: 'Honor Roll' },
            'competition': { icon: 'trophy', label: 'Competition' },
            'certificate': { icon: 'badge-check', label: 'Certificate' },
            'award': { icon: 'medal', label: 'Award' }
        };

        let html = '';
        achievements.forEach(a => {
            const meta = categoryMeta[a.category] || categoryMeta['award'];
            const image = a.image_url
                ? `<img class="achievement-image" src="${a.image_url}" alt="${a.title}">`
                : '';
            html += `
                <div class="achievement-card tilt-card reveal">
                    ${image}
                    <div class="achievement-card-header">
                        <div class="achievement-icon"><i data-lucide="${meta.icon}"></i></div>
                        <div>
                            <div class="achievement-category">${meta.label}</div>
                            <div class="achievement-title">${a.title}</div>
                            ${a.issuer ? `<div class="achievement-issuer">${a.issuer}</div>` : ''}
                        </div>
                    </div>
                    ${a.description ? `<p class="achievement-desc">${a.description}</p>` : ''}
                    ${a.date_earned ? `<div class="achievement-date">${a.date_earned}</div>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    // ── Gallery / Photos ──────────────────────────────────────────
    function renderGallery(items) {
        const hasData = Array.isArray(items) && items.length > 0;
        toggleSectionVisibility('gallery', hasData);

        const container = document.getElementById('gallery-grid');
        if (!container || !hasData) return;

        items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const categoryLabels = {
            event: 'Event',
            competition: 'Competition',
            club: 'Club Activity',
            other: 'Photo'
        };

        let html = '';
        items.forEach((item, index) => {
            const label = categoryLabels[item.category] || categoryLabels.other;
            html += `
                <div class="gallery-card reveal" data-gallery-index="${index}">
                    <img src="${item.image_url}" alt="${item.caption || label}" loading="lazy">
                    <div class="gallery-card-expand"><i data-lucide="expand"></i></div>
                    <div class="gallery-card-overlay">
                        <div class="gallery-card-category">${label}</div>
                        ${item.caption ? `<div class="gallery-card-caption">${item.caption}</div>` : ''}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // ── Lightbox click-to-expand ──────────────────────────────
        const lightbox = document.getElementById('gallery-lightbox');
        const lightboxImg = document.getElementById('gallery-lightbox-img');
        const lightboxCaption = document.getElementById('gallery-lightbox-caption');
        const lightboxCategory = document.getElementById('gallery-lightbox-category');
        const lightboxClose = document.getElementById('gallery-lightbox-close');

        function openLightbox(item) {
            if (!lightbox) return;
            lightboxImg.src = item.image_url;
            lightboxImg.alt = item.caption || '';
            lightboxCaption.textContent = item.caption || '';
            lightboxCategory.textContent = categoryLabels[item.category] || categoryLabels.other;
            lightbox.classList.add('active');
        }

        function closeLightbox() {
            lightbox?.classList.remove('active');
        }

        container.querySelectorAll('.gallery-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.dataset.galleryIndex, 10);
                openLightbox(items[idx]);
            });
        });

        if (lightboxClose && !lightboxClose.dataset.bound) {
            lightboxClose.dataset.bound = 'true';
            lightboxClose.addEventListener('click', closeLightbox);
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) closeLightbox();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeLightbox();
            });
        }

        if (window.lucide) window.lucide.createIcons();
    }

    // ── Strengths & Technical Skills ─────────────────────────────
    function renderSkills(skills) {
        const hasData = Array.isArray(skills) && skills.length > 0;
        toggleSectionVisibility('skills', hasData);

        const strengthsContainer = document.getElementById('strengths-pills');
        const technicalContainer = document.getElementById('technical-skills');
        if (!strengthsContainer || !technicalContainer || !hasData) return;

        const strengthIcons = {
            leadership: 'crown', teamwork: 'users', communication: 'message-circle',
            'problem solving': 'puzzle', 'time management': 'clock', creativity: 'lightbulb',
            organization: 'list-checks', adaptability: 'refresh-cw', collaboration: 'handshake'
        };

        const strengths = skills.filter(s => s.skill_type === 'strength').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const technical = skills.filter(s => s.skill_type !== 'strength').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        if (strengths.length === 0) {
            strengthsContainer.innerHTML = emptyStateHTML('sparkles', 'No strengths added yet', 'Add a few strengths — like leadership or teamwork — to show what you bring to the table.', true);
        } else {
            strengthsContainer.innerHTML = strengths.map(s => {
                const icon = strengthIcons[(s.name || '').toLowerCase()] || 'star';
                return `<span class="strength-pill"><i data-lucide="${icon}"></i>${s.name}</span>`;
            }).join('');
        }

        if (technical.length === 0) {
            technicalContainer.innerHTML = emptyStateHTML('code-2', 'No technical skills yet', 'Add your first technical skill — like a language, tool, or platform — from the admin panel.', true);
        } else {
            technicalContainer.innerHTML = technical.map(s => `
                <div class="skill-bar-item">
                    <div class="skill-bar-top">
                        <span class="skill-bar-name">${s.name}</span>
                        <span class="skill-bar-pct">${s.proficiency}%</span>
                    </div>
                    <div class="skill-bar-track">
                        <div class="skill-bar-fill" data-width="${s.proficiency}"></div>
                    </div>
                </div>
            `).join('');

            // Animate bars in once they're on screen
            const bars = technicalContainer.querySelectorAll('.skill-bar-fill');
            const barObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.width = entry.target.dataset.width + '%';
                        barObserver.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.3 });
            bars.forEach(bar => barObserver.observe(bar));
        }

        if (window.lucide) window.lucide.createIcons();
    }

    // ── Testimonials (rotating quote card) ───────────────────────
    function renderTestimonials(testimonials) {
        const quoteText = document.getElementById('quote-text');
        const quoteAuthor = document.getElementById('quote-author');
        if (!quoteText) return;

        if (!testimonials || testimonials.length === 0) {
            return; // keep the default placeholder quote
        }

        testimonials.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        let index = 0;

        function showTestimonial(i) {
            const t = testimonials[i];
            quoteText.style.opacity = 0;
            setTimeout(() => {
                quoteText.textContent = `"${t.quote}"`;
                if (quoteAuthor) {
                    const roleStr = t.author_role ? `, ${t.author_role}` : '';
                    quoteAuthor.textContent = `— ${t.author_name}${roleStr}`;
                }
                quoteText.style.opacity = 1;
            }, 300);
        }

        showTestimonial(0);

        if (testimonials.length > 1) {
            setInterval(() => {
                index = (index + 1) % testimonials.length;
                showTestimonial(index);
            }, 6000);
        }
    }

    // ── Animated Counter Stats ────────────────────────────────────
    function renderStats(config, experience) {
        const years = config.stat_years_involved || 0;
        const clubs = config.stat_clubs_joined || (experience ? experience.length : 0);

        const targets = { 'stat-years': years, 'stat-clubs': clubs };
        const els = Object.keys(targets).map(id => document.getElementById(id)).filter(Boolean);
        els.forEach(el => el.dataset.target = targets[el.id]);

        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    statObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });
        els.forEach(el => statObserver.observe(el));
    }

    function animateCounter(el) {
        const target = parseInt(el.dataset.target, 10) || 0;
        const duration = 1400;
        const start = performance.now();

        function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(eased * target);
            if (progress < 1) requestAnimationFrame(tick);
            else el.textContent = target;
        }
        requestAnimationFrame(tick);
    }

    function renderSocial(socialLinks) {
        const container = document.getElementById('social-links');
        if (!socialLinks || socialLinks.length === 0) {
            container.innerHTML = emptyStateHTML('share-2', 'No social links yet', 'Add a link so people can find you elsewhere.', true);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        socialLinks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const brandColors = {
            'github': { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
            'linkedin': { color: '#0077b5', glow: 'rgba(0, 119, 181, 0.4)' },
            'twitter': { color: '#1da1f2', glow: 'rgba(29, 161, 242, 0.4)' },
            'email': { color: '#6c63ff', glow: 'rgba(108, 99, 255, 0.4)' },
            'instagram': { color: '#e1306c', glow: 'rgba(225, 48, 108, 0.4)' },
            'youtube': { color: '#ff0000', glow: 'rgba(255, 0, 0, 0.4)' },
            'facebook': { color: '#1877f2', glow: 'rgba(24, 119, 242, 0.4)' },
            'link': { color: '#00d4ff', glow: 'rgba(0, 212, 255, 0.4)' }
        };

        const iconMap = {
            'github': 'github',
            'linkedin': 'linkedin',
            'twitter': 'twitter',
            'email': 'mail',
            'link': 'external-link',
            'instagram': 'instagram',
            'youtube': 'youtube',
            'facebook': 'facebook'
        };

        let html = '';
        socialLinks.forEach(link => {
            const key = link.icon.toLowerCase();
            const lucideIcon = iconMap[key] || 'external-link';
            const platformName = link.platform || link.icon;
            const brand = brandColors[key] || { color: '#6c63ff', glow: 'rgba(108, 99, 255, 0.4)' };
            
            html += `
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="social-link reveal magnetic" style="--brand-color: ${brand.color}; --brand-glow: ${brand.glow}">
                    <i data-lucide="${lucideIcon}"></i>
                    <span>${platformName}</span>
                </a>
            `;
        });
        container.innerHTML = html;

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // ── Mouse position tracking for background ambient glow ─────
    window.addEventListener('mousemove', (e) => {
        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    }, { passive: true });

    // ── 3D Parallax Tilt & Color-Shifting Tint ───────────────────
    function init3DTilt() {
        const cards = document.querySelectorAll('.tilt-card, .timeline-content');
        cards.forEach(card => {
            let ticking = false;
            let lastEvent = null;

            card.addEventListener('mousemove', (e) => {
                lastEvent = e;
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    const rect = card.getBoundingClientRect();
                    const x = lastEvent.clientX - rect.left;
                    const y = lastEvent.clientY - rect.top;

                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    const rotateX = ((y - centerY) / centerY) * -10;
                    const rotateY = ((x - centerX) / centerX) * 10;

                    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.02)`;
                    card.style.setProperty('--card-mouse-x', `${x}px`);
                    card.style.setProperty('--card-mouse-y', `${y}px`);
                    ticking = false;
                });
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
            });
        });
    }

    // ── Magnetic Physics on Buttons ──────────────────────────────
    function initMagneticElements() {
        const magnetics = document.querySelectorAll('.magnetic');
        magnetics.forEach(el => {
            let ticking = false;
            let lastEvent = null;

            el.addEventListener('mousemove', (e) => {
                lastEvent = e;
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    const rect = el.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    const dx = (lastEvent.clientX - centerX) * 0.32;
                    const dy = (lastEvent.clientY - centerY) * 0.32;

                    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                    el.style.transition = 'transform 0.1s cubic-bezier(0.16, 1, 0.3, 1)';
                    ticking = false;
                });
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = 'translate3d(0, 0, 0)';
                el.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
            });
        });
    }

    // ── Text Scramble Disabled for Clean Hover Typography ────────
    function initTextScramble() {}

    // ── Palette Mood Theme Switcher ───────────────────────────────
    function initThemeSwitcher() {
        const themeBtn = document.getElementById('theme-toggle');
        const themes = ['default', 'crimson', 'emerald', 'royal'];
        const themeLabels = { default: 'Varsity Gold', crimson: 'Crimson', emerald: 'Forest', royal: 'Royal Blue' };
        let currentThemeIndex = 0;

        const savedTheme = localStorage.getItem('portfolio_theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            currentThemeIndex = themes.indexOf(savedTheme);
            if (currentThemeIndex === -1) currentThemeIndex = 0;
        }

        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                currentThemeIndex = (currentThemeIndex + 1) % themes.length;
                const nextTheme = themes[currentThemeIndex];
                if (nextTheme === 'default') {
                    document.documentElement.removeAttribute('data-theme');
                } else {
                    document.documentElement.setAttribute('data-theme', nextTheme);
                }
                localStorage.setItem('portfolio_theme', nextTheme);
                showToast(`Switched theme to: ${themeLabels[nextTheme] || nextTheme}`);
            });
        }
    }

    // ── Interactive Starfield & Constellation Canvas ─────────────
    function initParticleCanvas() {
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = canvas.offsetWidth;
        let height = canvas.height = canvas.offsetHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = canvas.offsetWidth;
            height = canvas.height = canvas.offsetHeight;
        });

        const particles = [];
        const numParticles = Math.min(Math.floor(width * 0.05), 70);

        for (let i = 0; i < numParticles; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.8,
                vy: (Math.random() - 0.5) * 0.8,
                radius: Math.random() * 2.2 + 0.8
            });
        }

        let mouseX = -9999;
        let mouseY = -9999;
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        let time = 0;
        function drawParticles() {
            ctx.clearRect(0, 0, width, height);
            time += 0.02;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy + Math.sin(time + p.x) * 0.15;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 212, 255, 0.65)';
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(108, 99, 255, ${0.35 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }

                if (mouseX > 0 && mouseY > 0) {
                    const mdx = p.x - mouseX;
                    const mdy = p.y - (mouseY + window.scrollY);
                    const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

                    if (mdist < 140) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(mouseX, mouseY + window.scrollY);
                        ctx.strokeStyle = `rgba(0, 212, 255, ${0.45 * (1 - mdist / 140)})`;
                        ctx.lineWidth = 1.2;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(drawParticles);
        }
        drawParticles();
    }

    // ── Web Audio API UI Sound FX ────────────────────────────────
    let audioCtx = null;
    let soundEnabled = localStorage.getItem('sound_enabled') === 'true';

    const soundBtn = document.getElementById('sound-toggle');

    function updateSoundUI() {
        if (soundBtn) {
            if (soundEnabled) soundBtn.classList.add('active');
            else soundBtn.classList.remove('active');
        }
    }
    updateSoundUI();

    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            localStorage.setItem('sound_enabled', soundEnabled ? 'true' : 'false');
            updateSoundUI();
            if (soundEnabled) playClickSound(600, 0.05);
        });
    }

    function playClickSound(freq = 700, duration = 0.015) {
        if (!soundEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + duration);

            gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function initSoundEvents() {
        const triggers = document.querySelectorAll('.magnetic, a, button, input, textarea');
        triggers.forEach(el => {
            el.addEventListener('mouseenter', () => playClickSound(650, 0.012));
        });
    }

    // ── Live Time, Awake Status, Greeting & Rain Weather Animation ─────
    let rainActive = false;
    let rainAnimationFrame = null;

    function initDynamicTimeAndWeather() {
        const liveClock = document.getElementById('live-clock');
        const awakeStatus = document.getElementById('awake-status');
        const greetingText = document.getElementById('greeting-text');
        const weatherText = document.getElementById('weather-text');
        const weatherIcon = document.getElementById('weather-icon');
        const toggleRainBtn = document.getElementById('toggle-rain-btn');

        function updateClock() {
            const now = new Date();
            const estTimeString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
            const estDate = new Date(estTimeString);
            const hours = estDate.getHours();
            const minutes = estDate.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;

            if (liveClock) liveClock.textContent = `${displayHours}:${minutes} ${ampm} EST`;

            // Awake vs Sleeping status based on 7 AM to 11 PM
            if (awakeStatus) {
                if (hours >= 7 && hours < 23) {
                    awakeStatus.textContent = 'Jordan is Awake ☀️';
                } else {
                    awakeStatus.textContent = 'Jordan is Resting 🌙';
                }
            }

            // Dynamic Time of Day Greeting
            if (greetingText) {
                if (hours >= 5 && hours < 12) {
                    greetingText.textContent = 'Good Morning! Welcome to my portfolio';
                } else if (hours >= 12 && hours < 18) {
                    greetingText.textContent = 'Good Afternoon! Welcome to my portfolio';
                } else if (hours >= 18 && hours < 22) {
                    greetingText.textContent = 'Good Evening! Welcome to my portfolio';
                } else {
                    greetingText.textContent = 'Working Late! Welcome to my portfolio';
                }
            }
        }

        updateClock();
        setInterval(updateClock, 30000);

        // Fetch Weather info via Open-Meteo free API for Postal Code 30041 (Cumming, GA) in EST timezone
        async function fetchWeather() {
            try {
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=34.2073&longitude=-84.1402&current_weather=true&timezone=America%2FNew_York');
                const data = await res.json();
                if (data && data.current_weather) {
                    const tempC = data.current_weather.temperature;
                    const tempF = Math.round((tempC * 9/5) + 32);
                    const code = data.current_weather.weathercode;

                    let icon = '🌤️';
                    let condition = 'Clear Skies';
                    let isRaining = false;

                    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) {
                        icon = '🌧️';
                        condition = 'Rainy';
                        isRaining = true;
                    } else if (code >= 71 && code <= 77 || code >= 85 && code <= 86) {
                        icon = '❄️';
                        condition = 'Snowing';
                    } else if (code >= 1 && code <= 3) {
                        icon = '⛅';
                        condition = 'Partly Cloudy';
                    } else if (code >= 95) {
                        icon = '⛈️';
                        condition = 'Stormy';
                        isRaining = true;
                    }

                    if (weatherText) weatherText.textContent = `${tempF}°F • ${condition}`;
                    if (weatherIcon) weatherIcon.textContent = icon;

                    if (isRaining) {
                        startRainAnimation();
                    }
                }
            } catch (e) {
                if (weatherText) weatherText.textContent = '72°F • Clear';
                if (weatherIcon) weatherIcon.textContent = '☀️';
            }
        }

        fetchWeather();

        if (toggleRainBtn) {
            toggleRainBtn.addEventListener('click', () => {
                if (rainActive) {
                    stopRainAnimation();
                    showToast('Rain Animation Disabled');
                } else {
                    startRainAnimation();
                    showToast('🌧️ Rain & Screen Blur FX Enabled!');
                }
            });
        }
    }

    function startRainAnimation() {
        const canvas = document.getElementById('rain-canvas');
        const blurOverlay = document.getElementById('rain-glass-blur');
        if (!canvas) return;

        rainActive = true;
        canvas.classList.add('active');
        if (blurOverlay) blurOverlay.classList.add('active');

        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        const numDrops = 140;
        const drops = [];

        for (let i = 0; i < numDrops; i++) {
            drops.push({
                x: Math.random() * width,
                y: Math.random() * height,
                length: Math.random() * 25 + 15,
                speed: Math.random() * 10 + 12,
                opacity: Math.random() * 0.4 + 0.35,
                width: Math.random() * 1.5 + 0.8
            });
        }

        function renderRain() {
            if (!rainActive) return;
            ctx.clearRect(0, 0, width, height);

            for (let i = 0; i < drops.length; i++) {
                const d = drops[i];
                d.y += d.speed;
                d.x += 1.5; // slight wind angle

                if (d.y > height) {
                    d.y = -d.length;
                    d.x = Math.random() * width;
                }

                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + 4, d.y + d.length);
                ctx.strokeStyle = `rgba(180, 220, 255, ${d.opacity})`;
                ctx.lineWidth = d.width;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            rainAnimationFrame = requestAnimationFrame(renderRain);
        }

        renderRain();
    }

    function stopRainAnimation() {
        rainActive = false;
        if (rainAnimationFrame) cancelAnimationFrame(rainAnimationFrame);
        const canvas = document.getElementById('rain-canvas');
        const blurOverlay = document.getElementById('rain-glass-blur');
        if (canvas) canvas.classList.remove('active');
        if (blurOverlay) blurOverlay.classList.remove('active');
    }

    function initSpotifyWidget() {
        const widget = document.getElementById('spotify-widget');
        if (!widget) return;

        const art = document.getElementById('spotify-art');
        const track = document.getElementById('spotify-track');
        const artist = document.getElementById('spotify-artist');

        async function poll() {
            try {
                const res = await fetch('/api/spotify/now-playing');
                const data = await res.json();

                if (!data.connected || !data.isPlaying || !data.title) {
                    widget.classList.add('hidden');
                    widget.classList.remove('is-playing');
                    return;
                }

                art.src = data.albumArt || '';
                track.textContent = data.title;
                track.href = data.songUrl || '#';
                artist.textContent = data.artist || '';
                widget.classList.remove('hidden');
                widget.classList.add('is-playing');
                if (window.lucide) window.lucide.createIcons();
            } catch (e) {
                widget.classList.add('hidden');
            }
        }

        poll();
        setInterval(poll, 15000);
    }

    function initCursorHover() {}

    // Start everything
    fetchData().then(() => {
        setTimeout(() => {
            initCursorHover();
            init3DTilt();
            initMagneticElements();
            initTextScramble();
            initThemeSwitcher();
            initParticleCanvas();
            initSoundEvents();
            initSpotifyWidget();
            initDynamicTimeAndWeather();
        }, 200);
    });
});
