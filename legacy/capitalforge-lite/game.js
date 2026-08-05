// CapitalForge Lite - Oyun Mantığı

// ==================== SABİTLER ====================
const GRID_SIZE = 10;
const STARTING_MONEY = 500;
const STARTING_HAPPINESS = 10;
const MIN_HAPPINESS = 0;
const MAX_HAPPINESS = 100;
const HAPPINESS_INCOME_BONUS = 0.005;
const SCORE_PER_BUILDING = 10;
const BANK_UNLOCK_THRESHOLD = 5000;

const TILE_PRICE_MIN = 50;
const TILE_PRICE_MAX = 500;
const TILE_PRICE_JITTER = 50;

const TICK_MS = 1000;
const RIVAL_TURN_MS = 10000;
const AUTOSAVE_MS = 10000;
const FIRST_EVENT_MIN_MS = 20000;
const FIRST_EVENT_RANGE_MS = 10000;
const EVENT_MIN_MS = 25000;
const EVENT_RANGE_MS = 15000;

const TOAST_MS = 4000;
const TOAST_MAX = 4;
const SAVE_KEY = 'capitalforge_save';
const SAVE_VERSION = 2;

const BUILDINGS = {
    cafe: { id: 'cafe', name: 'Kafe', emoji: '☕', cost: 100, income: 1, happiness: 1 },
    market: { id: 'market', name: 'Market', emoji: '🛒', cost: 250, income: 3, happiness: 1 },
    office: { id: 'office', name: 'Ofis', emoji: '🏢', cost: 600, income: 7, happiness: 0 },
    factory: { id: 'factory', name: 'Fabrika', emoji: '🏭', cost: 1500, income: 18, happiness: -2 },
    park: { id: 'park', name: 'Park', emoji: '🌳', cost: 300, income: 0, happiness: 8 },
    bank: { id: 'bank', name: 'Banka', emoji: '🏦', cost: 5000, income: 60, happiness: 0 }
};

// Görev tanımları sabittir; kayda sadece {id, completed} yazılır.
const QUESTS = [
    { id: 1, name: 'İlk Mülk', desc: '1 arsa satın al', reward: 200, condition: (s) => countPlayerTiles(s) >= 1 },
    { id: 2, name: 'Girişimci', desc: '3 bina inşa et', reward: 500, condition: (s) => countPlayerBuildings(s) >= 3 },
    { id: 3, name: 'Kafe Zinciri', desc: '3 kafe sahip ol', reward: 300, condition: (s) => countBuildingType(s, 'cafe') >= 3 },
    { id: 4, name: 'Yeşil Şehir', desc: '2 park inşa et', reward: 400, condition: (s) => countBuildingType(s, 'park') >= 2 },
    { id: 5, name: 'Zenginlik', desc: 'Toplam 5000 para kazan', reward: 1000, condition: (s) => s.totalEarned >= 5000 },
    { id: 6, name: 'Rakibe Fark At', desc: 'Rakip skorundan 50 puan öne geç', reward: 800, condition: (s) => s.playerScore - s.rivalScore >= 50 }
];

