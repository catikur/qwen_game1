// CapitalForge Lite - Oyun Mantığı

// ==================== SABİTLER ====================
const BUILDINGS = {
    cafe: { id: 'cafe', name: 'Kafe', emoji: '☕', cost: 100, income: 1, happiness: 1 },
    market: { id: 'market', name: 'Market', emoji: '🛒', cost: 250, income: 3, happiness: 1 },
    office: { id: 'office', name: 'Ofis', emoji: '🏢', cost: 600, income: 7, happiness: 0 },
    factory: { id: 'factory', name: 'Fabrika', emoji: '🏭', cost: 1500, income: 18, happiness: -2 },
    park: { id: 'park', name: 'Park', emoji: '🌳', cost: 300, income: 0, happiness: 8 },
    bank: { id: 'bank', name: 'Banka', emoji: '🏦', cost: 5000, income: 60, happiness: 0 }
};

const QUESTS = [
    { id: 1, name: 'İlk Mülk', desc: '1 arsa satın al', condition: (state) => countPlayerTiles(state) >= 1, reward: 200, completed: false },
    { id: 2, name: 'Girişimci', desc: '3 bina inşa et', condition: (state) => countPlayerBuildings(state) >= 3, reward: 500, completed: false },
    { id: 3, name: 'Kafe Zinciri', desc: '3 kafe sahip ol', condition: (state) => countBuildingType(state, 'cafe') >= 3, reward: 300, completed: false },
    { id: 4, name: 'Yeşil Şehir', desc: '2 park inşa et', condition: (state) => countBuildingType(state, 'park') >= 2, reward: 400, completed: false },
    { id: 5, name: 'Zenginlik', desc: 'Toplam 5000 para kazan', condition: (state) => state.totalEarned >= 5000, reward: 1000, completed: false },
    { id: 6, name: 'Rakibe Fark At', desc: 'Rakip skorundan 50 puan öne geç', condition: (state) => state.playerScore - state.rivalScore >= 50, reward: 800, completed: false }
];

const EVENTS = [
    {
        title: 'Sosyal Medya Trendi',
        desc: 'Kafenler sosyal medyada trend oldu.',
        options: [
            { text: 'Reklam kampanyası başlat', effect: (s) => { s.money -= 200; s.happiness = Math.min(100, s.happiness + 10); }, desc: '-200 para, +10 mutluluk' },
            { text: 'Sakin kal', effect: (s) => { s.happiness = Math.min(100, s.happiness + 5); }, desc: '+5 mutluluk' }
        ]
    },
    {
        title: 'Vergi İndirimi',
        desc: 'Belediye kısa süreli vergi indirimi açıkladı.',
        options: [
            { text: 'Nakit ödeyip teşvik al', effect: (s) => { s.money -= 300; s.money += 500; }, desc: '-300 para, +500 para' },
            { text: 'Bekle', effect: (s) => {}, desc: 'Hiçbir şey olmaz' }
        ]
    },
    {
        title: 'Fabrika Protestosu',
        desc: 'Fabrika bölgesinde küçük bir protesto var.',
        options: [
            { text: 'Halkla ilişkiler yap', effect: (s) => { s.money -= 250; s.happiness = Math.min(100, s.happiness + 8); }, desc: '-250 para, +8 mutluluk' },
            { text: 'Görmezden gel', effect: (s) => { s.happiness = Math.max(0, s.happiness - 8); }, desc: '-8 mutluluk' }
        ]
    },
    {
        title: 'Yatırımcı Meleği',
        desc: 'Bir yatırımcı melek senin girişimine ilgi duyuyor.',
        options: [
            { text: 'Yatırım kabul et', effect: (s) => { s.money += 800; s.happiness = Math.max(0, s.happiness - 5); }, desc: '+800 para, -5 mutluluk' },
            { text: 'Reddet', effect: (s) => { s.happiness = Math.min(100, s.happiness + 5); }, desc: '+5 mutluluk' }
        ]
    },
    {
        title: 'Şehir Festivali',
        desc: 'Şehirde festival düzenleniyor.',
        options: [
            { text: 'Stant aç', effect: (s) => { s.money -= 150; s.happiness = Math.min(100, s.happiness + 12); }, desc: '-150 para, +12 mutluluk' },
            { text: 'Katılma', effect: (s) => { s.happiness = Math.max(0, s.happiness - 3); }, desc: '-3 mutluluk' }
        ]
    }
];

