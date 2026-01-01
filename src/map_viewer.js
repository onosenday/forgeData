/**
 * Map Viewer for ForgeData
 */

import { i18n, t } from './i18n.js';

const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

let cityData = null;
let scale = 20; // Pixels per grid unit
let offsetX = 50;
let offsetY = 50;
let isDragging = false;
let startX, startY;

// Grid size usually around 60-70? Max expansion is huge.
const MAX_GRID_SIZE = 120; // safe margin

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n
    await i18n.init();

    initCanvas();
    await loadData();
});

function initCanvas() {
    canvas.width = 2000;
    canvas.height = 2000;

    container.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX - container.scrollLeft;
        startY = e.clientY - container.scrollTop;
        container.style.cursor = 'grabbing';
    });

    container.addEventListener('mousemove', e => {
        if (!isDragging) {
            // Update coords display
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / scale);
            const y = Math.floor((e.clientY - rect.top) / scale);
            document.getElementById('coords').textContent = `${x}, ${y}`;
            return;
        }
        e.preventDefault();
        const x = e.clientX - startX;
        const y = e.clientY - startY;
        container.scrollLeft = -x;
        container.scrollTop = -y;
    });

    container.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mouseleave', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    document.getElementById('btnZoomIn').addEventListener('click', () => { scale = Math.min(scale * 1.2, 50); draw(); });
    document.getElementById('btnZoomOut').addEventListener('click', () => { scale = Math.max(scale / 1.2, 5); draw(); });
    document.getElementById('btnCenter').addEventListener('click', centerMap);
}

async function loadData() {
    try {
        const tabs = await chrome.tabs.query({ url: "*://*.forgeofempires.com/game/*" });
        if (tabs.length === 0) {
            throw new Error(t('mapViewer.noTab'));
        }

        const tab = tabs[0];

        // Execute script to get data
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, world: 'MAIN' },
            func: () => {
                if (typeof FoEInterceptedData === 'undefined') return null;
                // serialize to pass back
                return {
                    city: window.FoEInterceptedData.city,
                    unlocked_areas: window.FoEInterceptedData.unlocked_areas,
                    definitions: window.FoEInterceptedData.building_metadata
                };
            }
        });

        const result = results[0].result;
        if (!result) {
            throw new Error(t('mapViewer.noData'));
        }

        cityData = result;
        document.getElementById('loading').style.display = 'none';
        processData();
        draw();
        centerMap();

    } catch (e) {
        document.getElementById('loading-text').textContent = t('toast.error', { message: e.message });
        console.error(e);
    }
}

function processData() {
    if (!cityData) return;
    document.getElementById('stat-buildings').textContent = cityData.city.length;
    document.getElementById('stat-expansion').textContent = cityData.unlocked_areas.length;
}

function centerMap() {
    // simple center
    container.scrollLeft = (canvas.width - container.clientWidth) / 2;
    container.scrollTop = (canvas.height - container.clientHeight) / 2;
}

function draw() {
    if (!cityData) return;

    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Unlocked Areas (Grid)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Draw unlocked areas
    ctx.fillStyle = '#2a3a2a'; // dark green background for unlocked
    cityData.unlocked_areas.forEach(area => {
        const x = area.x || 0;
        const y = area.y || 0;
        const w = area.width;
        const h = area.length;
        ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
        ctx.strokeRect(x * scale, y * scale, w * scale, h * scale);
    });

    // Draw Buildings
    cityData.city.forEach(b => {
        const def = cityData.definitions[b.cityentity_id] || {};
        const name = def.name || b.cityentity_id;

        /* Size logic from popup.js simplified */
        let width = 1, length = 1;

        // Try to get size from entity first
        if (b.width && b.length) {
            width = b.width;
            length = b.length;
        } else if (def.components) {
            // Simplified component lookup (checking first valid placement)
            for (const key in def.components) {
                const comp = def.components[key];
                if (comp.placement && comp.placement.size) {
                    width = comp.placement.size.x;
                    length = comp.placement.size.y;
                    break;
                }
            }
        } else if (def.width && def.length) {
            width = def.width;
            length = def.length;
        }

        // Adjust for rotation? Not strictly needed for FoE grid usually, but x/y are usually top-left

        const px = b.x * scale;
        const py = b.y * scale;
        const pw = width * scale;
        const ph = length * scale;

        // Color by type
        ctx.fillStyle = getColorByType(b.type);
        ctx.fillRect(px, py, pw, ph);

        // Border
        ctx.strokeStyle = '#000';
        ctx.strokeRect(px, py, pw, ph);

        // Text
        if (scale > 15) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText(name.substring(0, 10), px + 2, py + 12);
        }
    });
}

function getColorByType(type) {
    switch (type) {
        case 'street': return '#555';
        case 'residential': return '#4caf50';
        case 'production': return '#ff9800';
        case 'goods': return '#e91e63';
        case 'military': return '#f44336';
        case 'main_building': return '#3f51b5'; // Town Hall
        case 'greatbuilding': return '#9c27b0';
        case 'decoration': return '#00bcd4';
        default: return '#795548';
    }
}
