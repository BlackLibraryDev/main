const DEFAULT_IMAGE = 'datas/default.png';

let allItems = [];
let i18nData = {};            // language.tsv
let tagTranslateData = {};    // translate.tsv
let contentTranslateData = {};// content_translate.tsv
let currentLang = localStorage.getItem('app_lang') || 'ko';
let selectedTags = [];        // 단일 문자열에서 배열(Array)로 변경 (다중 선택 관리)
let tagSearchQuery = '';      // 사이드바 내부 태그 검색어

// TSV 파싱 함수
function parseTSV(tsvText) {
  const lines = tsvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map((line, index) => {
    if (!line.trim()) return null;
    const values = line.split('\t').map(v => v.trim());
    const item = { id: index + 1 };
    headers.forEach((header, i) => {
      if (header === 'tags') {
        const rawTags = values[i] || '';
        item.tags = rawTags.split(/\s+/).filter(t => t.length > 0);
      } else {
        item[header] = values[i] || '';
      }
    });
    return item;
  }).filter(Boolean);
}

// UI 번역 함수
function t(key, fallback = '') {
  if (i18nData[key] && i18nData[key][currentLang]) {
    return i18nData[key][currentLang];
  }
  return fallback || key;
}

// 태그 번역 함수
function translateTag(tagKey) {
  if (!tagKey) return '';
  const cleanKey = tagKey.toString().replace(/^#/, '').toLowerCase().trim();
  
  if (tagTranslateData[cleanKey] && tagTranslateData[cleanKey][currentLang]) {
    const translated = tagTranslateData[cleanKey][currentLang];
    return translated.startsWith('#') ? translated : '#' + translated;
  }
  
  return tagKey.startsWith('#') ? tagKey : '#' + tagKey;
}

// 콘텐츠 번역 함수
function getContentText(itemKey, type) {
  if (!itemKey) return '';
  const compositeKey = `${itemKey}_${type}`;
  
  if (contentTranslateData[compositeKey] && contentTranslateData[compositeKey][currentLang]) {
    return contentTranslateData[compositeKey][currentLang];
  }
  if (contentTranslateData[compositeKey] && contentTranslateData[compositeKey]['ko']) {
    return contentTranslateData[compositeKey]['ko'];
  }
  return '';
}

// UI 다국어 적용
function updateLanguageUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key, el.textContent);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key, el.placeholder);
  });

  document.getElementById('langSelect').value = currentLang;
}

// 데이터 로더들
async function loadLanguageData() {
  try {
    const res = await fetch('datas/language.tsv');
    if (!res.ok) return;
    const text = await res.text();
    const parsed = parseTSV(text);
    i18nData = {};
    parsed.forEach(row => { if (row.key) i18nData[row.key] = row; });
  } catch (err) {
    console.warn('language.tsv 로드 실패:', err);
  }
}

async function loadTagTranslateData() {
  try {
    const res = await fetch('datas/translate.tsv');
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return;

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    tagTranslateData = {};

    lines.slice(1).forEach(line => {
      if (!line.trim()) return;
      const values = line.split('\t').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });

      const rawKey = row.key || row.tag_key || row.tag || values[0];
      if (rawKey) {
        const cleanKey = rawKey.replace(/^#/, '').toLowerCase().trim();
        tagTranslateData[cleanKey] = row;
      }
    });
  } catch (err) {
    console.warn('translate.tsv 로드 실패:', err);
  }
}

async function loadContentTranslateData() {
  try {
    const res = await fetch('datas/content_translate.tsv');
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return;

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    contentTranslateData = {};

    lines.slice(1).forEach(line => {
      if (!line.trim()) return;
      const values = line.split('\t').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });

      const itemKey = row.item_key || values[0];
      const type = row.type || values[1];

      if (itemKey && type) {
        contentTranslateData[`${itemKey}_${type}`] = row;
      }
    });
  } catch (err) {
    console.warn('content_translate.tsv 로드 실패:', err);
  }
}