// ==================== YARDIMCI FONKSİYONLAR ====================
function countPlayerTiles(state) {
    return state.tiles.filter(t => t.owner === 'player').length;
}

function countPlayerBuildings(state) {
    return state.tiles.filter(t => t.owner === 'player' && t.building !== null).length;
}

function countBuildingType(state, buildingId) {
    return state.tiles.filter(t => t.owner === 'player' && t.building === buildingId).length;
}

function calculateBaseIncome(state) {
    let income = 0;
    state.tiles.forEach(tile => {
        if (tile.owner === 'player' && tile.building) {
            income += BUILDINGS[tile.building].income;
        }
    });
    return income;
}

function calculateRealIncome(state) {
    const baseIncome = calculateBaseIncome(state);
    const bonus = 1 + (state.happiness * 0.005);
    return baseIncome * bonus;
}

function updateScores(state) {
    state.playerScore = countPlayerBuildings(state) * 10;
    state.rivalScore = state.tiles.filter(t => t.owner === 'rival' && t.building !== null).length * 10;
}

function generateTiles() {
    const tiles = [];
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const distFromCenter = Math.abs(x - 4.5) + Math.abs(y - 4.5);
            const basePrice = 50 + Math.floor(Math.random() * 100);
            const price = Math.min(500, Math.max(50, basePrice + Math.floor((9 - distFromCenter) * 15)));
            tiles.push({
                id: y * 10 + x,
                x: x,
                y: y,
                owner: null,
                building: null,
                price: price
            });
        }
    }
    return tiles;
}

// ==================== OYUN STATE ====================
let state = {
    money: 500,
    baseIncome: 0,
    happiness: 10,
    totalEarned: 0,
    playerScore: 0,
    rivalScore: 0,
    tiles: [],
    quests: [],
    activeEvent: null,
    lastEventTime: Date.now(),
    bankUnlocked: false,
    selectedTileId: null
};

// ==================== INIT ====================
function initGame() {
    state = {
        money: 500,
        baseIncome: 0,
        happiness: 10,
        totalEarned: 0,
        playerScore: 0,
        rivalScore: 0,
        tiles: generateTiles(),
        quests: JSON.parse(JSON.stringify(QUESTS)),
        activeEvent: null,
        lastEventTime: Date.now(),
        bankUnlocked: false,
        selectedTileId: null
    };
    renderGrid();
    renderBuildingList();
    renderQuestList();
    updateUI();
    startGameLoop();
}

// ==================== RENDER FONKSİYONLARI ====================
function renderGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    
    state.tiles.forEach(tile => {
        const tileEl = document.createElement('div');
        tileEl.className = 'tile';
        tileEl.id = `tile-${tile.id}`;
        
        // Durum belirleme
        if (tile.owner === null) {
            tileEl.classList.add('empty', 'for-sale');
        } else if (tile.owner === 'player') {
            tileEl.classList.add('player-owned');
            if (tile.building) {
                tileEl.textContent = BUILDINGS[tile.building].emoji;
            }
        } else if (tile.owner === 'rival') {
            tileEl.classList.add('rival-owned');
            if (tile.building) {
                tileEl.textContent = BUILDINGS[tile.building].emoji;
            }
        }
        
        // Seçili mi?
        if (state.selectedTileId === tile.id) {
            tileEl.classList.add('selected');
        }
        
        tileEl.addEventListener('click', () => selectTile(tile.id));
        grid.appendChild(tileEl);
    });
}

