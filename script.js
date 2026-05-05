// Core Game State
let score = 0;
let fractionalScore = 0;
let totalClicks = 0;
let totalEarned = 0;
let upgradePurchases = 0;
let combo = 1;
let comboTimer = null;
let lastClickTime = 0;

// Meta progression
let prestigePoints = 0;
let ascensions = 0;
let voidPoints = 0;
let reachedMilestones = new Set();
let unlockedAchievements = new Set();

// Golden cookie / temporary buffs
let goldenCookieTimeoutId = null;
let goldenCookieHideId = null;
let buffTimeoutId = null;
let activeBuff = {
    label: '',
    clickMultiplier: 1,
    ppsMultiplier: 1,
    expiresAt: 0
};

// Quests
let currentQuest = null;
let currentVoidUpgrade = null;

// Upgrades configuration
const upgrades = {
    clickPower: { level: 1, cost: 10, baseCost: 10 },
    autoClicker: { level: 0, cost: 50, increment: 1, baseCost: 50 },
    multiplier: { level: 0, cost: 100, increment: 0.5, baseCost: 100 }
};

// Milestones
const milestones = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];

const voidUpgradeDefs = [
    { id: 'void_click', text: 'Void Clicks', cost: 5, multiplier: 1.5, description: 'Multiply click power by 1.5x' },
    { id: 'void_automation', text: 'Void Automation', cost: 8, multiplier: 2, description: 'Multiply PPS by 2x' },
    { id: 'void_overdrive', text: 'Void Overdrive', cost: 12, multiplier: 2.5, description: 'Multiply all gains by 2.5x' }
];

const achievementDefs = [
    { id: 'click_100', text: 'Tap Machine: Reach 100 clicks', check: () => totalClicks >= 100 },
    { id: 'score_10k', text: 'Baker Bank: Reach 10,000 points', check: () => score >= 10000 },
    { id: 'auto_25', text: 'Factory Floor: Own 25 auto-clickers', check: () => upgrades.autoClicker.level >= 25 },
    { id: 'combo_20', text: 'Combo Crafter: Hit combo x20', check: () => combo >= 20 },
    { id: 'prestige_1', text: 'Reborn: Prestige once', check: () => prestigePoints >= 1 },
    { id: 'score_1m', text: 'Cookie Empire: Reach 1,000,000 points', check: () => score >= 1000000 }
];

const questPool = [
    { id: 'q_click_50', description: 'Click 50 times', metric: 'clicks', target: 50, reward: 300 },
    { id: 'q_earn_3000', description: 'Earn 3,000 points', metric: 'earn_points', target: 3000, reward: 600 },
    { id: 'q_combo_15', description: 'Reach combo x15', metric: 'combo_peak', target: 15, reward: 900 },
    { id: 'q_buy_8', description: 'Buy 8 upgrades', metric: 'upgrades', target: 8, reward: 700 }
];

// DOM elements
const clickBtn = document.getElementById('click');
const scoreDisplay = document.getElementById('points');
const ppsDisplay = document.getElementById('pps');
const clicksDisplay = document.getElementById('clicks');
const comboDisplay = document.getElementById('combo');
const voidPointsDisplay = document.getElementById('voidPoints');
const notification = document.getElementById('notification');
const floatingContainer = document.getElementById('floating-text-container');
const goldenCookieBtn = document.getElementById('goldenCookie');
const resetBtn = document.getElementById('resetBtn');
const prestigeBtn = document.getElementById('prestigeBtn');
const prestigeInfo = document.getElementById('prestigeInfo');
const ascendBtn = document.getElementById('ascendBtn');
const ascendInfo = document.getElementById('ascendInfo');
const voidUpgradeBtn = document.getElementById('voidUpgradeBtn');
const voidUpgradeInfo = document.getElementById('voidUpgradeInfo');
const achievementSummary = document.getElementById('achievementSummary');
const achievementsList = document.getElementById('achievementsList');
const questDescription = document.getElementById('questDescription');
const questProgress = document.getElementById('questProgress');
const questReward = document.getElementById('questReward');

