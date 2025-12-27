/**
 * FoE Data Exporter - popup.js
 * Exporta datos de Forge of Empires a JSON y Excel
 */

import { analytics } from './analytics.js';

const CLICK_THRESHOLD = 25;
let logoClicks = 0;

document.addEventListener('DOMContentLoaded', function () {
    // Initialize Analytics
    analytics.init().then(() => {
        analytics.track('view_popup');

        // Update checkbox state
        const checkAnalytics = document.getElementById('checkAnalytics');
        if (checkAnalytics) {
            checkAnalytics.checked = analytics.enabled;
            checkAnalytics.addEventListener('change', (e) => {
                analytics.setEnabled(e.target.checked);
            });
        }
    });

    // Secret JSON button logic
    const imgLogo = document.getElementById('logo');
    if (imgLogo) {
        imgLogo.addEventListener('click', () => {
            logoClicks++;
            if (logoClicks === CLICK_THRESHOLD) {
                document.getElementById('btnJson').classList.remove('hidden');
                showToast('¡Modo Dios activado!', 'success');
            }
        });
    }

    // Load Settings
    loadSettings();

    // View Navigation
    document.getElementById('btnSettings').addEventListener('click', () => toggleView('settings'));
    document.getElementById('btnBack').addEventListener('click', () => toggleView('main'));

    // Settings Listeners
    document.querySelectorAll('input[name="downloadMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateSubfolderInputState();
            saveSettings();
        });
    });

    document.getElementById('inputSubfolder').addEventListener('input', saveSettings);

    document.getElementById('btnJson').addEventListener('click', () => {
        analytics.track('export_json');
        exportData('json');
    });
    document.getElementById('btnEfficiency').addEventListener('click', () => {
        analytics.track('export_efficiency');
        exportData('efficiency');
    });
    document.getElementById('btnCatalog').addEventListener('click', () => {
        analytics.track('export_catalog');
        exportData('catalog');
    });
});

// Settings Management
const DEFAULT_SETTINGS = {
    downloadMode: 'default', // default, subfolder, ask
    downloadSubfolder: 'FoE_Data'
};

let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
        currentSettings = items;

        // Update UI
        const radio = document.querySelector(`input[name="downloadMode"][value="${currentSettings.downloadMode}"]`);
        if (radio) radio.checked = true;

        const inputSub = document.getElementById('inputSubfolder');
        if (inputSub) inputSub.value = currentSettings.downloadSubfolder;

        updateSubfolderInputState();
    });
}

function saveSettings() {
    const mode = document.querySelector('input[name="downloadMode"]:checked').value;
    const subfolder = document.getElementById('inputSubfolder').value.trim() || 'FoE_Data';

    currentSettings = {
        downloadMode: mode,
        downloadSubfolder: subfolder
    };

    chrome.storage.local.set(currentSettings);
}

function updateSubfolderInputState() {
    const mode = document.querySelector('input[name="downloadMode"]:checked').value;
    const input = document.getElementById('inputSubfolder');
    if (input) {
        input.disabled = (mode !== 'subfolder');
        input.style.opacity = (mode === 'subfolder') ? '1' : '0.5';
    }
}

function toggleView(viewName) {
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');

    if (viewName === 'settings') {
        mainView.classList.remove('active');
        settingsView.classList.add('active');
    } else {
        settingsView.classList.remove('active');
        mainView.classList.add('active');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return alert(message); // Fallback

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function setLoading(isLoading) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = isLoading ? 'flex' : 'none';
        // Force layout repaint to ensure spinner spins
        if (isLoading) overlay.offsetHeight;
    }
}