// Olay tanımları sabittir; kayda sadece activeEventId yazılır.
// cost = seçeneğin gerektirdiği peşin para (buton kilidi bu değere bakar).
const EVENTS = [
    {
        id: 'social_trend',
        title: 'Sosyal Medya Trendi',
        desc: 'Kafeler sosyal medyada trend oldu.',
        options: [
            { text: 'Reklam kampanyası başlat', desc: '-200 para, +10 mutluluk', cost: 200, apply: (s) => { addMoney(s, -200); addHappiness(s, 10); } },
            { text: 'Sakin kal', desc: '+5 mutluluk', cost: 0, apply: (s) => { addHappiness(s, 5); } }
        ]
    },
    {
        id: 'tax_cut',
        title: 'Vergi İndirimi',
        desc: 'Belediye kısa süreli vergi indirimi açıkladı.',
        options: [
            { text: 'Nakit ödeyip teşvik al', desc: '-300 para, +500 para', cost: 300, apply: (s) => { addMoney(s, -300); addMoney(s, 500); } },
            { text: 'Bekle', desc: 'Hiçbir şey olmaz', cost: 0, apply: () => {} }
        ]
    },
    {
        id: 'factory_protest',
        title: 'Fabrika Protestosu',
        desc: 'Fabrika bölgesinde küçük bir protesto var.',
        options: [
            { text: 'Halkla ilişkiler yap', desc: '-250 para, +8 mutluluk', cost: 250, apply: (s) => { addMoney(s, -250); addHappiness(s, 8); } },
            { text: 'Görmezden gel', desc: '-8 mutluluk', cost: 0, apply: (s) => { addHappiness(s, -8); } }
        ]
    },
    {
        id: 'angel_investor',
        title: 'Yatırımcı Meleği',
        desc: 'Bir yatırımcı melek senin girişimine ilgi duyuyor.',
        options: [
            { text: 'Yatırım kabul et', desc: '+800 para, -5 mutluluk', cost: 0, apply: (s) => { addMoney(s, 800); addHappiness(s, -5); } },
            { text: 'Reddet', desc: '+5 mutluluk', cost: 0, apply: (s) => { addHappiness(s, 5); } }
        ]
    },
    {
        id: 'city_festival',
        title: 'Şehir Festivali',
        desc: 'Şehirde festival düzenleniyor.',
        options: [
            { text: 'Stant aç', desc: '-150 para, +12 mutluluk', cost: 150, apply: (s) => { addMoney(s, -150); addHappiness(s, 12); } },
            { text: 'Katılma', desc: '-3 mutluluk', cost: 0, apply: (s) => { addHappiness(s, -3); } }
        ]
    }
];

// ==================== YARDIMCI FONKSİYONLAR ====================
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getQuestDef(id) {
    return QUESTS.find(q => q.id === id) || null;
}

function getEventDef(id) {
    return EVENTS.find(e => e.id === id) || null;
}

function getActiveEvent(s) {
    return s.activeEventId ? getEventDef(s.activeEventId) : null;
}

function addMoney(s, amount) {
    s.money = Math.max(0, s.money + amount);
}

function addHappiness(s, amount) {
    s.happiness = clamp(s.happiness + amount, MIN_HAPPINESS, MAX_HAPPINESS);
}

function countPlayerTiles(s) {
    return s.tiles.filter(t => t.owner === 'player').length;
}

function countPlayerBuildings(s) {
    return s.tiles.filter(t => t.owner === 'player' && t.building !== null).length;
}

function countRivalBuildings(s) {
    return s.tiles.filter(t => t.owner === 'rival' && t.building !== null).length;
}

function countBuildingType(s, buildingId) {
    return s.tiles.filter(t => t.owner === 'player' && t.building === buildingId).length;
}

function calculateBaseIncome(s) {
    return s.tiles.reduce((total, tile) => {
        if (tile.owner !== 'player' || !tile.building) return total;
        return total + BUILDINGS[tile.building].income;
    }, 0);
}

function calculateRealIncome(s) {
    return s.baseIncome * (1 + s.happiness * HAPPINESS_INCOME_BONUS);
}

// Bina sahipliği değiştiğinde türetilmiş alanları tazeler.
function refreshDerived(s) {
    s.baseIncome = calculateBaseIncome(s);
    s.playerScore = countPlayerBuildings(s) * SCORE_PER_BUILDING;
    s.rivalScore = countRivalBuildings(s) * SCORE_PER_BUILDING;
}

function isBuildingLocked(buildingId) {
    return buildingId === 'bank' && !state.bankUnlocked;
}

function generateTiles() {
    const tiles = [];
    const center = (GRID_SIZE - 1) / 2;
    const maxDistance = center * 2;
    const priceSpan = TILE_PRICE_MAX - TILE_PRICE_MIN;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // Merkeze yakın arsalar daha pahalı, üstüne rastgele sapma.
            const distance = Math.abs(x - center) + Math.abs(y - center);
            const centrality = 1 - distance / maxDistance;
            const jitter = Math.floor(Math.random() * (TILE_PRICE_JITTER * 2 + 1)) - TILE_PRICE_JITTER;
            const price = clamp(
                Math.round(TILE_PRICE_MIN + centrality * priceSpan + jitter),
                TILE_PRICE_MIN,
                TILE_PRICE_MAX
            );

            tiles.push({ id: y * GRID_SIZE + x, x: x, y: y, owner: null, building: null, price: price });
        }
    }
    return tiles;
}

