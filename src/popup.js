/**
 * FoE Data Exporter - popup.js
 * Exporta datos de Forge of Empires a JSON y Excel
 */

import { analytics } from './analytics.js';
import { i18n, t } from './i18n.js';

const CLICK_THRESHOLD = 25;
let logoClicks = 0;

document.addEventListener('DOMContentLoaded', async function () {
    // Initialize i18n first
    await i18n.init();

    // Populate language selector
    populateLanguageSelector();

    // Display version
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = manifest.version;

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
                showToast(t('toast.godMode'), 'success');
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

    // Language selector
    document.getElementById('selectLanguage').addEventListener('change', async (e) => {
        await i18n.setLanguage(e.target.value);
    });

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

function populateLanguageSelector() {
    const select = document.getElementById('selectLanguage');
    if (!select) return;

    const languages = i18n.getAvailableLanguages();
    const currentLang = i18n.getCurrentLanguage();

    select.innerHTML = '';
    for (const lang of languages) {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        if (lang.code === currentLang) {
            option.selected = true;
        }
        select.appendChild(option);
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
                if (typeof FoEDataParser === 'undefined') return null;

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

                // Extraer recursos (FPs, Bienes)
                function extractResources(catalogEntry, eraName) {
                    const resources = { fps: 0, goods: 0 };
                    const components = catalogEntry.components || {};

                    // Helper interno para procesar un objeto de recursos
                    const processResources = (r) => {
                        if (!r) return;
                        if (r.strategy_points) resources.fps += r.strategy_points;
                        if (r.all_goods_of_age) resources.goods += r.all_goods_of_age;

                        for (const k in r) {
                            if (k !== 'strategy_points' && k !== 'all_goods_of_age' && k !== 'money' && k !== 'supplies' && k !== 'medals' && k !== 'premium') {
                                if (typeof r[k] === 'number') resources.goods += r[k];
                            }
                        }
                    };

                    // Helper interno
                    const checkOptions = (opts) => {
                        if (!opts || !Array.isArray(opts)) return;
                        // Priorizar producción de 24h (86400s) o usar la primera
                        const opt = opts.find(o => o.time === 86400) || opts[0];

                        // Caso 1: opt.product (objeto)
                        if (opt?.product?.resources) {
                            processResources(opt.product.resources);
                        }

                        // Caso 2: opt.products (array) - Común en MultiAge / Eventos recientes
                        if (opt?.products && Array.isArray(opt.products)) {
                            for (const p of opt.products) {
                                // Puede estar en p.resources o p.playerResources.resources
                                if (p.resources) processResources(p.resources);
                                if (p.playerResources?.resources) processResources(p.playerResources.resources);
                            }
                        }
                    };

                    // Buscar en Era específica, AllAge y Raíz
                    const paths = [components[eraName], components['AllAge'], components];
                    for (const p of paths) {
                        if (p?.production?.options) checkOptions(p.production.options);
                    }

                    return resources;
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
                    // Intento robusto de clonación
                    function robustClone(obj) {
                        try {
                            return JSON.parse(JSON.stringify(obj));
                        } catch (e) {
                            // Si falla por ciclo, fallback destructivo pero seguro
                            const cache = new Set();
                            return JSON.parse(JSON.stringify(obj, (key, value) => {
                                if (typeof value === 'object' && value !== null) {
                                    if (cache.has(value)) return;
                                    cache.add(value);
                                }
                                return value;
                            }));
                        }
                    }

                    try {
                        const rawData = {
                            MainParser: FoEDataParser,
                            buildingData: window.buildingData || null,
                            exportDate: new Date().toISOString()
                        };

                        const data = robustClone(rawData);
                        return { type: 'json', data: data, filename: `foe_data_${timestamp}.json` };
                    } catch (e) {
                        return { type: 'error', message: t('errors.exportJsonError', { message: e.message }) };
                    }
                }

                // ============================================
                // EXPORTAR EXCEL EFICIENCIA
                // ============================================

                if (exportType === 'efficiency') {
                    const buildingData = FoEDataParser.CityEntities;
                    const cityMapData = FoEDataParser.CityMapData;

                    if (!cityMapData || !buildingData) {
                        return { type: 'error', message: t('errors.dataNotFound') };
                    }

                    // console.log('CityMapData:', Object.keys(cityMapData).length, 'edificios');
                    // console.log('CityEntities:', Object.keys(buildingData).length, 'en catálogo');

                    const colNames = {
                        'name': 'Nombre', 'eraName': 'Era', 'count': 'Cantidad',
                        'name': 'Nombre', 'eraName': 'Era', 'count': 'Cantidad',
                        'size_total': 'Tamaño', 'needStreet': 'Calle',
                        'fps': 'FPS', 'goods': 'Bienes',
                        'eff_fps': 'Eficiencia FP', 'eff_goods': 'Eficiencia Bienes',
                        'eff_cdb': 'Eficiencia CdB', 'eff_ic': 'Eficiencia IC', 'eff_expe': 'Eficiencia Expe',
                        'eff_global_cdb': 'Eficiencia Global + CdB', 'eff_global_ic': 'Eficiencia Global + IC', 'eff_global_expe': 'Eficiencia Global + Expe',
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
                    // console.log('Era del ayuntamiento:', townHallEra);

                    // Procesar edificios
                    const buildings = [];
                    for (const id in cityMapData) {
                        const playerEntity = cityMapData[id];
                        const entityId = playerEntity.cityentity_id;
                        const catalogEntry = buildingData[entityId];
                        if (!catalogEntry) continue;

                        const { width, length } = extractSize(catalogEntry);
                        const boosts = extractBoosts(catalogEntry, playerEntity, townHallEra);
                        const resources = extractResources(catalogEntry, townHallEra);
                        const streetLevel = catalogEntry.requirements?.street_connection_level || catalogEntry.components?.AllAge?.streetConnectionRequirement?.requiredLevel || 0;

                        buildings.push({
                            name: catalogEntry.name || entityId,
                            eraName: townHallEra,
                            count: 1,
                            size_total: width * length,
                            streetLevel: streetLevel,
                            needStreet: needStreetAsText(streetLevel),
                            ...boosts,
                            ...resources
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

                    function calcEfficiency(val, size) {
                        const eff = size > 0 ? val / size : 0;
                        return parseFloat(eff.toFixed(2));
                    }

                    function sumBoosts(item, cols) {
                        let sum = 0;
                        for (const c of cols) sum += item[c] || 0;
                        return sum;
                    }

                    function createSheet(items, boostCols, mode = 'normal') {
                        // Filtrar items irrelevantes? No, mostrar todo lo que tenga valor
                        // Ojo: boostCols define qué columnas mostrar, pero la eficiencia puede ser compuesta

                        const processed = items.map(item => {
                            // Copia superficial
                            const newItem = { ...item };
                            const size = newItem.size_total + (newItem.streetLevel || 0);

                            // 1. Eficiencia Standard (basada en boostCols passados)
                            const boostSum = sumBoosts(newItem, boostCols);
                            newItem.Eficiencia = calcEfficiency(boostSum, size);

                            // 2. Eficiencias de Recursos
                            newItem.eff_fps = calcEfficiency(newItem.fps, size);
                            newItem.eff_goods = calcEfficiency(newItem.goods, size);

                            // 3. Eficiencias Modos Específicos (CdB, IC, Expe)
                            // Definimos grupos fijos para estas columnas extras
                            const cdbSum = sumBoosts(newItem, cdbCols);
                            const icSum = sumBoosts(newItem, icCols);
                            const expeSum = sumBoosts(newItem, expeCols);
                            const normalSum = sumBoosts(newItem, allBoostCols); // 'allBoostCols' son los base (A/D A/D)

                            newItem.eff_cdb = calcEfficiency(cdbSum, size);
                            newItem.eff_ic = calcEfficiency(icSum, size);
                            newItem.eff_expe = calcEfficiency(expeSum, size);

                            // 4. Eficiencias Combinadas (Global + Modo)
                            newItem.eff_global_cdb = calcEfficiency(normalSum + cdbSum, size);
                            newItem.eff_global_ic = calcEfficiency(normalSum + icSum, size);
                            newItem.eff_global_expe = calcEfficiency(normalSum + expeSum, size);

                            return newItem;
                        });

                        // Filtrar: si tiene boost, o FPs, o Goods
                        const filtered = processed.filter(item => {
                            const hasBoost = boostCols.some(c => (item[c] || 0) !== 0);
                            const hasRes = item.fps > 0 || item.goods > 0;
                            return hasBoost || hasRes;
                        });

                        filtered.sort((a, b) => b.Eficiencia - a.Eficiencia);

                        // Nuevas columnas fijas a la izquierda
                        const fixedColsLeft = ['name', 'eraName', 'count', 'size_total', 'needStreet', 'fps', 'goods'];
                        // Nuevas columnas de eficiencia a la derecha (opcional, o junto a la eficiencia ppal)
                        const effCols = ['Eficiencia', 'eff_cdb', 'eff_ic', 'eff_expe', 'eff_global_cdb', 'eff_global_ic', 'eff_global_expe', 'eff_fps', 'eff_goods'];

                        const outCols = [...fixedColsLeft, ...boostCols, ...effCols];
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
                    const catalog = FoEDataParser.CityEntities;

                    if (!catalog) {
                        return { type: 'error', message: t('errors.cityEntitiesNotFound') };
                    }

                    // console.log('CityEntities para catálogo:', Object.keys(catalog).length, 'edificios');

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

                    // Grupos de columnas para cálculos
                    const colsNormal = ['all_att_boost_attacker', 'all_att_boost_defender', 'all_def_boost_attacker', 'all_def_boost_defender'];
                    const colsCdB = ['battleground_att_boost_attacker', 'battleground_att_boost_defender', 'battleground_def_boost_attacker', 'battleground_def_boost_defender'];
                    const colsExpe = ['guild_expedition_att_boost_attacker', 'guild_expedition_att_boost_defender', 'guild_expedition_def_boost_attacker', 'guild_expedition_def_boost_defender'];
                    const colsIC = ['guild_raids_att_boost_attacker', 'guild_raids_att_boost_defender', 'guild_raids_def_boost_attacker', 'guild_raids_def_boost_defender'];

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
                            const streetLevel = entry.requirements?.street_connection_level || entry.components?.AllAge?.streetConnectionRequirement?.requiredLevel || 0;
                            const rawBoosts = getCatalogBoosts(entry, era);
                            const resources = extractResources(entry, era);

                            // Filtrar y procesar boosts
                            const boosts = {};
                            let hasRelevantBoost = false;

                            // Acumuladores
                            let sumNormal = 0;
                            let sumCdB = 0;
                            let sumExpe = 0;
                            let sumIC = 0;
                            let sumTotal = 0;

                            for (const key in rawBoosts) {
                                if (allowedBoostsSet.has(key)) {
                                    boosts[key] = rawBoosts[key];
                                    hasRelevantBoost = true;

                                    const val = rawBoosts[key];
                                    if (colsNormal.includes(key)) sumNormal += val;
                                    if (colsCdB.includes(key)) sumCdB += val;
                                    if (colsExpe.includes(key)) sumExpe += val;
                                    if (colsIC.includes(key)) sumIC += val;
                                    if (efficiencyBoostsSet.has(key)) sumTotal += val;
                                }
                            }

                            // Verificar si tiene recursos relevantes
                            if (resources.fps > 0 || resources.goods > 0) hasRelevantBoost = true;

                            // Solo incluir edificios que tengan algún boost RELEVANTE
                            if (!hasRelevantBoost) continue;

                            // Registrar columnas de boost presentes
                            for (const k in boosts) allBoostCols.add(k);

                            // Calcular eficiencias
                            // Ajuste de tamaño
                            const adjustedSize = (width * length) + streetLevel;

                            const calcEff = (val) => adjustedSize > 0 ? parseFloat((val / adjustedSize).toFixed(2)) : 0;

                            const efficiency = calcEff(sumTotal); // Eficiencia "Clásica" (Suma de todo lo militar)

                            // Eficiencias por Recurso
                            const eff_fps = calcEff(resources.fps);
                            const eff_goods = calcEff(resources.goods);

                            // Eficiencias por Modo
                            const eff_cdb = calcEff(sumCdB);
                            const eff_ic = calcEff(sumIC);
                            const eff_expe = calcEff(sumExpe);

                            // Eficiencias Combinadas (Normal + Modo)
                            const eff_global_cdb = calcEff(sumNormal + sumCdB);
                            const eff_global_ic = calcEff(sumNormal + sumIC);
                            const eff_global_expe = calcEff(sumNormal + sumExpe);

                            rows.push({
                                Nombre: entry.name || entityId,
                                Eficiencia: efficiency,
                                Ancho: width,
                                Largo: length,
                                Tamaño: width * length,
                                Calle: streetLevel,
                                FPS: resources.fps,
                                Bienes: resources.goods,
                                'Eficiencia FP': eff_fps,
                                'Eficiencia Bienes': eff_goods,
                                'Eficiencia CdB': eff_cdb,
                                'Eficiencia IC': eff_ic,
                                'Eficiencia Expe': eff_expe,
                                'Global + CdB': eff_global_cdb,
                                'Global + IC': eff_global_ic,
                                'Global + Expe': eff_global_expe,
                                ...boosts
                            });
                        }

                        if (rows.length === 0) continue;

                        // Ordenar por eficiencia descendente
                        rows.sort((a, b) => b.Eficiencia - a.Eficiencia);

                        // Ordenar columnas según preferencia
                        const currentEraBoostCols = allExportCols.filter(c => allBoostCols.has(c));

                        const newCols = ['FPS', 'Bienes', 'Eficiencia CdB', 'Eficiencia IC', 'Eficiencia Expe', 'Global + CdB', 'Global + IC', 'Global + Expe', 'Eficiencia FP', 'Eficiencia Bienes'];

                        const finalCols = ['Nombre', 'Eficiencia', ...newCols, ...currentEraBoostCols, 'Ancho', 'Largo', 'Tamaño', 'Calle'];

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
            showToast(t('toast.noData'), 'error');
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
            showToast(t('toast.jsonExported', { count }), 'success');
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
                showToast(t('toast.excelGenerated', { count: stats.totalRows }), 'success');
            } catch (e) {
                console.error('Error generando Excel:', e);
                showToast(t('toast.error', { message: 'Excel' }), 'error');
            }
            return;
        }

        if (result.type === 'catalog') {
            // Generar Catálogo con ExcelJS (con iconos)
            try {
                const stats = await generateExcelWithIcons(result.sheets, result.filename);
                showToast(t('toast.catalogGenerated', { count: stats.totalRows }), 'success');
            } catch (e) {
                console.error('Error generando Catálogo:', e);
                showToast(t('toast.error', { message: 'Catálogo' }), 'error');
            }
            return;
        }
    } catch (e) {
        showToast(t('toast.error', { message: e.message }), 'error');
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
            showToast(t('toast.downloadError', { message: chrome.runtime.lastError.message }), 'error');
        } else {
            // Optional: Show success if "Save As" wasn't used
            if (!saveAs) showToast(t('toast.fileSaved'), 'success');
        }
    });
}

// Función para generar Excel con iconos usando ExcelJS
// Función para generar Excel con iconos usando ExcelJS
async function generateExcelWithIcons(sheets, filename) {
    console.log('Iniciando generateExcelWithIcons...');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'onosenday';
    workbook.lastModifiedBy = 'onosenday';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Cache de imagenes añadidas al workbook para evitar duplicados
    // Key: iconKey, Value: imageId
    const imageCache = new Map();

    // Mapa de traducción inversa: Nombre Traducido -> Clave de Icono (original)
    const translationMap = {
        // Recursos Básicos
        'Calle': 'street',
        'FPS': 'forge_points',
        'Bienes': 'goods',

        // Eficiencias Generales
        'Eficiencia': 'efficiency',
        'Eficiencia FP': 'efficiency_fp',
        'Eficiencia Bienes': 'efficiency_goods',

        // Eficiencias Específicas
        'Eficiencia CdB': 'efficiency_gbg',
        'Eficiencia Expe': 'efficiency_ge',
        'Eficiencia IC': 'efficiency_qi',

        // Eficiencias Globales
        'Eficiencia Global + CdB': 'efficiency_global_gbg',
        'Eficiencia Global + Expe': 'efficiency_global_ge',
        'Eficiencia Global + IC': 'efficiency_global_qi',

        // Boosts
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
        console.log(`Procesando hoja: ${sheetName}`);
        const sheetData = sheets[sheetName];
        if (!sheetData || sheetData.length === 0) continue;

        const worksheet = workbook.addWorksheet(sheetName.substring(0, 31));
        const headers = sheetData[0];

        // Añadir headers con estilo
        const headerRow = worksheet.addRow(headers);

        // Activar AutoFilter
        const lastColLetter = worksheet.getColumn(headers.length).letter;
        worksheet.autoFilter = `A1:${lastColLetter}1`;

        // Fijar primera fila y primera columna
        worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

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

            // Usar window.BOOST_ICONS explícitamente porque estamos en un módulo
            if (typeof window.BOOST_ICONS !== 'undefined' && window.BOOST_ICONS[iconKey]) {
                try {
                    let imageIdNum;

                    // Optimización: Reusar imagen si ya fue añadida al workbook
                    if (imageCache.has(iconKey)) {
                        imageIdNum = imageCache.get(iconKey);
                    } else {
                        // Extraer base64 sin el prefijo data:image/png;base64,
                        const parts = window.BOOST_ICONS[iconKey].split(',');
                        let base64Data = parts.length > 1 ? parts[1] : parts[0];

                        // Sanitize: remove whitespace/newlines just in case
                        base64Data = base64Data.trim();

                        imageIdNum = workbook.addImage({
                            base64: base64Data,
                            extension: 'png',
                        });
                        imageCache.set(iconKey, imageIdNum);
                    }

                    // Añadir imagen centrada en la celda
                    worksheet.addImage(imageIdNum, {
                        tl: { col: colIdx + 0.15, row: 0.15 }, // Ajuste fino para centrar mejor
                        ext: { width: 28, height: 28 },         // Tamaño ligeramente menor para margen
                        editAs: 'oneCell'
                    });

                    // Limpiar el texto del header pero añadir NOTA (Tooltip)
                    // Excel no permite tooltips nativos en imagenes sin que sean links (que añaden texto de ayuda no deseado)
                    // Usamos Cell Note (comentario) como fallback standard.
                    const cell = worksheet.getCell(1, colIdx + 1);
                    cell.value = '';
                    cell.note = header; // Tooltip con el nombre original de la columna

                    // Ajustar ancho de columna para acomodar el icono
                    worksheet.getColumn(colIdx + 1).width = 6;
                } catch (e) {
                    console.error('Error añadiendo icono:', iconKey, e);
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

    console.log('Generando buffer Excel...');
    try {
        // Generar y descargar
        const buffer = await workbook.xlsx.writeBuffer();
        console.log('Buffer generado. Iniciando descarga...');
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(blob, filename);
        console.log('Descarga iniciada.');
    } catch (err) {
        console.error('Error fatal escribiendo buffer o descargando:', err);
        throw err; // Re-throw para que el caller capture y quite el loading
    }

    let total = 0;
    for (const s in sheets) total += sheets[s].length - 1;
    return { sheetCount: Object.keys(sheets).length, totalRows: total };
}