async function exportData(type) {
    setLoading(true);
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Ejecutar script en el juego y obtener datos de vuelta
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            world: 'MAIN',
            args: [type],
            func: (exportType) => {
                if (!window.location.href.includes('forgeofempires.com/game')) return null;
                if (typeof MainParser === 'undefined') return null;

                // ============================================
                // UTILIDADES
                // ============================================

                function safeClone(obj) {
                    const cache = new Set();
                    return JSON.parse(JSON.stringify(obj, (key, value) => {
                        if (typeof value === 'function') return undefined;
                        if (typeof value === 'object' && value !== null) {
                            if (cache.has(value)) return undefined;
                            cache.add(value);
                        }
                        return value;
                    }));
                }

                function extractSize(entity) {
                    if (typeof entity.width === 'number' && typeof entity.length === 'number') {
                        return { width: entity.width, length: entity.length };
                    }
                    const components = entity.components || {};
                    for (const era in components) {
                        const comp = components[era];
                        if (comp?.placement?.size) {
                            const x = comp.placement.size.x;
                            const y = comp.placement.size.y;
                            if (typeof x === 'number' && typeof y === 'number') {
                                return { width: x, length: y };
                            }
                        }
                    }
                    return { width: 1, length: 1 };
                }

                function needStreetAsText(needStreet) {
                    const streetTypes = ['No', 'Single', 'Double'];
                    return streetTypes[needStreet] || 'No';
                }
                // Mapeo de tipos especiales que se expanden a múltiples boosts
                const specialBoostTypes = {
                    'fierce_resistance': ['all-att_boost_defender', 'all-def_boost_defender'],
                    'advanced_tactics': ['all-att_boost_attacker', 'all-def_boost_attacker', 'all-att_boost_defender', 'all-def_boost_defender'],
                    'military_boost': ['all-att_boost_attacker', 'all-def_boost_attacker'],
                    'all-att_def_boost_defender': ['all-att_boost_defender', 'all-def_boost_defender'],
                    'all-att_def_boost_attacker': ['all-att_boost_attacker', 'all-def_boost_attacker'],
                    'all-att_def_boost_attacker_defender': ['all-att_boost_attacker', 'all-def_boost_attacker', 'all-att_boost_defender', 'all-def_boost_defender'],
                    'battleground-att_def_boost_defender': ['battleground-att_boost_defender', 'battleground-def_boost_defender'],
                    'battleground-att_def_boost_attacker': ['battleground-att_boost_attacker', 'battleground-def_boost_attacker'],
                    'battleground-att_def_boost_attacker_defender': ['battleground-att_boost_attacker', 'battleground-def_boost_attacker', 'battleground-att_boost_defender', 'battleground-def_boost_defender'],
                    'guild_expedition-att_def_boost_defender': ['guild_expedition-att_boost_defender', 'guild_expedition-def_boost_defender'],
                    'guild_expedition-att_def_boost_attacker': ['guild_expedition-att_boost_attacker', 'guild_expedition-def_boost_attacker'],
                    'guild_expedition-att_def_boost_attacker_defender': ['guild_expedition-att_boost_attacker', 'guild_expedition-def_boost_attacker', 'guild_expedition-att_boost_defender', 'guild_expedition-def_boost_defender'],
                    'guild_raids-att_def_boost_defender': ['guild_raids-att_boost_defender', 'guild_raids-def_boost_defender'],
                    'guild_raids-att_def_boost_attacker': ['guild_raids-att_boost_attacker', 'guild_raids-def_boost_attacker'],
                    'guild_raids-att_def_boost_attacker_defender': ['guild_raids-att_boost_attacker', 'guild_raids-def_boost_attacker', 'guild_raids-att_boost_defender', 'guild_raids-def_boost_defender']
                };

                // Tipos de boost válidos que queremos procesar
                const allowedBoostTypes = new Set([
                    'all-att_boost_attacker', 'all-def_boost_attacker', 'all-att_boost_defender', 'all-def_boost_defender',
                    'battleground-att_boost_attacker', 'battleground-def_boost_attacker', 'battleground-att_boost_defender', 'battleground-def_boost_defender',
                    'guild_expedition-att_boost_attacker', 'guild_expedition-def_boost_attacker', 'guild_expedition-att_boost_defender', 'guild_expedition-def_boost_defender',
                    'guild_raids-att_boost_attacker', 'guild_raids-def_boost_attacker', 'guild_raids-att_boost_defender', 'guild_raids-def_boost_defender',
                    ...Object.keys(specialBoostTypes)
                ]);

                function expandSpecialBoosts(boosts) {
                    const expanded = {};
                    for (const key in boosts) {
                        if (specialBoostTypes[key]) {
                            for (const expandedKey of specialBoostTypes[key]) {
                                expanded[expandedKey] = (expanded[expandedKey] || 0) + boosts[key];
                            }
                        } else {
                            expanded[key] = (expanded[key] || 0) + boosts[key];
                        }
                    }
                    return expanded;
                }

                // Obtener la era del ayuntamiento (edificio ID 1)
                function getTownHallEra(cityMapData) {
                    const townHall = cityMapData['1'];
                    if (!townHall) return 'AllAge';
                    const entityId = townHall.cityentity_id;
                    if (!entityId) return 'AllAge';
                    const parts = entityId.split('_');
                    return parts.length > 1 ? parts[1] : 'AllAge';
                }

                // Extraer boosts de una entidad, buscando en múltiples ubicaciones
                function extractBoosts(catalogEntry, playerEntity, eraName) {
                    const boosts = {};
                    const components = catalogEntry.components || {};

                    // 1. Buscar en components[era_name].boosts
                    if (components[eraName]?.boosts?.boosts) {
                        for (const boost of components[eraName].boosts.boosts) {
                            const key = `${boost.targetedFeature || 'all'}-${boost.type}`;
                            if (allowedBoostTypes.has(key) && typeof boost.value === 'number') {
                                boosts[key] = (boosts[key] || 0) + boost.value;
                            }
                        }
                        if (Object.keys(boosts).length > 0) {
                            return expandSpecialBoosts(boosts);
                        }
                    }

                    // 2. Buscar en components.AllAge.boosts
                    if (components['AllAge']?.boosts?.boosts) {
                        for (const boost of components['AllAge'].boosts.boosts) {
                            const key = `${boost.targetedFeature || 'all'}-${boost.type}`;
                            if (allowedBoostTypes.has(key) && typeof boost.value === 'number') {
                                boosts[key] = (boosts[key] || 0) + boost.value;
                            }
                        }
                        if (Object.keys(boosts).length > 0) {
                            return expandSpecialBoosts(boosts);
                        }
                    }

                    // 3. Buscar en CityMapData.bonus (datos del jugador)
                    if (playerEntity?.bonus) {
                        const bonus = playerEntity.bonus;
                        const key = bonus.type;
                        if (allowedBoostTypes.has(key) && typeof bonus.value === 'number') {
                            boosts[key] = (boosts[key] || 0) + bonus.value;
                        }
                        if (Object.keys(boosts).length > 0) {
                            return expandSpecialBoosts(boosts);
                        }
                    }

                    return boosts;
                }

                const timestamp = new Date().toISOString().split('T')[0];

                // ============================================
                // EXPORTAR JSON - devolver datos para descargar
                // ============================================

                if (exportType === 'json') {
                    const data = safeClone({
                        MainParser: MainParser,
                        buildingData: window.buildingData || null,
                        exportDate: new Date().toISOString()
                    });
                    return { type: 'json', data: data, filename: `foe_data_${timestamp}.json` };
                }

                // ============================================
                // EXPORTAR EXCEL EFICIENCIA
                // ============================================

                if (exportType === 'efficiency') {
                    const buildingData = MainParser.CityEntities;
                    const cityMapData = MainParser.CityMapData;

                    if (!cityMapData || !buildingData) {
                        return { type: 'error', message: 'Datos no encontrados. Asegúrate de estar en tu ciudad.' };
                    }

                    console.log('CityMapData:', Object.keys(cityMapData).length, 'edificios');
                    console.log('CityEntities:', Object.keys(buildingData).length, 'en catálogo');

                    const colNames = {
                        'name': 'Nombre', 'eraName': 'Era', 'count': 'Cantidad',
                        'size_total': 'Tamaño', 'needStreet': 'Calle',
                        'all-att_boost_attacker': 'Ataque en Ataque',
                        'all-def_boost_attacker': 'Defensa en Ataque',
                        'all-att_boost_defender': 'Ataque en Defensa',
                        'all-def_boost_defender': 'Defensa en Defensa',
                        'battleground-att_boost_attacker': 'Ataque en Ataque CdB',
                        'battleground-def_boost_attacker': 'Defensa en Ataque CdB',
                        'battleground-att_boost_defender': 'Ataque en Defensa CdB',
                        'battleground-def_boost_defender': 'Defensa en Defensa CdB',
                        'guild_expedition-att_boost_attacker': 'Ataque en Ataque Expe',
                        'guild_expedition-def_boost_attacker': 'Defensa en Ataque Expe',
                        'guild_expedition-att_boost_defender': 'Ataque en Defensa Expe',
                        'guild_expedition-def_boost_defender': 'Defensa en Defensa Expe',
                        'guild_raids-att_boost_attacker': 'Ataque en Ataque IC',
                        'guild_raids-def_boost_attacker': 'Defensa en Ataque IC',
                        'guild_raids-att_boost_defender': 'Ataque en Defensa IC',
                        'guild_raids-def_boost_defender': 'Defensa en Defensa IC'
                    };

                    // Obtener la era del ayuntamiento
                    const townHallEra = getTownHallEra(cityMapData);
                    console.log('Era del ayuntamiento:', townHallEra);

                    // Procesar edificios
                    const buildings = [];
                    for (const id in cityMapData) {
                        const playerEntity = cityMapData[id];
                        const entityId = playerEntity.cityentity_id;
                        const catalogEntry = buildingData[entityId];
                        if (!catalogEntry) continue;

                        const { width, length } = extractSize(catalogEntry);
                        const boosts = extractBoosts(catalogEntry, playerEntity, townHallEra);
                        const streetLevel = catalogEntry.requirements?.street_connection_level || 0;

                        buildings.push({
                            name: catalogEntry.name || entityId,
                            eraName: townHallEra,
                            count: 1,
                            size_total: width * length,
                            streetLevel: streetLevel,
                            needStreet: needStreetAsText(streetLevel),
                            ...boosts
                        });
                    }

                    // Agrupar edificios iguales (solo incrementar count, NO sumar boosts)
                    const grouped = {};
                    for (const b of buildings) {
                        const key = b.name + '|' + b.eraName;
                        if (!grouped[key]) {
                            grouped[key] = { ...b };
                        } else {
                            grouped[key].count++;
                            // Los boosts se mantienen como valor unitario, no se suman
                        }
                    }
                    const buildingList = Object.values(grouped);

                    // Columnas de boosts
                    const allBoostCols = ['all-att_boost_attacker', 'all-def_boost_attacker', 'all-att_boost_defender', 'all-def_boost_defender'];
                    const cdbCols = ['battleground-att_boost_attacker', 'battleground-def_boost_attacker', 'battleground-att_boost_defender', 'battleground-def_boost_defender'];
                    const expeCols = ['guild_expedition-att_boost_attacker', 'guild_expedition-def_boost_attacker', 'guild_expedition-att_boost_defender', 'guild_expedition-def_boost_defender'];
                    const icCols = ['guild_raids-att_boost_attacker', 'guild_raids-def_boost_attacker', 'guild_raids-att_boost_defender', 'guild_raids-def_boost_defender'];
                    const allCols = [...allBoostCols, ...cdbCols, ...expeCols, ...icCols];

                    function calcEfficiency(item, cols) {
                        let sum = 0;
                        for (const c of cols) sum += item[c] || 0;
                        // Cálculo de eficiencia: Tamaño + Nivel de Calle
                        const adjustedSize = item.size_total + (item.streetLevel || 0);
                        const efficiency = adjustedSize > 0 ? sum / adjustedSize : 0;
                        // Formato español: 2 decimales con coma
                        return parseFloat(efficiency.toFixed(2));
                    }

                    function createSheet(items, boostCols) {
                        const filtered = items.filter(item => boostCols.some(c => (item[c] || 0) !== 0));
                        for (const item of filtered) {
                            item.Eficiencia = calcEfficiency(item, boostCols);
                        }
                        filtered.sort((a, b) => b.Eficiencia - a.Eficiencia);

                        const outCols = ['name', 'eraName', 'count', 'size_total', 'needStreet', ...boostCols, 'Eficiencia'];
                        const header = outCols.map(c => colNames[c] || c);
                        const rows = [header];
                        for (const item of filtered) {
                            rows.push(outCols.map(c => item[c] || 0));
                        }
                        return rows;
                    }

                    // Función para crear hoja de Excluídos (sin boosts)
                    function createExcludedSheet(items, boostCols) {
                        const excluded = items.filter(item => boostCols.every(c => (item[c] || 0) === 0));
                        excluded.sort((a, b) => a.name.localeCompare(b.name));

                        const outCols = ['name', 'eraName', 'count', 'size_total', 'needStreet'];
                        const header = outCols.map(c => colNames[c] || c);
                        const rows = [header];
                        for (const item of excluded) {
                            rows.push(outCols.map(c => item[c] || 0));
                        }
                        return rows;
                    }

                    const sheets = {
                        'Bono Completo': createSheet(buildingList, allCols),
                        'Bono CdB': createSheet(buildingList, cdbCols),
                        'Bono Expe': createSheet(buildingList, expeCols),
                        'Bono IC': createSheet(buildingList, icCols),
                        'Excluídos': createExcludedSheet(buildingList, allCols)
                    };

                    return { type: 'excel', sheets: sheets, filename: `foe_efficiency_${timestamp}.xlsx` };
                }

                // ============================================
                // EXPORTAR EXCEL CATÁLOGO
                // ============================================

                if (exportType === 'catalog') {
                    const catalog = MainParser.CityEntities;

                    if (!catalog) {
                        return { type: 'error', message: 'CityEntities no encontrado.' };
                    }

                    console.log('CityEntities para catálogo:', Object.keys(catalog).length, 'edificios');

                    // Lista de eras del juego (en orden)
                    const eraList = [
                        'SpaceAgeSpaceHub', 'ArcticFuture', 'BronzeAge', 'ColonialAge',
                        'ContemporaryEra', 'EarlyMiddleAge', 'FutureEra', 'HighMiddleAge',
                        'IndustrialAge', 'IronAge', 'LateMiddleAge', 'ModernEra',
                        'OceanicFuture', 'PostModernEra', 'ProgressiveEra', 'SpaceAgeAsteroidBelt',
                        'SpaceAgeJupiterMoon', 'SpaceAgeMars', 'SpaceAgeTitan', 'SpaceAgeVenus',
                        'TomorrowEra', 'VirtualFuture'
                    ];

                    // Columnas de boost militares (para eficiencia y visualización prioritaria)
                    const militaryBoosts = [
                        'all_att_boost_attacker', 'all_att_boost_defender',
                        'all_def_boost_attacker', 'all_def_boost_defender',
                        'battleground_att_boost_attacker', 'battleground_att_boost_defender',
                        'battleground_def_boost_attacker', 'battleground_def_boost_defender',
                        'guild_expedition_att_boost_attacker', 'guild_expedition_att_boost_defender',
                        'guild_expedition_def_boost_attacker', 'guild_expedition_def_boost_defender',
                        'guild_raids_att_boost_attacker', 'guild_raids_att_boost_defender',
                        'guild_raids_def_boost_attacker', 'guild_raids_def_boost_defender'
                    ];

                    // Todas las columnas a exportar (militares + recursos IC)
                    const allExportCols = [
                        ...militaryBoosts,
                        'all_guild_raids_action_points_capacity', 'all_guild_raids_action_points_collection',
                        'all_guild_raids_coins_production', 'all_guild_raids_coins_start',
                        'all_guild_raids_goods_start', 'all_guild_raids_supplies_production',
                        'all_guild_raids_supplies_start', 'all_guild_raids_units_start'
                    ];

                    // Función para extraer boosts de un edificio para una era específica
                    function getCatalogBoosts(entry, era) {
                        const boosts = {};
                        const components = entry.components || {};

                        // Combinar AllAge + era específica
                        const sources = ['AllAge', era];
                        for (const src of sources) {
                            if (components[src]?.boosts?.boosts) {
                                for (const boost of components[src].boosts.boosts) {
                                    const target = boost.targetedFeature || 'all';
                                    const boostType = boost.type;
                                    const colName = `${target}_${boostType}`;
                                    if (typeof boost.value === 'number') {
                                        boosts[colName] = (boosts[colName] || 0) + boost.value;
                                    }
                                }
                            }
                        }

                        // Expandir boosts especiales y combinados
                        const expanded = {};

                        // Definición de expansiones (CORREGIDO: Usar underscores consistently)
                        const expansions = {
                            // All Age
                            'all_fierce_resistance': ['all_att_boost_defender', 'all_def_boost_defender'],
                            'all_advanced_tactics': ['all_att_boost_attacker', 'all_def_boost_attacker', 'all_att_boost_defender', 'all_def_boost_defender'],
                            'all_military_boost': ['all_att_boost_attacker', 'all_def_boost_attacker'],
                            'all_att_def_boost_defender': ['all_att_boost_defender', 'all_def_boost_defender'],
                            'all_att_def_boost_attacker': ['all_att_boost_attacker', 'all_def_boost_attacker'],
                            'all_att_def_boost_attacker_defender': ['all_att_boost_attacker', 'all_def_boost_attacker', 'all_att_boost_defender', 'all_def_boost_defender'],

                            // Battleground (CdB)
                            'battleground_att_def_boost_attacker': ['battleground_att_boost_attacker', 'battleground_def_boost_attacker'],
                            'battleground_att_def_boost_defender': ['battleground_att_boost_defender', 'battleground_def_boost_defender'],
                            'battleground_att_def_boost_attacker_defender': ['battleground_att_boost_attacker', 'battleground_def_boost_attacker', 'battleground_att_boost_defender', 'battleground_def_boost_defender'],

                            // Guild Expedition (Expe)
                            'guild_expedition_att_def_boost_attacker': ['guild_expedition_att_boost_attacker', 'guild_expedition_def_boost_attacker'],
                            'guild_expedition_att_def_boost_defender': ['guild_expedition_att_boost_defender', 'guild_expedition_def_boost_defender'],
                            'guild_expedition_att_def_boost_attacker_defender': ['guild_expedition_att_boost_attacker', 'guild_expedition_def_boost_attacker', 'guild_expedition-def_boost_defender', 'guild_expedition-def_boost_defender'],// CORREGIDO

                            // Guild Raids (IC)
                            'guild_raids_att_def_boost_attacker': ['guild_raids_att_boost_attacker', 'guild_raids_def_boost_attacker'],
                            'guild_raids_att_def_boost_defender': ['guild_raids_att_boost_defender', 'guild_raids_def_boost_defender'],
                            'guild_raids_att_def_boost_attacker_defender': ['guild_raids_att_boost_attacker', 'guild_raids_def_boost_attacker', 'guild_raids-att_boost_defender', 'guild_raids-def_boost_defender']// CORREGIDO
                        };

                        for (const key in boosts) {
                            if (expansions[key]) {
                                for (const expandedKey of expansions[key]) {
                                    expanded[expandedKey] = (expanded[expandedKey] || 0) + boosts[key];
                                }
                            } else {
                                expanded[key] = (expanded[key] || 0) + boosts[key];
                            }
                        }

                        return expanded;
                    }

                    // Generar una hoja por cada era
                    const sheets = {};

                    // Definir qué columnas queremos incluir explícitamente y cuáles suman eficiencia
                    const allowedBoostsSet = new Set(allExportCols);
                    const efficiencyBoostsSet = new Set(militaryBoosts);

                    for (const era of eraList) {
                        const rows = [];
                        const allBoostCols = new Set();

                        // Procesar todos los edificios del catálogo
                        for (const entityId in catalog) {
                            const entry = catalog[entityId];
                            const { width, length } = extractSize(entry);
                            const streetLevel = entry.requirements?.street_connection_level || 0;
                            const rawBoosts = getCatalogBoosts(entry, era);

                            // Filtrar y procesar boosts
                            const boosts = {};
                            let hasRelevantBoost = false;
                            let totalEfficiencyBoost = 0;

                            for (const key in rawBoosts) {
                                if (allowedBoostsSet.has(key)) {
                                    boosts[key] = rawBoosts[key];
                                    hasRelevantBoost = true;

                                    // Sumar a eficiencia solo si es militar
                                    if (efficiencyBoostsSet.has(key)) {
                                        totalEfficiencyBoost += rawBoosts[key];
                                    }
                                }
                            }

                            // Solo incluir edificios que tengan algún boost RELEVANTE
                            if (!hasRelevantBoost) continue;

                            // Registrar columnas de boost presentes
                            for (const k in boosts) allBoostCols.add(k);

                            // Calcular eficiencia (solo militares)
                            const adjustedSize = (width * length) + streetLevel;
                            const efficiency = adjustedSize > 0 ? Math.round((totalEfficiencyBoost / adjustedSize) * 100) / 100 : 0;

                            rows.push({
                                Nombre: entry.name || entityId,
                                Eficiencia: efficiency,
                                Ancho: width,
                                Largo: length,
                                Tamaño: width * length,
                                Calle: streetLevel,
                                ...boosts
                            });
                        }

                        if (rows.length === 0) continue;

                        // Ordenar por eficiencia descendente
                        rows.sort((a, b) => b.Eficiencia - a.Eficiencia);

                        // Ordenar columnas según preferencia
                        const currentEraBoostCols = allExportCols.filter(c => allBoostCols.has(c));

                        const finalCols = ['Nombre', 'Eficiencia', ...currentEraBoostCols, 'Ancho', 'Largo', 'Tamaño', 'Calle'];

                        // Crear filas para Excel
                        const sheetRows = [finalCols];
                        for (const row of rows) {
                            sheetRows.push(finalCols.map(c => row[c] !== undefined ? row[c] : 0));
                        }

                        sheets[era] = sheetRows;
                    }

                    return { type: 'catalog', sheets: sheets, boostCols: Array.from(new Set(allExportCols)), filename: `foe_catalog_${timestamp}.xlsx` };
                }

                return null;
            }
        });

        // Procesar resultados
        const result = results?.find(r => r.result !== null)?.result;

        if (!result) {
            showToast('No se encontraron datos. Asegúrate de estar en el juego.', 'error');
            return;
        }

        if (result.type === 'error') {
            showToast(result.message, 'error');
            return;
        }

        if (result.type === 'json') {
            // Descargar JSON
            const jsonString = JSON.stringify(result.data, null, 2);
            downloadFile(jsonString, result.filename, 'application/json');
            const count = result.data.MainParser?.CityMapData ? Object.keys(result.data.MainParser.CityMapData).length : 0;
            showToast(`JSON exportado (${count} edificios)`, 'success');
            return;
        }

        if (result.type === 'excel') {
            // Generar Excel con ExcelJS (con iconos)
            // Ordenar las hojas
            const sheetOrder = ['Bono Completo', 'Bono CdB', 'Bono Expe', 'Bono IC', 'Excluídos'];
            const orderedSheets = {};
            for (const sheetName of sheetOrder) {
                if (result.sheets[sheetName]) {
                    orderedSheets[sheetName] = result.sheets[sheetName];
                }
            }

            try {
                const stats = await generateExcelWithIcons(orderedSheets, result.filename);
                showToast(`Excel generado: ${stats.totalRows} edificios`, 'success');
            } catch (e) {
                console.error('Error generando Excel:', e);
                showToast('Error generando Excel', 'error');
            }
            return;
        }

        if (result.type === 'catalog') {
            // Generar Catálogo con ExcelJS (con iconos)
            try {
                const stats = await generateExcelWithIcons(result.sheets, result.filename);
                showToast(`Catálogo generado: ${stats.totalRows} edificios`, 'success');
            } catch (e) {
                console.error('Error generando Catálogo:', e);
                showToast('Error generando Catálogo', 'error');
            }
            return;
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
        console.error(e);
    } finally {
        setLoading(false);
    }
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    let finalFilename = filename;
    let saveAs = false;

    // Apply Settings
    if (currentSettings.downloadMode === 'ask') {
        saveAs = true;
    } else if (currentSettings.downloadMode === 'subfolder') {
        // Sanitize folder name
        let folder = currentSettings.downloadSubfolder.replace(/[<>:"/\\|?*]/g, '');
        if (!folder) folder = 'FoE_Data';
        finalFilename = `${folder}/${filename}`;
        saveAs = false;
    } else {
        // Default (Downloads root)
        saveAs = false;
    }

    chrome.downloads.download({
        url: url,
        filename: finalFilename,
        saveAs: saveAs
    }, (downloadId) => {
        // Revoke URL after a short delay
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        if (chrome.runtime.lastError) {
            console.log("Download action exception:", chrome.runtime.lastError);
            showToast("Error descarga: " + chrome.runtime.lastError.message, 'error');
        } else {
            // Optional: Show success if "Save As" wasn't used
            if (!saveAs) showToast("Archivo guardado", 'success');
        }
    });
}

// Función para generar Excel con iconos usando ExcelJS
async function generateExcelWithIcons(sheets, filename) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'onosenday';
    workbook.lastModifiedBy = 'onosenday';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Mapa de traducción inversa: Nombre Traducido -> Clave de Icono (original)
    const translationMap = {
        'Ataque en Ataque': 'all_att_boost_attacker',
        'Defensa en Ataque': 'all_def_boost_attacker',
        'Ataque en Defensa': 'all_att_boost_defender',
        'Defensa en Defensa': 'all_def_boost_defender',

        'Ataque en Ataque CdB': 'battleground_att_boost_attacker',
        'Defensa en Ataque CdB': 'battleground_def_boost_attacker',
        'Ataque en Defensa CdB': 'battleground_att_boost_defender',
        'Defensa en Defensa CdB': 'battleground_def_boost_defender',

        'Ataque en Ataque Expe': 'guild_expedition_att_boost_attacker',
        'Defensa en Ataque Expe': 'guild_expedition_def_boost_attacker',
        'Ataque en Defensa Expe': 'guild_expedition_att_boost_defender',
        'Defensa en Defensa Expe': 'guild_expedition_def_boost_defender',

        'Ataque en Ataque IC': 'guild_raids_att_boost_attacker',
        'Defensa en Ataque IC': 'guild_raids_def_boost_attacker',
        'Ataque en Defensa IC': 'guild_raids_att_boost_defender',
        'Defensa en Defensa IC': 'guild_raids_def_boost_defender',

        // Inversos por si acaso vienen en inglés con guiones
        'all-att_boost_attacker': 'all_att_boost_attacker',
        'all-def_boost_attacker': 'all_def_boost_attacker',
        'all-att_boost_defender': 'all_att_boost_defender',
        'all-def_boost_defender': 'all_def_boost_defender',
    };

    // Procesar cada hoja
    for (const sheetName in sheets) {
        const sheetData = sheets[sheetName];
        if (!sheetData || sheetData.length === 0) continue;

        const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));
        const headers = sheetData[0];

        // Añadir headers con estilo
        const headerRow = worksheet.addRow(headers);

        // Configurar altura de la fila de header
        headerRow.height = 40;
        headerRow.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { bold: true };
        });

        // Añadir datos (desde la fila 2 en adelante)
        for (let i = 1; i < sheetData.length; i++) {
            worksheet.addRow(sheetData[i]);
        }

        // Añadir iconos en los headers
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const header = headers[colIdx];
            let iconKey = header;

            // 1. Intentar mapeo directo (para traducciones)
            if (translationMap[header]) {
                iconKey = translationMap[header];
            } else if (typeof header === 'string') {
                // 2. Normalizar guiones a underscores
                iconKey = header.replace(/-/g, '_');
            }

            if (typeof BOOST_ICONS !== 'undefined' && BOOST_ICONS[iconKey]) {
                try {
                    // Extraer base64 sin el prefijo data:image/png;base64,
                    const base64Data = BOOST_ICONS[iconKey].split(',')[1];

                    const imageIdNum = workbook.addImage({
                        base64: base64Data,
                        extension: 'png',
                    });

                    // Añadir imagen centrada en la celda
                    worksheet.addImage(imageIdNum, {
                        tl: { col: colIdx + 0.1, row: 0.1 },
                        ext: { width: 32, height: 32 },
                        editAs: 'oneCell'
                    });

                    // Limpiar el texto del header y ajustar ancho
                    worksheet.getCell(1, colIdx + 1).value = '';
                    worksheet.getColumn(colIdx + 1).width = 6;
                } catch (e) {
                    console.log('Error añadiendo icono:', iconKey, e);
                }
            }
        }

        // Ajustar ancho de columnas específicas
        const nombreIdx = headers.indexOf('Nombre');
        if (nombreIdx !== -1) {
            worksheet.getColumn(nombreIdx + 1).width = 40;
        }

        const eficienciaIdx = headers.indexOf('Eficiencia');
        if (eficienciaIdx !== -1) {
            worksheet.getColumn(eficienciaIdx + 1).width = 12;
        }
    }

    // Generar y descargar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, filename);

    let total = 0;
    for (const s in sheets) total += sheets[s].length - 1;
    return { sheetCount: Object.keys(sheets).length, totalRows: total };
}