function checkImageExists(url) {
  return new Promise((resolve) => {
    if (!url || url.trim() === '') {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function loadContentData() {
  try {
    const res = await fetch('datas/data.tsv');
    if (!res.ok) throw new Error('data.tsv 로드 실패');
    const text = await res.text();
    allItems = parseTSV(text);

    renderTags();
    await renderCards();
  } catch (error) {
    console.error(error);
    document.getElementById('cardGrid').innerHTML = `
      <div class="col-span-full py-12 text-center text-red-500 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900">
        <i class="fa-solid fa-triangle-exclamation text-2xl mb-2 text-red-500"></i>
        <p class="font-medium text-sm" data-i18n="error_loading">${t('error_loading', '데이터를 불러오는 중 오류가 발생했습니다.')}</p>
      </div>
    `;
  }
}

// 사이드바 내 태그 목록 렌더링 (다중 선택 상태 체크 반영)
function renderTags() {
  const tagSet = new Set();
  allItems.forEach(item => {
    if (Array.isArray(item.tags)) {
      item.tags.forEach(tag => tagSet.add(tag.startsWith('#') ? tag : '#' + tag));
    }
  });

  const uniqueTags = Array.from(tagSet);
  const tagContainer = document.getElementById('tagContainer');
  const q = tagSearchQuery.toLowerCase();

  const filteredTags = uniqueTags.filter(tagKey => {
    if (!q) return true;
    const translated = translateTag(tagKey).toLowerCase();
    return tagKey.toLowerCase().includes(q) || translated.includes(q);
  });

  let html = '';

  // '전체' 버튼 (선택된 태그가 없을 때 활성화)
  const isAllActive = selectedTags.length === 0;
  if (!q || '전체'.includes(q) || 'all'.includes(q)) {
    html += `
      <button 
        onclick="toggleTag('ALL')" 
        class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${isAllActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'}"
      >
        <span>${t('tag_all', '전체')}</span>
        ${isAllActive ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
      </button>
    `;
  }

  if (filteredTags.length === 0 && q) {
    html += `
      <div class="text-center py-8 text-slate-400">
        <p class="text-xs">검색된 태그가 없습니다.</p>
      </div>
    `;
  } else {
    filteredTags.forEach(tagKey => {
      const isChecked = selectedTags.includes(tagKey);
      const displayTagText = translateTag(tagKey);

      html += `
        <button 
          onclick="toggleTag('${tagKey}')" 
          class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${isChecked ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'}"
        >
          <span>${displayTagText}</span>
          ${isChecked ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
        </button>
      `;
    });
  }

  tagContainer.innerHTML = html;

  // 선택된 태그 개수 및 뱃지 표시
  const selectedTagBadge = document.getElementById('selectedTagBadge');
  const selectedTagText = document.getElementById('selectedTagText');
  const activeFilterBadge = document.getElementById('activeFilterBadge');

  if (selectedTags.length > 0) {
    selectedTagText.textContent = `선택됨 (${selectedTags.length})`;
    selectedTagBadge.classList.remove('hidden');
    activeFilterBadge.classList.remove('hidden');
  } else {
    selectedTagBadge.classList.add('hidden');
    activeFilterBadge.classList.add('hidden');
  }
}

// 메인 카드 목록 렌더링 (다중 선택 태그 모두 포함하는 AND 또는 OR 조건 필터링)
async function renderCards() {
  const cardGrid = document.getElementById('cardGrid');
  const emptyState = document.getElementById('emptyState');
  const countNumber = document.getElementById('countNumber');
  const resetBtn = document.getElementById('resetBtn');

  const filtered = allItems.filter(item => {
    if (selectedTags.length === 0) return true;
    const itemTags = (item.tags || []).map(t => t.startsWith('#') ? t : '#' + t);
    
    // OR 조건: 선택된 태그 중 하나라도 포함되면 표시하려면 some 사용
    // AND 조건: 선택된 태그를 모두 포함해야 하면 every 사용 (보통 다중선택은 OR 조건이 직관적입니다)
    return selectedTags.some(tag => itemTags.includes(tag));
  });

  countNumber.textContent = filtered.length;

  if (selectedTags.length > 0) {
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }

  if (filtered.length === 0) {
    cardGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const validatedItems = await Promise.all(
    filtered.map(async (item) => {
      const exists = await checkImageExists(item.image);
      return {
        ...item,
        displayImage: exists ? item.image : DEFAULT_IMAGE
      };
    })
  );

  cardGrid.innerHTML = validatedItems.map(item => {
    const title = getContentText(item.item_key, 'title') || t('no_image_title', '제목 없음');
    const description = getContentText(item.item_key, 'desc');

    return `
      <article 
        onclick="openModal(${item.id})"
        class="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer group dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
      >
        <div class="relative w-full h-48 bg-slate-100 overflow-hidden">
          <img 
            src="${item.displayImage}" 
            alt="${title}" 
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>

        <div class="p-5 flex-1 flex flex-col justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900 mb-1.5 line-clamp-1 group-hover:text-indigo-600 transition-colors dark:text-slate-200">${title}</h2>
            <p class="text-slate-600 text-xs leading-relaxed line-clamp-2 mb-4 dark:text-slate-400">${description}</p>
          </div>

          <div class="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <div class="flex flex-wrap gap-1.5 max-h-7">
              ${(item.tags || []).map(tagKey => {
                const cleanKey = tagKey.startsWith('#') ? tagKey : '#' + tagKey;
                return `
                  <button 
                    onclick="event.stopPropagation(); filterByTag('${cleanKey}');" 
                    class="text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors dark:text-slate-400 dark:bg-slate-950/60 dark:hover:bg-slate-900"
                  >
                    ${translateTag(cleanKey)}
                  </button>
                `;
              }).join('')}
            </div>

            ${item.link.length>0 ? `
              <a 
                href="${item.link}" 
                target="_blank" 
                rel="noopener noreferrer"
                onclick="event.stopPropagation();"
                title="외부 링크 이동"
                class="shrink-0 p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
              </a>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// 사이드바 팝업 제어
function openSidebar() {
  const overlay = document.getElementById('sidebarOverlay');
  const drawer = document.getElementById('sidebarDrawer');
  
  overlay.classList.remove('pointer-events-none', 'opacity-0');
  overlay.classList.add('opacity-100');
  drawer.classList.remove('-translate-x-full');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const overlay = document.getElementById('sidebarOverlay');
  const drawer = document.getElementById('sidebarDrawer');
  
  overlay.classList.remove('opacity-100');
  overlay.classList.add('opacity-0', 'pointer-events-none');
  drawer.classList.add('-translate-x-full');
  document.body.style.overflow = '';
}

document.getElementById('sidebarOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'sidebarOverlay') closeSidebar();
});

// 모달 열기/닫기
function openModal(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const modalDescription = document.getElementById('modalDescription');
  const modalTags = document.getElementById('modalTags');
  const modalExternalLink = document.getElementById('modalExternalLink');

  checkImageExists(item.image).then(exists => {
    modalImage.src = exists ? item.image : DEFAULT_IMAGE;
  });

  const title = getContentText(item.item_key, 'title') || t('no_image_title', '제목 없음');
  const description = getContentText(item.item_key, 'desc');

  modalTitle.textContent = title;
  modalDescription.textContent = description;

  modalTags.innerHTML = (item.tags || []).map(tagKey => {
    const cleanKey = tagKey.startsWith('#') ? tagKey : '#' + tagKey;
    return `
      <button 
        onclick="closeModal(); toggleTag('${cleanKey}'); openSidebar();" 
        class="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 px-2.5 py-1 rounded-md transition-colors"
      >
        ${translateTag(cleanKey)}
      </button>
    `;
  }).join('');

  if (item.link) {
    modalExternalLink.href = item.link;
    modalExternalLink.classList.remove('hidden');
  } else {
    modalExternalLink.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('detailModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebar();
    closeModal();
  }
});

// 다중 태그 토글 동작 (클릭하면 추가되고, 이미 있으면 해제됨)
async function toggleTag(tagKey) {
  if (tagKey === 'ALL') {
    selectedTags = []; // '전체'를 누르면 선택 초기화
  } else {
    const index = selectedTags.indexOf(tagKey);
    if (index > -1) {
      selectedTags.splice(index, 1); // 이미 선택되어 있으면 제거
    } else {
      selectedTags.push(tagKey); // 선택되어 있지 않으면 추가
    }
  }
  renderTags();
  await renderCards();
}

// 필터 및 검색 초기화
async function resetAllFilters() {
  selectedTags = [];
  tagSearchQuery = '';
  document.getElementById('tagSearchInput').value = '';
  renderTags();
  await renderCards();
}

// 야간 모드 기능
function initDarkMode() {
  const isDark = localStorage.getItem('app_dark_mode') === 'true';
  if (isDark) {
    document.documentElement.classList.add('dark');
    updateDarkModeIcon(true);
  } else {
    document.documentElement.classList.remove('dark');
    updateDarkModeIcon(false);
  }
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('app_dark_mode', isDark);
  updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
  const icon = document.getElementById('darkModeIcon');
  if (!icon) return;
  if (isDark) {
    icon.className = 'fa-solid fa-moon text-xs text-amber-400';
  } else {
    icon.className = 'fa-solid fa-sun text-xs text-amber-400';
  }
}

// 이벤트 리스너들
document.getElementById('langSelect').addEventListener('change', async (e) => {
  currentLang = e.target.value;
  localStorage.setItem('app_lang', currentLang);
  updateLanguageUI();
  renderTags();
  await renderCards();
});

document.getElementById('tagSearchInput').addEventListener('input', (e) => {
  tagSearchQuery = e.target.value.trim();
  renderTags();
});

// 앱 초기화
async function init() {
  initDarkMode();
  await Promise.all([
    loadLanguageData(),
    loadTagTranslateData(),
    loadContentTranslateData()
  ]);
  updateLanguageUI();
  await loadContentData();
}

init();