// ==================== OYUN STATE ====================
// state içinde yalnızca JSON'a yazılabilen veri tutulur; fonksiyonlar
// QUESTS / EVENTS sabitlerinde kalır ve id üzerinden bulunur.
function createInitialState() {
    return {
        money: STARTING_MONEY,
        baseIncome: 0,
        happiness: STARTING_HAPPINESS,
        totalEarned: 0,
        playerScore: 0,
        rivalScore: 0,
        tiles: generateTiles(),
        quests: QUESTS.map(q => ({ id: q.id, completed: false })),
        activeEventId: null,
        lastEventTime: Date.now(),
        nextEventDelay: FIRST_EVENT_MIN_MS + Math.random() * FIRST_EVENT_RANGE_MS,
        bankUnlocked: false,
        selectedTileId: null
    };
}

let state = createInitialState();

// ==================== BİLDİRİMLER ====================
function notify(message, type = 'info') {
    const list = document.getElementById('toastList');
    if (!list) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    list.appendChild(toast);

    // Ekranı doldurmasın: en eskiler düşer.
    while (list.children.length > TOAST_MAX) list.firstElementChild.remove();

    setTimeout(() => toast.remove(), TOAST_MS);
}

// ==================== RENDER FONKSİYONLARI ====================
const tileElements = new Map();
const buildingElements = new Map();
let renderedEventId; // undefined = "henüz çizilmedi", null = "aktif olay yok"

function renderAll() {
    renderGrid();
    renderBuildingList();
    renderQuestList();
    renderEventPanel();
    clearTileSelection();
    updateUI();
}

function renderGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    tileElements.clear();

    state.tiles.forEach(tile => {
        const tileEl = document.createElement('button');
        tileEl.type = 'button';
        tileEl.className = 'tile';
        tileEl.dataset.tileId = String(tile.id);
        tileElements.set(tile.id, tileEl);
        grid.appendChild(tileEl);
        updateTileEl(tile);
    });
}

// Tek bir kareyi günceller; grid'in tamamı yeniden kurulmaz.
function updateTileEl(tile) {
    const tileEl = tileElements.get(tile.id);
    if (!tileEl) return;

    tileEl.className = 'tile';
    let description;

    if (tile.owner === null) {
        tileEl.classList.add('empty', 'for-sale');
        description = `satılık, ${tile.price} para`;
    } else if (tile.owner === 'player') {
        tileEl.classList.add('player-owned');
        description = 'sizin arsanız';
    } else {
        tileEl.classList.add('rival-owned');
        description = 'Rakip AŞ arsası';
    }

    if (tile.building) {
        const building = BUILDINGS[tile.building];
        tileEl.textContent = building.emoji;
        description += `, ${building.name}`;
    } else {
        tileEl.textContent = '';
    }

    if (state.selectedTileId === tile.id) {
        tileEl.classList.add('selected');
    }

    tileEl.setAttribute('aria-label', `Arsa ${tile.x + 1}-${tile.y + 1}: ${description}`);
}

function updateTileById(tileId) {
    const tile = state.tiles.find(t => t.id === tileId);
    if (tile) updateTileEl(tile);
}

function renderBuildingList() {
    const list = document.getElementById('buildingList');
    list.innerHTML = '';
    buildingElements.clear();

    Object.values(BUILDINGS).forEach(building => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'building-item';
        item.dataset.buildingId = building.id;
        item.innerHTML = `
            <span class="building-name">${building.emoji} ${building.name}</span>
            <span class="building-stats">
                Maliyet: ${building.cost} | Gelir: ${building.income}/s
                ${building.happiness !== 0 ? `| Mutluluk: ${building.happiness > 0 ? '+' : ''}${building.happiness}` : ''}
            </span>
        `;
        buildingElements.set(building.id, item);
        list.appendChild(item);
    });

    refreshBuildingList();
}

// Sadece kilitli/pahalı durumunu tazeler, DOM'u yeniden kurmaz.
function refreshBuildingList() {
    buildingElements.forEach((item, buildingId) => {
        const locked = isBuildingLocked(buildingId);
        item.classList.toggle('locked', locked);
        item.classList.toggle('disabled', !locked && state.money < BUILDINGS[buildingId].cost);
    });
}

