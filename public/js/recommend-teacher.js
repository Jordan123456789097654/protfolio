document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const headerTitle = document.getElementById('header-title');
  const headerSub = document.getElementById('header-sub');
  const form = document.getElementById('recommendation-form');
  const statusMsg = document.getElementById('status-msg');
  const submitBtn = document.getElementById('submit-btn');
  const fileDropArea = document.getElementById('file-drop-area');
  const fileInput = document.getElementById('pdf_file');
  const fileDropText = document.getElementById('file-drop-text');
  const pdfUrlInput = document.getElementById('letter_pdf_url');

  if (!token) {
    showStatus('Invalid or missing recommendation token link.', 'error');
    form.style.display = 'none';
    return;
  }

  // Validate token with backend
  try {
    const res = await fetch(`/api/recommendation-request/${token}`);
    const data = await res.json();

    if (!res.ok) {
      showStatus(data.error || 'Invalid or expired recommendation request link.', 'error');
      form.style.display = 'none';
      return;
    }

    const { request, studentName } = data;
    const isMentor = request.recipient_type === 'mentor';

    if (isMentor) {
      document.title = `Mentor & Advisor Endorsement — ${studentName}`;
      headerTitle.textContent = `Mentor & Advisor Endorsement`;
      headerTitle.style.background = 'linear-gradient(135deg, #10b981, #00d4ff)';
      headerTitle.style.webkitBackgroundClip = 'text';
      headerTitle.style.webkitTextFillColor = 'transparent';
      headerSub.textContent = request.course_or_context 
        ? `Mentorship / Focus Area: ${request.course_or_context}`
        : `Please submit a short personal endorsement or letter for ${studentName}.`;
      
      document.getElementById('lbl-quote-excerpt').textContent = 'Endorsement Excerpt / Personal Growth Quote *';
      document.getElementById('quote_excerpt').placeholder = 'Share a brief endorsement quote highlighting growth, leadership, mindset, or personal character...';
      document.getElementById('lbl-school-or-org').textContent = 'Organization, Practice, or Firm';
      document.getElementById('submit-btn').textContent = 'Submit Mentor Endorsement';
      document.getElementById('submit-btn').style.background = 'linear-gradient(135deg, #10b981, #00d4ff)';
    } else {
      headerTitle.textContent = `Teacher Recommendation for ${studentName}`;
      headerSub.textContent = request.course_or_context 
        ? `Academic Context / Subject: ${request.course_or_context}`
        : `Please submit your quote excerpt or recommendation letter.`;
    }

    if (request.teacher_name) {
      document.getElementById('recommender_name').value = request.teacher_name;
    }
    if (request.status === 'completed') {
      showStatus('This recommendation request has already been completed. Thank you!', 'success');
      form.style.display = 'none';
      return;
    }
  } catch (err) {
    showStatus('Failed to connect to server. Please try again later.', 'error');
    form.style.display = 'none';
    return;
  }

  // File Upload Handlers
  fileDropArea.addEventListener('click', () => fileInput.click());

  fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropArea.style.borderColor = '#6c63ff';
    fileDropArea.style.background = 'rgba(108, 99, 255, 0.1)';
  });

  fileDropArea.addEventListener('dragleave', () => {
    fileDropArea.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    fileDropArea.style.background = 'rgba(255, 255, 255, 0.02)';
  });

  fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropArea.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    fileDropArea.style.background = 'rgba(255, 255, 255, 0.02)';
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileUpload(fileInput.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFileUpload(fileInput.files[0]);
    }
  });

  async function handleFileUpload(file) {
    if (!file || file.type !== 'application/pdf') {
      showStatus('Please select a valid PDF file.', 'error');
      return;
    }

    fileDropText.innerHTML = `⏳ Uploading <strong>${file.name}</strong>...`;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch(`/api/recommendation-request/${token}/upload-pdf`, {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();

      if (uploadRes.ok && uploadData.url) {
        pdfUrlInput.value = uploadData.url;
        fileDropText.innerHTML = `✅ Uploaded: <strong>${file.name}</strong>`;
        showStatus('PDF attached successfully!', 'success');
      } else {
        fileDropText.innerHTML = `📄 Drag & drop PDF letter here, or <strong>click to browse</strong>`;
        showStatus(uploadData.error || 'Failed to upload PDF.', 'error');
      }
    } catch (err) {
      fileDropText.innerHTML = `📄 Drag & drop PDF letter here, or <strong>click to browse</strong>`;
      showStatus('PDF upload failed: ' + err.message, 'error');
    }
  }

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    hideStatus();

    const payload = {
      recommender_name: document.getElementById('recommender_name').value.trim(),
      recommender_title: document.getElementById('recommender_title').value.trim(),
      school_or_org: document.getElementById('school_or_org').value.trim(),
      quote_excerpt: document.getElementById('quote_excerpt').value.trim(),
      letter_pdf_url: pdfUrlInput.value
    };

    try {
      const res = await fetch(`/api/recommendation-request/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showStatus('Thank you! Your recommendation has been submitted successfully.', 'success');
        form.style.display = 'none';
      } else {
        showStatus(data.error || 'Failed to submit recommendation.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Recommendation';
      }
    } catch (err) {
      showStatus('Network error: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Recommendation';
    }
  });

  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
    statusMsg.style.display = 'block';
  }

  function hideStatus() {
    statusMsg.style.display = 'none';
  }
});