const upgradeButtons = {
    clickPower: document.getElementById('upgradeClickPower'),
    autoClicker: document.getElementById('upgradeAutoClicker'),
    multiplier: document.getElementById('upgradeMultiplier')
};

const maxButtons = {
    clickPower: document.getElementById('upgradeClickPowerMax'),
    autoClicker: document.getElementById('upgradeAutoClickerMax'),
    multiplier: document.getElementById('upgradeMultiplierMax')
};

// Numeric formatters: cap fractional noise to two decimals
const decFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});
const intFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

function cleanNumber(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(digits));
}

function formatNumber(value) {
    return decFormatter.format(cleanNumber(value));
}

function formatLarge(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';

    const abs = Math.abs(num);
    if (abs < 1000) return formatNumber(num);
    if (abs < 1000000) return intFormatter.format(Math.floor(num));
    if (abs < 1000000000) return formatNumber(num / 1000000) + 'M';
    return formatNumber(num / 1000000000) + 'B';
}

function getAchievementBonus() {
    return unlockedAchievements.size * 0.02;
}

function getPrestigeMultiplier() {
    return 1 + (prestigePoints * 0.1);
}

function getAutoSupportMultiplier() {
    return 1 + (upgrades.autoClicker.level * 0.08);
}

function getAscensionMultiplier() {
    return 1 + (ascensions * 0.5);
}

function getVoidMultiplier() {
    const voidBoost = currentVoidUpgrade ? currentVoidUpgrade.multiplier : 1;
    return getAscensionMultiplier() * voidBoost;
}

function isExtremeMode() {
    return score >= 1000000 || ascensions > 0 || voidPoints > 0;
}

function getClickValue() {
    const baseValue = upgrades.clickPower.level + (upgrades.autoClicker.level * 0.5);
    const upgradeMultiplier = 1 + (upgrades.multiplier.level * upgrades.multiplier.increment);
    const supportMultiplier = getAutoSupportMultiplier();
    const metaMultiplier = getPrestigeMultiplier() * (1 + getAchievementBonus()) * getVoidMultiplier();
    const amount = baseValue * upgradeMultiplier * combo * supportMultiplier * metaMultiplier * activeBuff.clickMultiplier;
    return cleanNumber(amount);
}

function calculatePPS() {
    const basePps = upgrades.autoClicker.level * upgrades.autoClicker.increment;
    const supportMultiplier = getAutoSupportMultiplier();
    const metaMultiplier = getPrestigeMultiplier() * (1 + getAchievementBonus()) * getVoidMultiplier();
    return cleanNumber(basePps * supportMultiplier * metaMultiplier * activeBuff.ppsMultiplier);
}

function getExtremizedGain(amount) {
    const extremeBoost = isExtremeMode() ? 1.35 : 1;
    return cleanNumber(amount * extremeBoost);
}

function computeUpgradeCost(key, level) {
    if (key === 'clickPower') return Math.ceil(upgrades.clickPower.baseCost * Math.pow(1.15, level - 1));
    if (key === 'autoClicker') return Math.ceil(upgrades.autoClicker.baseCost * Math.pow(1.2, level));
    return Math.ceil(upgrades.multiplier.baseCost * Math.pow(1.25, level));
}

// Save/load
function saveGame() {
    const gameState = {
        score,
        fractionalScore,
        totalClicks,
        totalEarned,
        upgradePurchases,
        upgrades,
        prestigePoints,
        ascensions,
        voidPoints,
        currentVoidUpgrade,
        reachedMilestones: Array.from(reachedMilestones),
        unlockedAchievements: Array.from(unlockedAchievements),
        currentQuest
    };
    localStorage.setItem('cookieClickerGame', JSON.stringify(gameState));
}

