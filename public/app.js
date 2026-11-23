const STATUS_STEPS = [
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'in_design', label: 'In Design' },
  { key: 'in_production', label: 'In Production' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_LABELS = {
  uploaded: 'Uploaded',
  in_design: 'In Design',
  in_production: 'In Production',
  delivered: 'Delivered',
};

const state = {
  selectedFile: null,
  imageWidth: null,
  imageHeight: null,
  createdOrderCode: null,
  activeFilter: 'all',
  searchQuery: '',
  currentOrder: null,
};

// Elements
const views = {
  upload: document.getElementById('viewUpload'),
  orders: document.getElementById('viewOrders'),
  track: document.getElementById('viewTrack'),
};
const navButtons = document.querySelectorAll('.nav-btn');
const ordersCountBadge = document.getElementById('ordersCountBadge');

const uploadForm = document.getElementById('uploadForm');
const uploadZone = document.getElementById('uploadZone');
const photoInput = document.getElementById('photoInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreviewWrap = document.getElementById('uploadPreviewWrap');
const uploadPreviewImg = document.getElementById('uploadPreviewImg');
const uploadFileName = document.getElementById('uploadFileName');
const uploadFileSpecs = document.getElementById('uploadFileSpecs');
const changePhotoBtn = document.getElementById('changePhotoBtn');
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const uploadError = document.getElementById('uploadError');
const submitOrderBtn = document.getElementById('submitOrderBtn');

const uploadSuccessCard = document.getElementById('uploadSuccessCard');
const createdOrderCodeEl = document.getElementById('createdOrderCode');
const viewCreatedOrderBtn = document.getElementById('viewCreatedOrderBtn');
const copyCreatedLinkBtn = document.getElementById('copyCreatedLinkBtn');
const newUploadBtn = document.getElementById('newUploadBtn');

const ordersGrid = document.getElementById('ordersGrid');
const ordersEmpty = document.getElementById('ordersEmpty');
const ordersSearchInput = document.getElementById('ordersSearchInput');
const statusFilterPills = document.getElementById('statusFilterPills');
const emptyUploadBtn = document.getElementById('emptyUploadBtn');

const trackLookupForm = document.getElementById('trackLookupForm');
const trackCodeInput = document.getElementById('trackCodeInput');
const trackError = document.getElementById('trackError');
const orderDetailContainer = document.getElementById('orderDetailContainer');
const toastEl = document.getElementById('toast');

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getShareUrl(code) {
  return `${window.location.origin}/order/${encodeURIComponent(code)}`;
}

async function copyShareLink(code) {
  const url = getShareUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    showToast(`Copied link for ${code}`);
  } catch {
    window.prompt('Copy this shareable order link:', url);
  }
}

function switchView(viewName, { pushUrl = true } = {}) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle('active', key === viewName);
  });
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (pushUrl && viewName !== 'track') {
    window.history.pushState({}, '', '/');
  }

  if (viewName === 'orders') {
    loadOrders();
  }
}

// Navigation events
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('brandLink').addEventListener('click', (e) => {
  e.preventDefault();
  switchView('upload');
});

emptyUploadBtn.addEventListener('click', () => switchView('upload'));

// File Selection (NO compression, preserves exact original file)
function handleSelectedFile(file) {
  if (!file) return;
  state.selectedFile = file;
  state.imageWidth = null;
  state.imageHeight = null;

  uploadFileName.textContent = file.name;
  uploadFileSpecs.textContent = `Original file: ${formatBytes(file.size)}`;
  uploadPlaceholder.classList.add('hidden');
  uploadPreviewWrap.classList.remove('hidden');
  uploadError.classList.add('hidden');

  const objectUrl = URL.createObjectURL(file);
  uploadPreviewImg.src = objectUrl;
  uploadPreviewImg.onload = () => {
    state.imageWidth = uploadPreviewImg.naturalWidth || null;
    state.imageHeight = uploadPreviewImg.naturalHeight || null;
    const res = state.imageWidth && state.imageHeight
      ? `${state.imageWidth} × ${state.imageHeight} px • `
      : '';
    uploadFileSpecs.textContent = `${res}${formatBytes(file.size)} (Original Quality)`;
  };
  uploadPreviewImg.onerror = () => {
    // Some formats like HEIC may not render in desktop browsers, but file still uploads fine
    uploadFileSpecs.textContent = `${formatBytes(file.size)} (Original Quality)`;
  };
}

photoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleSelectedFile(e.target.files[0]);
  }
});

changePhotoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  photoInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleSelectedFile(e.dataTransfer.files[0]);
  }
});

// Submit New Order
uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();
  uploadError.classList.add('hidden');

  if (!state.selectedFile) {
    uploadError.textContent = 'Please select a high-resolution guest photo first.';
    uploadError.classList.remove('hidden');
    return;
  }

  const formData = new FormData();
  formData.append('photo', state.selectedFile, state.selectedFile.name);
  formData.append('notes', document.getElementById('notes').value.trim());
  if (state.imageWidth) formData.append('imageWidth', String(state.imageWidth));
  if (state.imageHeight) formData.append('imageHeight', String(state.imageHeight));

  submitOrderBtn.disabled = true;
  uploadProgressWrap.classList.remove('hidden');
  uploadProgressBar.style.width = '0%';
  uploadProgressText.textContent = 'Uploading original photo... 0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/orders');

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const pct = Math.round((event.loaded / event.total) * 100);
      uploadProgressBar.style.width = `${pct}%`;
      uploadProgressText.textContent = `Uploading original photo... ${pct}%`;
    }
  };

  xhr.onload = () => {
    submitOrderBtn.disabled = false;
    uploadProgressWrap.classList.add('hidden');

    let data = {};
    try {
      data = JSON.parse(xhr.responseText);
    } catch {
      data = {};
    }

    if (xhr.status >= 200 && xhr.status < 300 && data.order) {
      state.createdOrderCode = data.order.order_code;
      createdOrderCodeEl.textContent = data.order.order_code;
      uploadForm.classList.add('hidden');
      uploadSuccessCard.classList.remove('hidden');
      refreshOrderCount();
      showToast(`Order ${data.order.order_code} created`);
    } else {
      uploadError.textContent = data.error || 'Upload failed. Please try again.';
      uploadError.classList.remove('hidden');
    }
  };

  xhr.onerror = () => {
    submitOrderBtn.disabled = false;
    uploadProgressWrap.classList.add('hidden');
    uploadError.textContent = 'Network error while uploading photo.';
    uploadError.classList.remove('hidden');
  };

  xhr.send(formData);
});

viewCreatedOrderBtn.addEventListener('click', () => {
  if (state.createdOrderCode) {
    openOrderDetail(state.createdOrderCode);
  }
});

copyCreatedLinkBtn.addEventListener('click', () => {
  if (state.createdOrderCode) {
    copyShareLink(state.createdOrderCode);
  }
});

newUploadBtn.addEventListener('click', () => {
  uploadForm.reset();
  state.selectedFile = null;
  state.imageWidth = null;
  state.imageHeight = null;
  uploadPreviewWrap.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
  uploadSuccessCard.classList.add('hidden');
  uploadForm.classList.remove('hidden');
});

// Orders Board
async function refreshOrderCount() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (Array.isArray(data.orders)) {
      ordersCountBadge.textContent = String(data.orders.length);
    }
  } catch {
    // ignore
  }
}

async function loadOrders() {
  const params = new URLSearchParams();
  if (state.activeFilter && state.activeFilter !== 'all') {
    params.set('status', state.activeFilter);
  }
  if (state.searchQuery.trim()) {
    params.set('q', state.searchQuery.trim());
  }

  const res = await fetch(`/api/orders?${params.toString()}`);
  const data = await res.json();
  const orders = data.orders || [];

  if (state.activeFilter === 'all' && !state.searchQuery.trim()) {
    ordersCountBadge.textContent = String(orders.length);
  }

  if (orders.length === 0) {
    ordersGrid.innerHTML = '';
    ordersEmpty.classList.remove('hidden');
    return;
  }

  ordersEmpty.classList.add('hidden');
  ordersGrid.innerHTML = orders
    .map((o) => {
      const resLabel = o.image_width && o.image_height ? `${o.image_width}×${o.image_height} • ` : '';
      return `
        <article class="order-card" data-code="${escapeHtml(o.order_code)}">
          <img class="order-thumb" src="${escapeHtml(o.originalUrl)}" alt="${escapeHtml(o.order_code)}" loading="lazy" />
          <div class="order-card-body">
            <div class="order-card-top">
              <span class="order-code-tag">${escapeHtml(o.order_code)}</span>
              <span class="status-pill status-${escapeHtml(o.status)}">${escapeHtml(STATUS_LABELS[o.status] || o.status)}</span>
            </div>
            <div class="order-card-meta">${resLabel}${formatBytes(o.file_size)} • ${formatDate(o.created_at)}</div>
            ${o.notes ? `<div class="order-card-note">${escapeHtml(o.notes)}</div>` : ''}
          </div>
        </article>
      `;
    })
    .join('');

  ordersGrid.querySelectorAll('.order-card').forEach((card) => {
    card.addEventListener('click', () => openOrderDetail(card.dataset.code));
  });
}