function renderBuildingList() {
    const list = document.getElementById('buildingList');
    list.innerHTML = '';
    
    Object.values(BUILDINGS).forEach(building => {
        const item = document.createElement('div');
        item.className = 'building-item';
        
        const isLocked = building.id === 'bank' && !state.bankUnlocked;
        const canAfford = state.money >= building.cost;
        
        if (isLocked) {
            item.classList.add('locked');
        } else if (!canAfford) {
            item.classList.add('disabled');
        }
        
        item.innerHTML = `
            <div class="building-name">${building.emoji} ${building.name}</div>
            <div class="building-stats">
                Maliyet: ${building.cost} | Gelir: ${building.income}/s
                ${building.happiness !== 0 ? `| Mutluluk: ${building.happiness > 0 ? '+' : ''}${building.happiness}` : ''}
            </div>
        `;
        
        if (!isLocked) {
            item.addEventListener('click', () => tryBuildBuilding(building.id));
        }
        
        list.appendChild(item);
    });
}

function renderQuestList() {
    const list = document.getElementById('questList');
    list.innerHTML = '';
    
    state.quests.forEach(quest => {
        const item = document.createElement('div');
        item.className = 'quest-item';
        if (quest.completed) {
            item.classList.add('completed');
        }
        
        item.innerHTML = `
            <div class="quest-name">${quest.completed ? '✓' : '○'} ${quest.name}</div>
            <div class="quest-desc">${quest.desc}</div>
            <div class="quest-reward">Ödül: +${quest.reward} para</div>
        `;
        
        list.appendChild(item);
    });
}

function renderEventPanel() {
    const panel = document.getElementById('eventPanel');
    
    if (state.activeEvent) {
        panel.classList.add('active');
        const event = state.activeEvent;
        
        let optionsHtml = '';
        event.options.forEach((opt, idx) => {
            const disabled = opt.effect.toString().includes('money -=') && 
                            parseInt(opt.effect.toString().match(/money -= (\d+)/)?.[1] || 0) > state.money;
            optionsHtml += `
                <button class="event-option${disabled ? ' disabled' : ''}" onclick="resolveEvent(${idx})">
                    ${opt.text}
                    <div class="event-effect">${opt.desc}</div>
                </button>
            `;
        });
        
        panel.innerHTML = `
            <div class="event-title">${event.title}</div>
            <div class="event-desc">${event.desc}</div>
            <div class="event-options">${optionsHtml}</div>
        `;
    } else {
        panel.classList.remove('active');
        panel.innerHTML = '<p>Olay bekleniyor...</p>';
    }
}

function updateUI() {
    document.getElementById('money').textContent = Math.floor(state.money);
    document.getElementById('income').textContent = calculateRealIncome(state).toFixed(1);
    document.getElementById('happiness').textContent = state.happiness;
    document.getElementById('playerScore').textContent = state.playerScore;
    document.getElementById('rivalScore').textContent = state.rivalScore;
    
    // Banka kilidini kontrol et
    if (!state.bankUnlocked && state.totalEarned >= 5000) {
        state.bankUnlocked = true;
        alert('🏦 Banka kilidi açıldı! Artık banka inşa edebilirsiniz.');
    }
    
    renderBuildingList();
    renderEventPanel();
}

// ==================== TILE SEÇİMİ ====================
function selectTile(tileId) {
    state.selectedTileId = tileId;
    renderGrid();
    showTilePanel(tileId);
}

