const DEFAULT_IMAGE = 'datas/images/default.png';

let allItems = [];
let i18nData = {};            // language.tsv
let tagTranslateData = {};    // translate.tsv
let contentTranslateData = {};// content_translate.tsv
let currentLang = localStorage.getItem('app_lang') || 'ko';
let selectedTags = [];        // 다중 선택된 태그 배열
let tagSearchQuery = '';      // 사이드바 내부 태그 검색어

let currentImageIndex = 0;
let modalImagesArray = [];

// TSV 파싱 함수 (category 컬럼 지원)
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
    // category가 없는 데이터 대비 기본값 처리
    if (!item.category) item.category = 'general';
    return item;
  }).filter(Boolean);
}
// 1. 쉼표(,) 기준으로 이미지 경로를 파싱하는 함수
function parseImages(imageField) {
  if (!imageField) return [];
  // 쉼표(,)를 기준으로 나누고 앞뒤 공백 제거, 빈 값 필터링
  return imageField.split(',').map(img => img.trim()).filter(img => img.length > 0);
}
// 2. 모달 내부 슬라이더 렌더링 (1장일 때는 화살표/인디케이터 숨김)
// 모달 내부 슬라이더 렌더링 함수 수정 (부모 컨테이너 이격 및 높이 문제 해결)
function renderModalSlider(container) {
  const hasMultiple = modalImagesArray.length > 1;

  container.innerHTML = `
    <div class="relative w-full bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center group p-2">
      <!-- 이미지 표시: 고정 높이 대신 최대 높이를 제한하고 비율 유지 -->
      <img 
        id="modalActiveImage" 
        src="${modalImagesArray[currentImageIndex]}" 
        alt="Detail Image" 
        class="w-full max-h-[350px] object-cover transition-all duration-300"
        onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Image+Error'"
      />

      <!-- 좌우 슬라이드 버튼 (사진이 2장 이상일 때만 노출) -->
      ${hasMultiple ? `
        <button 
          onclick="event.stopPropagation(); slideModalImage(-1)" 
          class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-80 group-hover:opacity-100 cursor-pointer"
          title="이전 사진"
        >
          <i class="fa-solid fa-chevron-left text-sm"></i>
        </button>
        <button 
          onclick="event.stopPropagation(); slideModalImage(1)" 
          class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-80 group-hover:opacity-100 cursor-pointer"
          title="다음 사진"
        >
          <i class="fa-solid fa-chevron-right text-sm"></i>
        </button>

        <!-- 하단 점(Dot) 인디케이터 컨테이너 -->
        <div class="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/40 backdrop-blur-sm rounded-full flex items-center gap-1.5 pointer-events-none" id="modalDotsContainer">
          ${modalImagesArray.map((_, idx) => `
            <span class="w-2 h-2 rounded-full transition-all duration-300 ${idx === currentImageIndex ? 'bg-white w-4' : 'bg-white/40'}"></span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// 슬라이드 인덱스 변경 함수
function slideModalImage(direction) {
  if (modalImagesArray.length <= 1) return;
  
  currentImageIndex = (currentImageIndex + direction + modalImagesArray.length) % modalImagesArray.length;
  
  const activeImg = document.getElementById('modalActiveImage');
  if (activeImg) {
    activeImg.src = modalImagesArray[currentImageIndex];
  }

  // 점(Dot) 인디케이터 활성화 상태 갱신
  const dotsContainer = document.getElementById('modalDotsContainer');
  if (dotsContainer) {
    const dots = dotsContainer.children;
    for (let i = 0; i < dots.length; i++) {
      if (i === currentImageIndex) {
        dots[i].className = 'w-4 h-2 rounded-full transition-all duration-300 bg-white';
      } else {
        dots[i].className = 'w-2 h-2 rounded-full transition-all duration-300 bg-white/40';
      }
    }
  }
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
  
  return tagKey.startsWith('#`') ? tagKey : (tagKey.startsWith('#') ? tagKey : '#' + tagKey);
}

// 카테고리 번역 함수 (translate.tsv 또는 기본 키 활용)
function translateCategory(categoryKey) {
  if (!categoryKey) return '';
  const cleanKey = categoryKey.toString().replace(/^#/, '').toLowerCase().trim();
  
  // 번역 데이터에 있으면 번역 적용, 없으면 첫글자 대문자화 등 기본 처리
  if (tagTranslateData[cleanKey] && tagTranslateData[cleanKey][currentLang]) {
    return tagTranslateData[cleanKey][currentLang];
  }
  return categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
}

// 콘텐츠 번역 함수
function getContentText(itemKey, type) {
  let text = '';
  const compositeKey = `${itemKey}_${type}`;
  
  if (contentTranslateData[compositeKey] && contentTranslateData[compositeKey][currentLang]) {
    text = contentTranslateData[compositeKey][currentLang];
  } else if (contentTranslateData[compositeKey] && contentTranslateData[compositeKey]['ko']) {
    text = contentTranslateData[compositeKey]['ko'];
  }

  // TSV 안에 적힌 글자 '\n'을 실제 줄바꿈으로 변환
  return text ? text.replace(/\\n/g, '\n') : '';
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
    img.src = url.split(',')[0].trim(); // 쉼표로 구분된 경우 첫 번째 이미지 경로만 확인
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

// 사이드바 내 카테고리별 태그 그룹 렌더링
function renderTags() {
  const categoryMap = {};
  allItems.forEach(item => {
    const cat = item.category || 'general';
    if (!categoryMap[cat]) {
      categoryMap[cat] = new Set();
    }
    if (Array.isArray(item.tags)) {
      item.tags.forEach(tag => categoryMap[cat].add(tag.startsWith('#') ? tag : '#' + tag));
    }
  });

  const tagContainer = document.getElementById('tagContainer');
  const q = tagSearchQuery.toLowerCase();
  let html = '';

  // '전체' 선택 버튼
  const isAllActive = selectedTags.length === 0;
  if (!q || '전체'.includes(q) || 'all'.includes(q)) {
    html += `
      <button 
        onclick="toggleTag('ALL')" 
        class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all mb-3 ${isAllActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'}"
      >
        <span>${t('tag_all', '전체')}</span>
        ${isAllActive ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
      </button>
    `;
  }

  let hasVisibleTags = false;

  Object.keys(categoryMap).forEach(catKey => {
    const rawTags = Array.from(categoryMap[catKey]);
    
    const filteredTags = rawTags.filter(tagKey => {
      if (!q) return true;
      const translated = translateTag(tagKey).toLowerCase();
      const catTranslated = translateCategory(catKey).toLowerCase();
      return tagKey.toLowerCase().includes(q) || translated.includes(q) || catTranslated.includes(q);
    });

    if (filteredTags.length > 0) {
      hasVisibleTags = true;
      const displayCategoryName = translateCategory(catKey);

      // 해당 카테고리의 모든 태그가 선택되어 있는지 확인
      const isCategoryAllSelected = rawTags.length > 0 && rawTags.every(tag => selectedTags.includes(tag));
      // 다국어 키 결정
      const actionKey = isCategoryAllSelected ? 'reset_filter' : 'tag_all';
      const actionText = t(actionKey, isCategoryAllSelected ? '전체 해제' : '전체 선택');
      html += `
        <div class="mb-4">
          <!-- 카테고리 제목 (다국어 지원 텍스트 적용) -->
          <button 
            onclick="toggleCategory('${catKey}')"
            class="w-full text-left text-[11px] font-bold uppercase tracking-wider mb-2 px-1 flex items-center justify-between group transition-colors"
          >
            <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              <i class="fa-solid fa-folder-open text-xs text-indigo-500"></i>
              <span>${displayCategoryName}</span>
            </div>
            <span 
              data-i18n="${actionKey}"
              class="text-[10px] font-medium px-1.5 py-0.5 rounded ${isCategoryAllSelected ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300' : 'text-slate-400 opacity-0 group-hover:opacity-100'} transition-all"
            >
              ${actionText}
            </span>
          </button>
          
          <div class="flex flex-col gap-1.5 pl-1">
      `;

      filteredTags.forEach(tagKey => {
        const isChecked = selectedTags.includes(tagKey);
        const displayTagText = translateTag(tagKey);

        html += `
          <button 
            onclick="toggleTag('${tagKey}')" 
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${isChecked ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}"
          >
            <span>${displayTagText}</span>
            ${isChecked ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
          </button>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }
  });

  if (!hasVisibleTags && q) {
    html += `
      <div class="text-center py-8 text-slate-400">
        <p class="text-xs">검색된 카테고리/태그가 없습니다.</p>
      </div>
    `;
  }

  tagContainer.innerHTML = html;

  // 상단 선택된 태그 개별 뱃지 컨테이너 업데이트
  const selectedTagsContainer = document.getElementById('selectedTagsContainer');
  const activeFilterBadge = document.getElementById('activeFilterBadge'); // (만약 헤더 필터 아이콘에 뱃지가 있다면 유지)
  const resetBtn = document.getElementById('resetBtn');

  if (selectedTags.length > 0) {
    selectedTagsContainer.classList.remove('hidden');
    if (resetBtn) resetBtn.classList.remove('hidden');
    if (activeFilterBadge) activeFilterBadge.classList.remove('hidden');

    // 선택된 각 태그를 개별 상자(뱃지)로 생성
    selectedTagsContainer.innerHTML = selectedTags.map(tagKey => {
      const displayTagText = translateTag(tagKey);
      return `
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900 px-2.5 py-1 rounded-full shadow-2xs">
          <span>${displayTagText}</span>
          <button 
            onclick="toggleTag('${tagKey}')" 
            class="w-4 h-4 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-200 transition-colors"
            title="필터 해제"
          >
            <i class="fa-solid fa-xmark text-[10px]"></i>
          </button>
        </span>
      `;
    }).join('');
  } else {
    selectedTagsContainer.classList.add('hidden');
    selectedTagsContainer.innerHTML = '';
    if (resetBtn) resetBtn.classList.add('hidden');
    if (activeFilterBadge) activeFilterBadge.classList.add('hidden');
  
  }
}
// 특정 카테고리의 모든 하위 태그 토글 (전체 선택 / 전체 해제)
async function toggleCategory(categoryKey) {
  // 해당 카테고리에 속한 모든 태그 수집
  const categoryTags = new Set();
  allItems.forEach(item => {
    const cat = item.category || 'general';
    if (cat === categoryKey && Array.isArray(item.tags)) {
      item.tags.forEach(tag => categoryTags.add(tag.startsWith('#') ? tag : '#' + tag));
    }
  });

  const tagsArray = Array.from(categoryTags);
  if (tagsArray.length === 0) return;

  // 이미 모든 태그가 선택되어 있는지 확인
  const isAllSelected = tagsArray.every(tag => selectedTags.includes(tag));

  if (isAllSelected) {
    // 모두 선택되어 있다면 해당 카테고리의 태그들을 모두 제거
    selectedTags = selectedTags.filter(tag => !tagsArray.includes(tag));
  } else {
    // 하나라도 안 되어 있다면 해당 카테고리의 태그들을 모두 추가 (중복 방지)
    tagsArray.forEach(tag => {
      if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
      }
    });
  }

  renderTags();
  await renderCards();
}


// 메인 카드 목록 렌더링
async function renderCards() {
  const cardGrid = document.getElementById('cardGrid');
  const emptyState = document.getElementById('emptyState');
  const countNumber = document.getElementById('countNumber');
  const resetBtn = document.getElementById('resetBtn');

  const filtered = allItems.filter(item => {
    if (selectedTags.length === 0) return true;
    const itemTags = (item.tags || []).map(t => t.startsWith('#') ? t : '#' + t);
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
    const description = getContentText(item.item_key, 'desc')

    // 쉼표로 구분된 이미지 중 맨 첫 번째(대표) 이미지 추출
    const imagesArray = parseImages(item.image);
    const firstImage = imagesArray.length > 0 ? imagesArray[0] : DEFAULT_IMAGE;

    return `
      <article 
        onclick="openModal(${item.id})"
        class="bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer group"
      >
        <div class="relative w-full h-48 bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <img 
            src="${firstImage}" 
            alt="${title}" 
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>

        <div class="p-5 flex-1 flex flex-col justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${title}</h2>
            <p class="text-slate-600 dark:text-slate-300 text-xs leading-relaxed line-clamp-2 mb-4 whitespace-pre-line">${description}</p>
          </div>

         <div class="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div class="flex flex-wrap gap-1.5 overflow-hidden max-h-7 items-center">

              <!-- 1. 대분류 카테고리 뱃지 (클릭 시 해당 카테고리 하위 태그 전체 선택/토글 및 사이드바 오픈) -->
              ${item.category ? `
                <button 
                  onclick="event.stopPropagation(); toggleCategory('${item.category}'); //openSidebar();" 
                  title="카테고리 전체 선택"
                  class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  ${translateCategory(item.category)}
                </button>
              ` : ''}
              <!-- 2. 기존 태그 뱃지 목록 -->
              ${(item.tags || []).map(tagKey => {
                const cleanKey = tagKey.startsWith('#') ? tagKey : '#' + tagKey;
                return `
                  <button 
                    onclick="event.stopPropagation(); toggleTag('${cleanKey}'); //openSidebar();" 
                    class="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 px-2 py-0.5 rounded transition-colors"
                  >
                    ${translateTag(cleanKey)}
                  </button>
                `;
              }).join('')}
            </div>

            ${item.link ? `
              <a 
                href="${item.link}" 
                target="_blank" 
                rel="noopener noreferrer"
                onclick="event.stopPropagation();"
                title="외부 링크 이동"
                class="shrink-0 py-1 px-4 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:bg-slate-800 rounded-lg transition-colors"
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
  //const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const modalDescription = document.getElementById('modalDescription');
  const modalTags = document.getElementById('modalTags');
  const modalExternalLink = document.getElementById('modalExternalLink');

  

  const title = getContentText(item.item_key, 'title') || t('no_image_title', '제목 없음');
  const description = getContentText(item.item_key, 'desc');

  modalTitle.textContent = title;
  modalDescription.textContent = description;

  // 1. 이미지 배열 파싱 (\ 기호 기준으로 분리)
  modalImagesArray = parseImages(item.image);
  currentImageIndex = 0;

  const modalImageContainer = document.getElementById('modalImageContainer'); // 모달 내 이미지 영역 래퍼
  
  if (modalImagesArray.length > 0) {
    renderModalSlider(modalImageContainer);
  } else {
    modalImageContainer.innerHTML = `
      <div class="w-full aspect-video bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-sm">
        이미지가 없습니다
      </div>
    `;
  }

  // 모달 내부 태그 및 카테고리 뱃지 렌더링
  modalTags.innerHTML = `
    ${item.category ? `
      <button 
        onclick="closeModal(); toggleCategory('${item.category}'); //openSidebar();" 
        title="카테고리 전체 선택"
        class="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
      >
        ${translateCategory(item.category)}
      </button>
    ` : ''}
    ${(item.tags || []).map(tagKey => {
      const cleanKey = tagKey.startsWith('#') ? tagKey : '#' + tagKey;
      return `
        <button 
          onclick="closeModal(); toggleTag('${cleanKey}'); //openSidebar();" 
          class="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 px-2.5 py-1 rounded-md transition-colors"
        >
          ${translateTag(cleanKey)}
        </button>
      `;
    }).join('')}
  `;

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
// ==================== 빈 배경 클릭 시 사이드바 열기 기능 ====================
document.addEventListener('DOMContentLoaded', () => {
  const mainElement = document.querySelector('main');
  if (!mainElement) return;

  mainElement.addEventListener('click', (e) => {
    // 클릭된 요소가 카드(article), 버튼, 링크, 입력창 등 인터랙티브 요소가 아닐 때만 사이드바 열기
    const isInteractive = e.target.closest('article') || 
                          e.target.closest('button') || 
                          e.target.closest('a') || 
                          e.target.closest('input') || 
                          e.target.closest('select');

    if (!isInteractive) {
      openSidebar();
    }
  });
});

// 다중 태그 토글 동작
async function toggleTag(tagKey) {
  if (tagKey === 'ALL') {
    selectedTags = [];
  } else {
    const index = selectedTags.indexOf(tagKey);
    if (index > -1) {
      selectedTags.splice(index, 1);
    } else {
      selectedTags.push(tagKey);
    }
  }
  renderTags();
  await renderCards();
}

// 호환성 유지용 함수
function filterByTag(tagKey) {
  toggleTag(tagKey);
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