function renderQuestList() {
    const list = document.getElementById('questList');
    list.innerHTML = '';

    state.quests.forEach(entry => {
        const def = getQuestDef(entry.id);
        if (!def) return;

        const item = document.createElement('div');
        item.className = 'quest-item';
        if (entry.completed) item.classList.add('completed');

        item.innerHTML = `
            <div class="quest-name">${entry.completed ? '✓' : '○'} ${def.name}</div>
            <div class="quest-desc">${def.desc}</div>
            <div class="quest-reward">Ödül: +${def.reward} para</div>
        `;

        list.appendChild(item);
    });
}

function renderEventPanel() {
    const panel = document.getElementById('eventPanel');
    const event = getActiveEvent(state);
    const eventId = event ? event.id : null;

    // Aktif olay değişmediyse sadece seçenek butonlarını tazele.
    if (eventId === renderedEventId) {
        refreshEventOptions();
        return;
    }
    renderedEventId = eventId;
    document.getElementById('eventSection').classList.toggle('active-event', Boolean(event));

    if (!event) {
        panel.classList.remove('active');
        panel.innerHTML = '<p>Olay bekleniyor...</p>';
        return;
    }

    panel.classList.add('active');
    const optionsHtml = event.options.map((option, index) => `
        <button class="event-option" type="button" data-option-index="${index}" data-cost="${option.cost}">
            ${option.text}
            <span class="event-effect">${option.desc}</span>
        </button>
    `).join('');

    panel.innerHTML = `
        <div class="event-title">${event.title}</div>
        <div class="event-desc">${event.desc}</div>
        <div class="event-options">${optionsHtml}</div>
    `;
    refreshEventOptions();
}

function refreshEventOptions() {
    document.querySelectorAll('#eventPanel .event-option').forEach(button => {
        button.disabled = state.money < Number(button.dataset.cost);
    });
}

function updateUI() {
    document.getElementById('money').textContent = Math.floor(state.money);
    document.getElementById('income').textContent = calculateRealIncome(state).toFixed(1);
    document.getElementById('happiness').textContent = state.happiness;
    document.getElementById('playerScore').textContent = state.playerScore;
    document.getElementById('rivalScore').textContent = state.rivalScore;
    document.getElementById('leadBadge').classList.toggle('hidden', state.playerScore <= state.rivalScore);

    refreshBuildingList();
    refreshEventOptions();
    refreshTilePanelButtons();
}

// ==================== ARSA PANELİ ====================
// Sadece grid'deki seçim vurgusunu değiştirir.
function setSelectedTile(tileId) {
    const previousId = state.selectedTileId;
    state.selectedTileId = tileId;

    if (previousId !== null && previousId !== tileId) updateTileById(previousId);
    if (tileId !== null) updateTileById(tileId);
}

function selectTile(tileId) {
    setSelectedTile(tileId);
    renderTilePanel();
}

// Sağ paneli seçili arsaya göre çizer; seçim yoksa yönlendirme metni gösterir.
function renderTilePanel() {
    const title = document.getElementById('tilePanelTitle');
    const content = document.getElementById('tilePanelContent');
    const closeButton = document.getElementById('closeTilePanel');
    const tile = state.tiles.find(t => t.id === state.selectedTileId);

    if (!tile) {
        title.textContent = 'Arsa Detayı';
        content.innerHTML = '<p class="tile-empty-hint">Bilgi ve işlemler için grid üzerinden bir arsa seçin.</p>';
        closeButton.classList.add('hidden');
        return;
    }

    title.textContent = `Arsa ${tile.x + 1}-${tile.y + 1}`;
    closeButton.classList.remove('hidden');

    let html = '';

    if (tile.owner === null) {
        html += `<div class="tile-info">Satılık arsa — Fiyat: ${tile.price} para</div>`;
        html += `<div class="tile-actions">
            <button type="button" data-action="buy" data-tile-id="${tile.id}" data-cost="${tile.price}">
                Satın Al (${tile.price} para)
            </button>
        </div>`;
    } else if (tile.owner === 'player' && tile.building) {
        const building = BUILDINGS[tile.building];
        html += `<div class="tile-info">Bina: ${building.emoji} ${building.name}</div>`;
        html += `<div class="tile-info">Gelir: ${building.income}/s${building.happiness !== 0 ? ` | Mutluluk: ${building.happiness > 0 ? '+' : ''}${building.happiness}` : ''}</div>`;
    } else if (tile.owner === 'player') {
        html += `<div class="tile-info">Boş arsanız — bir bina seçin</div>`;
        html += `<div class="tile-actions">`;
        Object.values(BUILDINGS).forEach(building => {
            if (isBuildingLocked(building.id)) return;
            html += `<button type="button" data-action="build" data-tile-id="${tile.id}" data-building-id="${building.id}" data-cost="${building.cost}">
                ${building.emoji} ${building.name} (${building.cost})
            </button>`;
        });
        html += `</div>`;
    } else {
        html += `<div class="tile-info">Rakip AŞ'ye ait</div>`;
        if (tile.building) {
            const building = BUILDINGS[tile.building];
            html += `<div class="tile-info">Bina: ${building.emoji} ${building.name}</div>`;
        }
    }

    content.innerHTML = html;
    refreshTilePanelButtons();
}