function loadGame() {
    const savedGame = localStorage.getItem('cookieClickerGame');
    if (!savedGame) return;

    const gameState = JSON.parse(savedGame);
    score = Number(gameState.score) || 0;
    fractionalScore = Number(gameState.fractionalScore) || 0;
    totalClicks = Number(gameState.totalClicks) || 0;
    totalEarned = Number(gameState.totalEarned) || 0;
    upgradePurchases = Number(gameState.upgradePurchases) || 0;

    if (gameState.upgrades) Object.assign(upgrades, gameState.upgrades);

    prestigePoints = Number(gameState.prestigePoints) || 0;
    ascensions = Number(gameState.ascensions) || 0;
    voidPoints = Number(gameState.voidPoints) || 0;
    currentVoidUpgrade = gameState.currentVoidUpgrade || null;
    reachedMilestones = new Set(gameState.reachedMilestones || []);
    unlockedAchievements = new Set(gameState.unlockedAchievements || []);

    if (gameState.currentQuest && typeof gameState.currentQuest === 'object') {
        currentQuest = {
            ...gameState.currentQuest,
            progress: Number(gameState.currentQuest.progress) || 0,
            target: Number(gameState.currentQuest.target) || 1,
            reward: Number(gameState.currentQuest.reward) || 0,
            completed: Boolean(gameState.currentQuest.completed)
        };
    }
}

// Sound
function playTone(freq, duration, type, gain = 0.25, at = 0) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gainNode.gain.setValueAtTime(gain, audioContext.currentTime + at);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + at + duration);
    osc.start(audioContext.currentTime + at);
    osc.stop(audioContext.currentTime + at + duration);
}

function playClickSound() {
    playTone(800, 0.1, 'sine', 0.22);
}

function playUpgradeSound() {
    playTone(420, 0.08, 'square', 0.2);
    playTone(820, 0.09, 'square', 0.16, 0.05);
}

function playMilestoneSound() {
    playTone(523, 0.1, 'sine', 0.18);
    playTone(659, 0.1, 'sine', 0.18, 0.06);
    playTone(784, 0.12, 'sine', 0.18, 0.12);
}