statusFilterPills.querySelectorAll('.pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    statusFilterPills.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.activeFilter = pill.dataset.status;
    loadOrders();
  });
});

let searchDebounce;
ordersSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchQuery = ordersSearchInput.value;
    loadOrders();
  }, 200);
});

// Track & Order Detail
trackLookupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = trackCodeInput.value.trim().toUpperCase();
  if (code) {
    openOrderDetail(code);
  }
});

async function openOrderDetail(orderCode) {
  const code = String(orderCode || '').trim().toUpperCase();
  switchView('track', { pushUrl: false });
  trackCodeInput.value = code;
  trackError.classList.add('hidden');
  window.history.pushState({}, '', `/order/${encodeURIComponent(code)}`);

  const res = await fetch(`/api/orders/${encodeURIComponent(code)}`);
  const data = await res.json();

  if (!res.ok || !data.order) {
    orderDetailContainer.innerHTML = '';
    trackError.textContent = data.error || `Order ${code} not found.`;
    trackError.classList.remove('hidden');
    return;
  }

  state.currentOrder = data.order;
  renderOrderDetail(data.order);
}

function renderOrderDetail(order) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const resText =
    order.image_width && order.image_height
      ? `${order.image_width} × ${order.image_height} px`
      : 'Original resolution';

  const stepperHtml = STATUS_STEPS.map((step, idx) => {
    const cls = idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : '';
    return `
      <div class="step ${cls}">
        <div class="step-num">Step ${idx + 1}</div>
        <div class="step-label">${escapeHtml(step.label)}</div>
      </div>
    `;
  }).join('');

  const updatesHtml = (order.updates || [])
    .slice()
    .reverse()
    .map((u) => {
      const roleLabel = u.author_role === 'studio' ? 'Art Studio' : 'Furama Resort';
      const who = u.author_name ? `${u.author_name} (${roleLabel})` : roleLabel;
      const statusTag = u.status_changed_to
        ? ` • <strong>${escapeHtml(STATUS_LABELS[u.status_changed_to] || u.status_changed_to)}</strong>`
        : '';
      return `
        <div class="timeline-item">
          <div class="timeline-head">
            <span>${escapeHtml(who)}${statusTag}</span>
            <span>${formatDate(u.created_at)}</span>
          </div>
          <div class="timeline-note">${escapeHtml(u.note)}</div>
        </div>
      `;
    })
    .join('');

  orderDetailContainer.innerHTML = `
    <div class="card">
      <div class="detail-header">
        <div>
          <div class="hero-eyebrow">Furama Custom Art Order</div>
          <h2>${escapeHtml(order.order_code)}</h2>
          <span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn-secondary" id="detailCopyLinkBtn">Copy Share Link</button>
          <a class="btn-primary" href="${escapeHtml(order.downloadUrl)}">Download Original (${formatBytes(order.file_size)})</a>
        </div>
      </div>

      <div class="stepper">${stepperHtml}</div>

      <div class="detail-grid">
        <div class="photo-box">
          <h3>Guest Original Photo</h3>
          <img src="${escapeHtml(order.originalUrl)}" alt="Guest photo for ${escapeHtml(order.order_code)}" />
          <div class="spec-list">
            <div><span class="spec-label">Resolution</span><strong>${escapeHtml(resText)}</strong></div>
            <div><span class="spec-label">Original File</span><strong>${escapeHtml(order.original_filename)} (${formatBytes(order.file_size)})</strong></div>
            <div><span class="spec-label">Uploaded</span><strong>${formatDate(order.created_at)}</strong></div>
            <div><span class="spec-label">Last Updated</span><strong>${formatDate(order.updated_at)}</strong></div>
          </div>

          ${
            order.artworkUrl
              ? `
              <div style="margin-top: 14px;">
                <h3>Designer Artwork Preview</h3>
                <img src="${escapeHtml(order.artworkUrl)}" alt="Artwork preview for ${escapeHtml(order.order_code)}" />
              </div>
            `
              : ''
          }
        </div>

        <div>
          <h3>Progress &amp; Notes</h3>
          <form id="addNoteForm" style="margin-top: 10px;">
            <div class="form-grid" style="margin-bottom: 10px;">
              <div class="field">
                <label for="noteAuthorRole">Posted By</label>
                <select id="noteAuthorRole">
                  <option value="resort">Furama Resort</option>
                  <option value="studio">Art Studio / Designer</option>
                </select>
              </div>
              <div class="field">
                <label for="noteAuthorName">Name (optional)</label>
                <input type="text" id="noteAuthorName" placeholder="e.g. Concierge / Designer" />
              </div>
            </div>
            <div class="field">
              <label for="newNoteText">Add a Note</label>
              <textarea id="newNoteText" rows="2" placeholder="Add framing update, guest feedback, or delivery note..." required></textarea>
            </div>
            <button type="submit" class="btn-secondary">Post Note</button>
          </form>

          <div class="studio-controls">
            <h3>Update Order Progress (Studio)</h3>
            <div class="field" style="margin-top: 8px;">
              <label for="statusUpdateNote">Optional Progress Note</label>
              <input type="text" id="statusUpdateNote" placeholder="e.g. Artwork finalized, printing on cotton art paper..." />
            </div>
            <div class="status-btn-row">
              ${STATUS_STEPS.map(
                (s) => `
                  <button
                    type="button"
                    class="${s.key === order.status ? 'btn-primary' : 'btn-ghost'} status-action-btn"
                    data-status="${s.key}"
                  >
                    ${escapeHtml(s.label)}
                  </button>
                `
              ).join('')}
            </div>

            <form id="artworkUploadForm" style="margin-top: 16px;">
              <label for="artworkFileInput">Upload Designer Artwork Preview (optional)</label>
              <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                <input type="file" id="artworkFileInput" accept="image/*" required />
                <button type="submit" class="btn-ghost">Upload Preview</button>
              </div>
            </form>
          </div>

          <div class="studio-controls">
            <h3>Timeline</h3>
            <div class="timeline">${updatesHtml}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detailCopyLinkBtn').addEventListener('click', () => {
    copyShareLink(order.order_code);
  });

  document.getElementById('addNoteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = document.getElementById('newNoteText').value.trim();
    if (!note) return;
    const authorRole = document.getElementById('noteAuthorRole').value;
    const authorName = document.getElementById('noteAuthorName').value.trim();

    const r = await fetch(`/api/orders/${encodeURIComponent(order.order_code)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, authorRole, authorName }),
    });
    const d = await r.json();
    if (r.ok && d.order) {
      showToast('Note added');
      renderOrderDetail(d.order);
    }
  });

  orderDetailContainer.querySelectorAll('.status-action-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextStatus = btn.dataset.status;
      const note = document.getElementById('statusUpdateNote').value.trim();
      const r = await fetch(`/api/orders/${encodeURIComponent(order.order_code)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, note, authorRole: 'studio', authorName: 'Art Studio' }),
      });
      const d = await r.json();
      if (r.ok && d.order) {
        showToast(`Status updated to ${STATUS_LABELS[nextStatus]}`);
        renderOrderDetail(d.order);
      }
    });
  });

  document.getElementById('artworkUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('artworkFileInput');
    if (!fileInput.files || !fileInput.files[0]) return;
    const fd = new FormData();
    fd.append('artwork', fileInput.files[0]);
    const r = await fetch(`/api/orders/${encodeURIComponent(order.order_code)}/artwork`, {
      method: 'POST',
      body: fd,
    });
    const d = await r.json();
    if (r.ok && d.order) {
      showToast('Artwork preview uploaded');
      renderOrderDetail(d.order);
    }
  });
}

// Handle direct shareable URL (/order/FUR-2611-0001) on load & back/forward
function syncFromUrl() {
  const match = window.location.pathname.match(/^\/order\/([^/]+)$/i);
  if (match) {
    openOrderDetail(decodeURIComponent(match[1]));
  } else {
    switchView('upload', { pushUrl: false });
  }
}

window.addEventListener('popstate', syncFromUrl);
refreshOrderCount();
syncFromUrl();