// Para arttıkça panel butonları kendiliğinden aktifleşir.
function refreshTilePanelButtons() {
    document.getElementById('tilePanel').querySelectorAll('button[data-cost]').forEach(button => {
        button.disabled = state.money < Number(button.dataset.cost);
    });
}

// Seçili arsa hâlâ aynıysa panel içeriğini tazeler.
function refreshTilePanel(tileId) {
    if (state.selectedTileId === tileId) renderTilePanel();
}

function clearTileSelection() {
    setSelectedTile(null);
    renderTilePanel();
}

// ==================== AKSİYONLAR ====================
function buyTile(tileId) {
    const tile = state.tiles.find(t => t.id === tileId);
    if (!tile || tile.owner !== null) return;

    if (state.money < tile.price) {
        notify('Bu arsa için yeterli paranız yok.', 'warning');
        return;
    }

    state.money -= tile.price;
    tile.owner = 'player';
    refreshDerived(state);
    updateTileEl(tile);
    refreshTilePanel(tileId);
    checkQuests();
    updateUI();
}

function buildOnTile(tileId, buildingId) {
    const tile = state.tiles.find(t => t.id === tileId);
    const building = BUILDINGS[buildingId];
    if (!tile || !building) return false;

    if (tile.owner !== 'player') {
        notify('Önce bu arsayı satın almalısınız.', 'warning');
        return false;
    }
    if (tile.building) {
        notify('Bu arsada zaten bir bina var.', 'warning');
        return false;
    }
    if (isBuildingLocked(buildingId)) {
        notify(`${building.name} henüz kilitli.`, 'warning');
        return false;
    }
    if (state.money < building.cost) {
        notify(`${building.name} için ${building.cost} para gerekiyor.`, 'warning');
        return false;
    }

    state.money -= building.cost;
    tile.building = buildingId;
    addHappiness(state, building.happiness);
    refreshDerived(state);
    updateTileEl(tile);
    refreshTilePanel(tileId);
    checkQuests();
    updateUI();
    return true;
}

// Sol paneldeki bina kartına tıklanınca hedef arsayı seçer.
function tryBuildBuilding(buildingId) {
    const building = BUILDINGS[buildingId];
    if (!building) return;

    if (isBuildingLocked(buildingId)) {
        notify(`Banka, toplam ${BANK_UNLOCK_THRESHOLD} para kazandığınızda açılır.`, 'warning');
        return;
    }

    if (state.selectedTileId !== null) {
        const selected = state.tiles.find(t => t.id === state.selectedTileId);
        if (selected && selected.owner === 'player' && !selected.building) {
            buildOnTile(selected.id, buildingId);
            return;
        }
    }

    const emptyTile = state.tiles.find(t => t.owner === 'player' && t.building === null);
    if (!emptyTile) {
        notify('Önce boş bir arsa satın alın.', 'warning');
        return;
    }

    // Otomatik seçilen arsa vurgulanır ve oyuncuya nereye inşa edildiği söylenir.
    setSelectedTile(emptyTile.id);
    if (buildOnTile(emptyTile.id, buildingId)) {
        notify(`${building.emoji} ${building.name}, ${emptyTile.x + 1}-${emptyTile.y + 1} arsasına inşa edildi.`, 'success');
    }
}

// ==================== GÖREV VE KİLİT KONTROLÜ ====================
function checkQuests() {
    state.quests.forEach(entry => {
        if (entry.completed) return;

        const def = getQuestDef(entry.id);
        if (!def || !def.condition(state)) return;

        entry.completed = true;
        addMoney(state, def.reward);
        notify(`🎉 Görev tamamlandı: ${def.name} (+${def.reward} para)`, 'success');
        renderQuestList();
    });
}