function showTilePanel(tileId) {
    const tile = state.tiles.find(t => t.id === tileId);
    const panel = document.getElementById('tilePanel');
    const content = document.getElementById('tilePanelContent');
    
    if (!tile) return;
    
    let html = `<div class="tile-info">Arsa #${tile.id} (${tile.x}, ${tile.y})</div>`;
    
    if (tile.owner === null) {
        html += `<div class="tile-info">Fiyat: ${tile.price} para</div>`;
        html += `<div class="tile-actions">
            <button ${state.money < tile.price ? 'disabled' : ''} onclick="buyTile(${tile.id})">
                Satın Al (${tile.price} para)
            </button>
        </div>`;
    } else if (tile.owner === 'player') {
        if (tile.building) {
            const b = BUILDINGS[tile.building];
            html += `<div class="tile-info">Bina: ${b.emoji} ${b.name}</div>`;
            html += `<div class="tile-info">Gelir: ${b.income}/s ${b.happiness !== 0 ? `| Mutluluk: ${b.happiness > 0 ? '+' : ''}${b.happiness}` : ''}</div>`;
        } else {
            html += `<div class="tile-info">Boş arsanız</div>`;
            html += `<div class="tile-actions">`;
            
            Object.values(BUILDINGS).forEach(b => {
                const isLocked = b.id === 'bank' && !state.bankUnlocked;
                const canAfford = state.money >= b.cost;
                
                if (!isLocked) {
                    html += `<button ${!canAfford ? 'disabled' : ''} onclick="buildOnTile(${tile.id}, '${b.id}')">
                        ${b.emoji} ${b.name} (${b.cost})
                    </button>`;
                }
            });
            
            html += `</div>`;
        }
    } else if (tile.owner === 'rival') {
        html += `<div class="tile-info">Rakip AŞ'ye ait</div>`;
        if (tile.building) {
            const b = BUILDINGS[tile.building];
            html += `<div class="tile-info">Bina: ${b.emoji} ${b.name}</div>`;
        }
    }
    
    content.innerHTML = html;
    panel.classList.remove('hidden');
}

function closeTilePanel() {
    document.getElementById('tilePanel').classList.add('hidden');
    state.selectedTileId = null;
    renderGrid();
}

// ==================== AKSİYONLAR ====================
function buyTile(tileId) {
    const tile = state.tiles.find(t => t.id === tileId);
    if (tile && tile.owner === null && state.money >= tile.price) {
        state.money -= tile.price;
        tile.owner = 'player';
        updateScores(state);
        renderGrid();
        showTilePanel(tileId);
        updateUI();
        checkQuests();
    }
}

function buildOnTile(tileId, buildingId) {
    const tile = state.tiles.find(t => t.id === tileId);
    const building = BUILDINGS[buildingId];
    
    if (tile && tile.owner === 'player' && tile.building === null && state.money >= building.cost) {
        state.money -= building.cost;
        tile.building = buildingId;
        state.happiness = Math.max(0, Math.min(100, state.happiness + building.happiness));
        updateScores(state);
        renderGrid();
        showTilePanel(tileId);
        updateUI();
        checkQuests();
    }
}

function tryBuildBuilding(buildingId) {
    // Seçili oyuncu arsası varsa oraya inşa et
    if (state.selectedTileId !== null) {
        const tile = state.tiles.find(t => t.id === state.selectedTileId);
        if (tile && tile.owner === 'player' && tile.building === null) {
            buildOnTile(state.selectedTileId, buildingId);
            return;
        }
    }
    
    // Oyuncuya ait boş arsa ara
    const emptyTile = state.tiles.find(t => t.owner === 'player' && t.building === null);
    if (emptyTile) {
        buildOnTile(emptyTile.id, buildingId);
    } else {
        alert('Önce boş bir arsa satın alın!');
    }
}

// ==================== GÖREV KONTROLÜ ====================
function checkQuests() {
    state.quests.forEach(quest => {
        if (!quest.completed && quest.condition(state)) {
            quest.completed = true;
            state.money += quest.reward;
            alert(`🎉 Görev Tamamlandı: ${quest.name}\nÖdül: +${quest.reward} para`);
            renderQuestList();
            updateUI();
        }
    });
}

// ==================== RAKİP HAMLESİ ====================
function rivalTurn() {
    const availableTiles = state.tiles.filter(t => t.owner === null);
    if (availableTiles.length === 0) return;
    
    const randomTile = availableTiles[Math.floor(Math.random() * availableTiles.length)];
    randomTile.owner = 'rival';
    
    const buildingIds = Object.keys(BUILDINGS).filter(id => id !== 'bank');
    const randomBuilding = buildingIds[Math.floor(Math.random() * buildingIds.length)];
    randomTile.building = randomBuilding;
    
    updateScores(state);
    renderGrid();
    updateUI();
}