// Feedback
function addScreenShake() {
    document.body.classList.remove('screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 400);
}

function createFloatingText(value, x, y, isBig = false) {
    const text = document.createElement('div');
    text.className = 'floating-text';
    if (isBig) text.classList.add('big');
    text.textContent = '+' + formatLarge(value);
    text.style.left = x + 'px';
    text.style.top = y + 'px';
    floatingContainer.appendChild(text);
    setTimeout(() => text.remove(), 1000);
}

function showNotification(message, hype = false) {
    notification.textContent = message;
    notification.classList.remove('hidden');
    if (hype) notification.classList.add('hype');
    else notification.classList.remove('hype');
    setTimeout(() => {
        notification.classList.add('hidden');
        notification.classList.remove('hype');
    }, 2800);
}

// Combo
function updateCombo() {
    clearTimeout(comboTimer);
    const now = Date.now();

    if (now - lastClickTime < 500) combo += 1;
    else combo = 1;

    lastClickTime = now;
    comboTimer = setTimeout(() => {
        combo = 1;
        clickBtn.classList.remove('combo-glow');
        updateDisplay();
    }, 1000);

    if (combo >= 10) clickBtn.classList.add('combo-glow');

    if (combo === 10 || combo === 25 || combo === 50) {
        showNotification('Combo streak x' + combo + '!', true);
        playMilestoneSound();
        addScreenShake();
    }

    incrementQuest('combo_peak', combo);
    updateDisplay();
}

// Scoring
function addScore(amount) {
    const safeAmount = getExtremizedGain(cleanNumber(amount));
    if (safeAmount <= 0) return;

    const intPart = Math.floor(safeAmount);
    const fracPart = safeAmount - intPart;

    score += intPart;
    fractionalScore += fracPart;
    totalEarned += safeAmount;

    if (fractionalScore >= 1) {
        const whole = Math.floor(fractionalScore);
        score += whole;
        fractionalScore -= whole;
    }

    incrementQuest('earn_points', safeAmount);
}

// Milestones
function checkMilestones() {
    for (const milestone of milestones) {
        if (score >= milestone && !reachedMilestones.has(milestone)) {
            reachedMilestones.add(milestone);
            showNotification('Milestone reached: ' + formatLarge(milestone) + ' points!', true);
            playMilestoneSound();
            addScreenShake();
        }
    }
}

// Achievements
function checkAchievements() {
    for (const achievement of achievementDefs) {
        if (!unlockedAchievements.has(achievement.id) && achievement.check()) {
            unlockedAchievements.add(achievement.id);
            showNotification('Achievement unlocked: ' + achievement.text, true);
            playMilestoneSound();
            addScreenShake();
        }
    }
}

function renderAchievements() {
    achievementsList.innerHTML = '';

    for (const achievement of achievementDefs) {
        const li = document.createElement('li');
        const isUnlocked = unlockedAchievements.has(achievement.id);
        li.textContent = (isUnlocked ? '[Unlocked] ' : '[Locked] ') + achievement.text;
        if (isUnlocked) li.classList.add('unlocked');
        achievementsList.appendChild(li);
    }

    const pct = Math.round(getAchievementBonus() * 100);
    achievementSummary.textContent = unlockedAchievements.size + ' unlocked | +' + pct + '% bonus';
}

// Quests
function rollQuest() {
    const picked = questPool[Math.floor(Math.random() * questPool.length)];
    currentQuest = {
        id: picked.id,
        description: picked.description,
        metric: picked.metric,
        target: picked.target,
        reward: picked.reward,
        progress: 0,
        completed: false
    };
}

function rollVoidUpgrade() {
    const affordable = voidUpgradeDefs.filter(def => def.cost <= voidPoints);
    currentVoidUpgrade = affordable.length > 0 ? affordable[Math.floor(Math.random() * affordable.length)] : null;
}

function buyVoidUpgrade() {
    if (!currentVoidUpgrade) return false;
    if (voidPoints < currentVoidUpgrade.cost) return false;
    voidPoints -= currentVoidUpgrade.cost;
    ascensions += 1;
    const unlockedText = currentVoidUpgrade.text;
    rollVoidUpgrade();
    showNotification('Void upgrade unlocked: ' + unlockedText, true);
    playMilestoneSound();
    saveGame();
    updateDisplay();
    return true;
}

function incrementQuest(metric, value) {
    if (!currentQuest || currentQuest.completed) return;
    if (currentQuest.metric !== metric) return;

    if (metric === 'combo_peak') {
        currentQuest.progress = Math.max(currentQuest.progress, Math.floor(value));
    } else {
        currentQuest.progress = cleanNumber(currentQuest.progress + value);
    }

    if (currentQuest.progress >= currentQuest.target) {
        currentQuest.completed = true;
        const reward = currentQuest.reward;
        showNotification('Quest complete! +' + formatLarge(reward) + ' pts', true);
        playMilestoneSound();
        addScreenShake();
        addScore(reward);

        setTimeout(() => {
            rollQuest();
            updateDisplay();
            saveGame();
        }, 1500);
    }
}

function renderQuest() {
    if (!currentQuest) {
        questDescription.textContent = 'No quest yet';
        questProgress.textContent = 'Progress: 0/0';
        questReward.textContent = 'Reward: 0 pts';
        return;
    }

    questDescription.textContent = currentQuest.description;
    const shownProgress = Math.min(currentQuest.progress, currentQuest.target);
    questProgress.textContent = 'Progress: ' + formatNumber(shownProgress) + '/' + formatNumber(currentQuest.target);
    questReward.textContent = 'Reward: ' + formatLarge(currentQuest.reward) + ' pts';
}

// Golden cookie
function scheduleGoldenCookie() {
    clearTimeout(goldenCookieTimeoutId);
    const delay = isExtremeMode()
        ? 8000 + Math.floor(Math.random() * 12000)
        : 20000 + Math.floor(Math.random() * 40000);
    goldenCookieTimeoutId = setTimeout(showGoldenCookie, delay);
}

function hideGoldenCookie() {
    goldenCookieBtn.classList.add('hidden');
    clearTimeout(goldenCookieHideId);
    scheduleGoldenCookie();
}

function showGoldenCookie() {
    const margin = 90;
    const x = margin + Math.floor(Math.random() * Math.max(80, window.innerWidth - margin * 2));
    const y = margin + Math.floor(Math.random() * Math.max(80, window.innerHeight - margin * 2));

    goldenCookieBtn.style.left = x + 'px';
    goldenCookieBtn.style.top = y + 'px';
    goldenCookieBtn.classList.remove('hidden');

    clearTimeout(goldenCookieHideId);
    goldenCookieHideId = setTimeout(hideGoldenCookie, 8000);
}

function clearBuff() {
    activeBuff = { label: '', clickMultiplier: 1, ppsMultiplier: 1, expiresAt: 0 };
    clearTimeout(buffTimeoutId);
}

function grantVoidPoints() {
    if (score < 1000000) return 0;
    const gain = Math.max(1, Math.floor(Math.sqrt(score / 1000000)) + prestigePoints);
    voidPoints += gain;
    return gain;
}

function setTimedBuff(label, clickMul, ppsMul, durationMs) {
    activeBuff.label = label;
    activeBuff.clickMultiplier = clickMul;
    activeBuff.ppsMultiplier = ppsMul;
    activeBuff.expiresAt = Date.now() + durationMs;

    clearTimeout(buffTimeoutId);
    buffTimeoutId = setTimeout(() => {
        clearBuff();
        showNotification('Buff ended: ' + label);
        updateDisplay();
        saveGame();
    }, durationMs);
}

function handleGoldenCookieClick() {
    hideGoldenCookie();
    const roll = Math.random();

    if (roll < 0.34) {
        setTimedBuff('Frenzy Clicks', 5, 1, 10000);
        showNotification('Golden Cookie: Frenzy Clicks (x5) for 10s!', true);
    } else if (roll < 0.68) {
        setTimedBuff('Turbo Production', 1, 3, 8000);
        showNotification('Golden Cookie: Turbo Production (x3 PPS) for 8s!', true);
    } else {
        const burst = Math.max(250, cleanNumber(getClickValue() * 20 + calculatePPS() * 10));
        addScore(burst);
        showNotification('Golden Cookie: Instant burst +' + formatLarge(burst) + '!', true);
        addScreenShake();
    }

    playMilestoneSound();
    checkMilestones();
    checkAchievements();
    updateDisplay();
    saveGame();
}

// Upgrades
function updateUpgradeButtons() {
    upgradeButtons.clickPower.disabled = score < upgrades.clickPower.cost;
    upgradeButtons.autoClicker.disabled = score < upgrades.autoClicker.cost;
    upgradeButtons.multiplier.disabled = score < upgrades.multiplier.cost;

    upgradeButtons.clickPower.textContent = 'Click Boost Lv' + upgrades.clickPower.level + ' (' + formatLarge(upgrades.clickPower.cost) + ' pts)';
    upgradeButtons.autoClicker.textContent = 'Auto-Clicker Lv' + upgrades.autoClicker.level + ' (' + formatLarge(upgrades.autoClicker.cost) + ' pts)';
    upgradeButtons.multiplier.textContent = 'Click Multiplier Lv' + upgrades.multiplier.level + ' (' + formatLarge(upgrades.multiplier.cost) + ' pts)';

    const affordableClick = getAffordableCount('clickPower');
    const affordableAuto = getAffordableCount('autoClicker');
    const affordableMulti = getAffordableCount('multiplier');

    maxButtons.clickPower.textContent = 'Max x' + affordableClick;
    maxButtons.autoClicker.textContent = 'Max x' + affordableAuto;
    maxButtons.multiplier.textContent = 'Max x' + affordableMulti;

    maxButtons.clickPower.disabled = affordableClick === 0;
    maxButtons.autoClicker.disabled = affordableAuto === 0;
    maxButtons.multiplier.disabled = affordableMulti === 0;
}

function getAffordableCount(key) {
    const spec = upgrades[key];
    let testScore = Math.floor(score);
    let testLevel = spec.level;
    let count = 0;

    for (let i = 0; i < 10000; i++) {
        const cost = computeUpgradeCost(key, testLevel);
        if (testScore < cost) break;
        testScore -= cost;
        testLevel += 1;
        count += 1;
    }

    return count;
}

function buyOneUpgrade(key) {
    const spec = upgrades[key];
    if (score < spec.cost) return false;

    score -= spec.cost;
    spec.level += 1;
    spec.cost = computeUpgradeCost(key, spec.level);
    upgradePurchases += 1;
    incrementQuest('upgrades', 1);
    playUpgradeSound();
    return true;
}

function buyMultiple(key, times) {
    if (times <= 0) return;

    let bought = 0;
    for (let i = 0; i < times; i++) {
        if (!buyOneUpgrade(key)) break;
        bought += 1;
    }

    if (bought > 0) {
        checkMilestones();
        checkAchievements();
        updateDisplay();
        saveGame();
    }
}

// Prestige
function getPrestigeGain() {
    if (score < 100000) return 0;
    return Math.floor(Math.sqrt(score / 10000));
}

function getAscensionGain() {
    if (score < 1000000) return 0;
    return Math.max(1, Math.floor(Math.log10(score / 1000000) + 1));
}

function resetRunOnly() {
    score = 0;
    fractionalScore = 0;
    totalClicks = 0;
    totalEarned = 0;
    upgradePurchases = 0;
    combo = 1;
    lastClickTime = 0;
    reachedMilestones.clear();

    upgrades.clickPower = { level: 1, cost: 10, baseCost: 10 };
    upgrades.autoClicker = { level: 0, cost: 50, increment: 1, baseCost: 50 };
    upgrades.multiplier = { level: 0, cost: 100, increment: 0.5, baseCost: 100 };

    clearBuff();
    hideGoldenCookie();
    rollQuest();
}

function performPrestige() {
    const gain = getPrestigeGain();
    if (gain <= 0) {
        showNotification('Need at least 100,000 points to prestige.');
        return;
    }

    if (!confirm('Prestige now for +' + gain + ' prestige? This resets your run progress.')) return;

    prestigePoints += gain;
    resetRunOnly();
    showNotification('Prestige complete! Total prestige: ' + prestigePoints, true);
    playMilestoneSound();
    checkAchievements();
    updateDisplay();
    saveGame();
}

function performAscension() {
    const gain = getAscensionGain();
    if (gain <= 0) {
        showNotification('Need at least 1,000,000 points to ascend.');
        return;
    }

    if (!confirm('Ascend now for +' + gain + ' ascension(s)? This resets your run and grants void power.')) return;

    const voidGain = grantVoidPoints();
    ascensions += gain;
    prestigePoints += Math.floor(gain / 2);
    resetRunOnly();
    rollVoidUpgrade();
    showNotification('Ascension complete! +' + gain + ' ascension(s), +' + voidGain + ' void.', true);
    playMilestoneSound();
    checkAchievements();
    updateDisplay();
    saveGame();
}

// Display
function updateDisplay() {
    scoreDisplay.textContent = formatLarge(score + fractionalScore);
    clicksDisplay.textContent = 'Clicks: ' + formatLarge(totalClicks);
    comboDisplay.textContent = 'Combo: x' + combo;

    const pps = calculatePPS();
    let ppsText = 'PPS: ' + formatNumber(pps);

    if (activeBuff.expiresAt > Date.now()) {
        const seconds = Math.max(1, Math.ceil((activeBuff.expiresAt - Date.now()) / 1000));
        ppsText += ' | Buff: ' + activeBuff.label + ' (' + seconds + 's)';
    }

    ppsDisplay.textContent = ppsText;
    voidPointsDisplay.textContent = 'Void: ' + formatLarge(voidPoints);
    voidPointsDisplay.classList.toggle('hidden-stat', !isExtremeMode());

    const prestigeGain = getPrestigeGain();
    prestigeInfo.textContent = 'Prestige: ' + prestigePoints + ' | Bonus: x' + formatNumber(getPrestigeMultiplier());
    ascendInfo.textContent = 'Ascensions: ' + ascensions + ' | Void bonus: x' + formatNumber(getVoidMultiplier());
    prestigeBtn.disabled = prestigeGain <= 0;
    prestigeBtn.textContent = prestigeGain > 0
        ? 'Prestige (Gain +' + prestigeGain + ')'
        : 'Prestige (Need 100,000 pts)';

    const ascendGain = getAscensionGain();
    ascendBtn.disabled = ascendGain <= 0;
    ascendBtn.textContent = ascendGain > 0
        ? 'Ascend (Gain +' + ascendGain + ')'
        : 'Ascend (Need 1,000,000 pts)';

    if (currentVoidUpgrade) {
        voidUpgradeBtn.disabled = voidPoints < currentVoidUpgrade.cost;
        voidUpgradeBtn.textContent = 'Void Upgrade (' + currentVoidUpgrade.text + ' - ' + currentVoidUpgrade.cost + ' Void)';
        voidUpgradeInfo.textContent = currentVoidUpgrade.description;
    } else {
        voidUpgradeBtn.disabled = true;
        voidUpgradeBtn.textContent = 'Void Upgrade (No upgrade ready)';
        voidUpgradeInfo.textContent = 'Ascend to roll a void upgrade.';
    }

    updateUpgradeButtons();
    renderAchievements();
    renderQuest();
}

// Event handlers
clickBtn.addEventListener('click', (e) => {
    updateCombo();

    const clickValue = getClickValue();
    addScore(clickValue);
    totalClicks += 1;

    incrementQuest('clicks', 1);

    const rect = clickBtn.getBoundingClientRect();
    createFloatingText(clickValue, e.clientX - rect.left - 20, e.clientY - rect.top - 20, combo >= 10);

    playClickSound();
    checkMilestones();
    checkAchievements();
    updateDisplay();
    saveGame();
});

goldenCookieBtn.addEventListener('click', handleGoldenCookieClick);

upgradeButtons.clickPower.addEventListener('click', () => {
    if (buyOneUpgrade('clickPower')) {
        checkMilestones();
        checkAchievements();
        updateDisplay();
        saveGame();
    }
});

upgradeButtons.autoClicker.addEventListener('click', () => {
    if (buyOneUpgrade('autoClicker')) {
        checkMilestones();
        checkAchievements();
        updateDisplay();
        saveGame();
    }
});

upgradeButtons.multiplier.addEventListener('click', () => {
    if (buyOneUpgrade('multiplier')) {
        checkMilestones();
        checkAchievements();
        updateDisplay();
        saveGame();
    }
});

maxButtons.clickPower.addEventListener('click', () => buyMultiple('clickPower', getAffordableCount('clickPower')));
maxButtons.autoClicker.addEventListener('click', () => buyMultiple('autoClicker', getAffordableCount('autoClicker')));
maxButtons.multiplier.addEventListener('click', () => buyMultiple('multiplier', getAffordableCount('multiplier')));

prestigeBtn.addEventListener('click', performPrestige);
ascendBtn.addEventListener('click', performAscension);
voidUpgradeBtn.addEventListener('click', buyVoidUpgrade);

// Main passive loop
setInterval(() => {
    const pps = calculatePPS();
    if (pps > 0) {
        addScore(pps);
        createFloatingText(pps, Math.random() * 130 + 70, Math.random() * 120 + 70);
        checkMilestones();
        checkAchievements();
        updateDisplay();
        saveGame();
    }
}, 1000);

// Reset game (hard reset includes prestige and achievements)
function resetGame() {
    if (!confirm('Are you sure? This will reset all progress including prestige and achievements!')) return;

    score = 0;
    fractionalScore = 0;
    totalClicks = 0;
    totalEarned = 0;
    upgradePurchases = 0;
    combo = 1;
    lastClickTime = 0;
    prestigePoints = 0;

    reachedMilestones.clear();
    unlockedAchievements.clear();

    upgrades.clickPower = { level: 1, cost: 10, baseCost: 10 };
    upgrades.autoClicker = { level: 0, cost: 50, increment: 1, baseCost: 50 };
    upgrades.multiplier = { level: 0, cost: 100, increment: 0.5, baseCost: 100 };

    clearBuff();
    hideGoldenCookie();
    rollQuest();

    localStorage.removeItem('cookieClickerGame');
    updateDisplay();
    showNotification('Game reset complete.');
}

resetBtn.addEventListener('click', resetGame);

// Startup
loadGame();
if (!currentQuest) rollQuest();
if (!currentVoidUpgrade && voidPoints > 0) rollVoidUpgrade();
checkAchievements();
updateDisplay();
scheduleGoldenCookie();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {
            // Ignore registration failures so the game still runs normally.
        });
    });
}