function checkUnlocks() {
    if (state.bankUnlocked || state.totalEarned < BANK_UNLOCK_THRESHOLD) return;

    state.bankUnlocked = true;
    notify('🏦 Banka kilidi açıldı! Artık banka inşa edebilirsiniz.', 'success');
    refreshBuildingList();
    if (state.selectedTileId !== null) refreshTilePanel(state.selectedTileId);
}

// ==================== RAKİP HAMLESİ ====================
function rivalTurn() {
    const availableTiles = state.tiles.filter(t => t.owner === null);
    if (availableTiles.length === 0) return;

    const tile = availableTiles[Math.floor(Math.random() * availableTiles.length)];
    tile.owner = 'rival';

    const buildingIds = Object.keys(BUILDINGS).filter(id => id !== 'bank');
    tile.building = buildingIds[Math.floor(Math.random() * buildingIds.length)];

    refreshDerived(state);
    updateTileEl(tile);
    // Oyuncu tam o arsanın panelini açık tutuyorsa panel tazelenir.
    refreshTilePanel(tile.id);
    updateUI();
}

// ==================== RASTGELE OLAY ====================
function checkRandomEvent() {
    if (state.activeEventId) return;
    if (Date.now() - state.lastEventTime < state.nextEventDelay) return;
    triggerRandomEvent();
}

function triggerRandomEvent() {
    const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    state.activeEventId = event.id;
    renderEventPanel();

    // Panel sol sütunun en üstüne çıkar, ayrıca bildirimle duyurulur.
    notify(`📣 Yeni olay: ${event.title}`, 'info');
}

function resolveEvent(optionIndex) {
    const event = getActiveEvent(state);
    if (!event) return;

    const option = event.options[optionIndex];
    if (!option) return;

    if (state.money < option.cost) {
        notify('Bu seçenek için yeterli paranız yok.', 'warning');
        return;
    }

    option.apply(state);
    state.activeEventId = null;
    state.lastEventTime = Date.now();
    state.nextEventDelay = EVENT_MIN_MS + Math.random() * EVENT_RANGE_MS;

    renderEventPanel();
    updateUI();
}

// ==================== GAME LOOP ====================
let gameLoopInterval = null;
let rivalInterval = null;
let autosaveInterval = null;

function tick() {
    refreshDerived(state);

    const income = calculateRealIncome(state);
    state.money += income;
    state.totalEarned += income;

    checkUnlocks();
    checkQuests();
    checkRandomEvent();
    updateUI();
}

function startGameLoop() {
    stopGameLoop();
    gameLoopInterval = setInterval(tick, TICK_MS);
    rivalInterval = setInterval(rivalTurn, RIVAL_TURN_MS);
    autosaveInterval = setInterval(() => saveGame(true), AUTOSAVE_MS);
}

function stopGameLoop() {
    clearInterval(gameLoopInterval);
    clearInterval(rivalInterval);
    clearInterval(autosaveInterval);
    gameLoopInterval = null;
    rivalInterval = null;
    autosaveInterval = null;
}