// ==================== RASTGELE OLAY ====================
function checkRandomEvent() {
    if (state.activeEvent) return;
    
    const now = Date.now();
    const timeSinceLastEvent = now - state.lastEventTime;
    
    // İlk olay 20 saniyeden önce gelmez
    if (timeSinceLastEvent < 20000) return;
    
    // Sonraki olaylar 25-40 saniye arasında
    const nextEventTime = 25000 + Math.random() * 15000;
    
    if (timeSinceLastEvent >= nextEventTime) {
        triggerRandomEvent();
    }
}

function triggerRandomEvent() {
    const randomEvent = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    state.activeEvent = randomEvent;
    renderEventPanel();
}

function resolveEvent(optionIndex) {
    if (!state.activeEvent) return;
    
    const option = state.activeEvent.options[optionIndex];
    option.effect(state);
    
    state.happiness = Math.max(0, Math.min(100, state.happiness));
    state.activeEvent = null;
    state.lastEventTime = Date.now();
    
    renderEventPanel();
    updateUI();
}

// ==================== GAME LOOP ====================
let gameLoopInterval;
let rivalInterval;
let autosaveInterval;

function startGameLoop() {
    // Her saniye gelir
    gameLoopInterval = setInterval(() => {
        const realIncome = calculateRealIncome(state);
        state.money += realIncome;
        state.totalEarned += realIncome;
        state.baseIncome = calculateBaseIncome(state);
        
        updateScores(state);
        updateUI();
        checkQuests();
        checkRandomEvent();
    }, 1000);
    
    // Rakip her 10 saniye
    rivalInterval = setInterval(() => {
        rivalTurn();
    }, 10000);
    
    // Autosave her 10 saniye
    autosaveInterval = setInterval(() => {
        saveGame(true);
    }, 10000);
}

// ==================== SAVE/LOAD ====================
function saveGame(isAutosave = false) {
    try {
        localStorage.setItem('capitalforge_save', JSON.stringify(state));
        if (!isAutosave) {
            alert('Oyun kaydedildi!');
        }
    } catch (e) {
        console.error('Kayıt hatası:', e);
        if (!isAutosave) {
            alert('Kayıt başarısız!');
        }
    }
}

function loadGame() {
    try {
        const saved = localStorage.getItem('capitalforge_save');
        if (saved) {
            state = JSON.parse(saved);
            renderGrid();
            renderBuildingList();
            renderQuestList();
            renderEventPanel();
            updateUI();
            alert('Oyun yüklendi!');
        } else {
            alert('Kayıtlı oyun bulunamadı!');
        }
    } catch (e) {
        console.error('Yükleme hatası:', e);
        alert('Kayıt yüklenemedi!');
    }
}

function resetGame() {
    if (confirm('Tüm ilerlemeniz silinecek. Emin misiniz?')) {
        localStorage.removeItem('capitalforge_save');
        clearInterval(gameLoopInterval);
        clearInterval(rivalInterval);
        clearInterval(autosaveInterval);
        initGame();
    }
}

// ==================== EVENT LISTENERS ====================
document.getElementById('saveBtn').addEventListener('click', () => saveGame(false));
document.getElementById('loadBtn').addEventListener('click', loadGame);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('closeTilePanel').addEventListener('click', closeTilePanel);

// Sayfa yüklendiğinde
window.addEventListener('DOMContentLoaded', () => {
    // Kayıtlı oyun var mı kontrol et
    const saved = localStorage.getItem('capitalforge_save');
    if (saved) {
        try {
            state = JSON.parse(saved);
            renderGrid();
            renderBuildingList();
            renderQuestList();
            renderEventPanel();
            updateUI();
            startGameLoop();
        } catch (e) {
            console.error('Kayıtlı oyun bozuk, yeni oyun başlatılıyor:', e);
            initGame();
        }
    } else {
        initGame();
    }
});