// ==================== SAVE / LOAD ====================
function saveGame(isAutosave = false) {
    try {
        const payload = {
            version: SAVE_VERSION,
            state: state,
            // Olay sayacı mutlak zaman yerine "geçen süre" olarak saklanır.
            eventElapsed: Date.now() - state.lastEventTime
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        if (!isAutosave) notify('Oyun kaydedildi.', 'success');
    } catch (e) {
        console.error('Kayıt hatası:', e);
        if (!isAutosave) notify('Kayıt başarısız oldu.', 'warning');
    }
}

function isValidSave(payload) {
    return Boolean(
        payload &&
        payload.version === SAVE_VERSION &&
        payload.state &&
        typeof payload.state.money === 'number' &&
        Array.isArray(payload.state.tiles) &&
        payload.state.tiles.length === GRID_SIZE * GRID_SIZE
    );
}

// Kayıttaki ham veriyi güvenli bir state objesine dönüştürür.
function normalizeSave(payload) {
    const fresh = createInitialState();
    const saved = payload.state;

    const loaded = Object.assign(fresh, saved, {
        tiles: saved.tiles.map((tile, index) => ({
            id: Number.isInteger(tile.id) ? tile.id : index,
            x: Number.isInteger(tile.x) ? tile.x : index % GRID_SIZE,
            y: Number.isInteger(tile.y) ? tile.y : Math.floor(index / GRID_SIZE),
            owner: tile.owner === 'player' || tile.owner === 'rival' ? tile.owner : null,
            building: BUILDINGS[tile.building] ? tile.building : null,
            price: clamp(Number(tile.price) || TILE_PRICE_MIN, TILE_PRICE_MIN, TILE_PRICE_MAX)
        })),
        // Görev fonksiyonları sabitlerden gelir, kayıttan sadece durum okunur.
        quests: QUESTS.map(def => {
            const entry = Array.isArray(saved.quests) ? saved.quests.find(q => q && q.id === def.id) : null;
            return { id: def.id, completed: Boolean(entry && entry.completed) };
        }),
        activeEventId: getEventDef(saved.activeEventId) ? saved.activeEventId : null,
        selectedTileId: null,
        bankUnlocked: Boolean(saved.bankUnlocked)
    });

    loaded.money = Math.max(0, Number(loaded.money) || 0);
    loaded.totalEarned = Math.max(0, Number(loaded.totalEarned) || 0);
    loaded.happiness = clamp(Number(loaded.happiness) || 0, MIN_HAPPINESS, MAX_HAPPINESS);
    if (!(loaded.nextEventDelay > 0)) loaded.nextEventDelay = EVENT_MIN_MS;

    const elapsed = clamp(Number(payload.eventElapsed) || 0, 0, loaded.nextEventDelay);
    loaded.lastEventTime = Date.now() - elapsed;

    refreshDerived(loaded);
    return loaded;
}

function readSave() {
    let raw;
    try {
        raw = localStorage.getItem(SAVE_KEY);
    } catch (e) {
        console.warn('localStorage okunamadı:', e);
        return null;
    }
    if (!raw) return null;

    try {
        const payload = JSON.parse(raw);
        if (!isValidSave(payload)) return null;
        return normalizeSave(payload);
    } catch (e) {
        console.warn('Kayıt okunamadı, yeni oyun başlatılıyor:', e);
        return null;
    }
}

function loadGame() {
    const loaded = readSave();
    if (!loaded) {
        notify('Geçerli bir kayıt bulunamadı.', 'warning');
        return;
    }

    state = loaded;
    renderedEventId = undefined;
    renderAll();
    notify('Oyun yüklendi.', 'success');
}

function initGame() {
    state = createInitialState();
    renderedEventId = undefined;
    renderAll();
    startGameLoop();
}

function resetGame() {
    if (!confirm('Tüm ilerlemeniz silinecek. Emin misiniz?')) return;

    try {
        localStorage.removeItem(SAVE_KEY);
    } catch (e) {
        console.warn('Kayıt silinemedi:', e);
    }

    initGame();
    notify('Oyun sıfırlandı.', 'info');
}

// ==================== EVENT LISTENER'LAR ====================
function bindEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', () => saveGame(false));
    document.getElementById('loadBtn').addEventListener('click', loadGame);
    document.getElementById('resetBtn').addEventListener('click', resetGame);
    document.getElementById('closeTilePanel').addEventListener('click', clearTileSelection);

    document.getElementById('gameGrid').addEventListener('click', (e) => {
        const tileEl = e.target.closest('.tile');
        if (tileEl) selectTile(Number(tileEl.dataset.tileId));
    });

    document.getElementById('buildingList').addEventListener('click', (e) => {
        const item = e.target.closest('.building-item');
        if (item) tryBuildBuilding(item.dataset.buildingId);
    });

    document.getElementById('tilePanelContent').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button || button.disabled) return;

        if (button.dataset.action === 'buy') {
            buyTile(Number(button.dataset.tileId));
        } else if (button.dataset.action === 'build') {
            buildOnTile(Number(button.dataset.tileId), button.dataset.buildingId);
        }
    });

    document.getElementById('eventPanel').addEventListener('click', (e) => {
        const button = e.target.closest('.event-option');
        if (button && !button.disabled) resolveEvent(Number(button.dataset.optionIndex));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearTileSelection();
    });
}

function bootstrap() {
    bindEventListeners();

    const loaded = readSave();
    if (loaded) {
        state = loaded;
        renderAll();
        startGameLoop();
    } else {
        initGame();
    }
}

window.addEventListener('DOMContentLoaded', bootstrap);
