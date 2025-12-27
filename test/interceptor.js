/*
 * FoE Interceptor & Parser
 * Injected into MAIN world. Stores data in window.FoEInterceptedData.
 */
console.log("[FoE-Data] Parser v3.1 injected. Type 'FoEInterceptedData.getOverview()' to see status.");

(function () {
    'use strict';

    // Global storage available in Console
    window.FoEInterceptedData = {
        user: null,
        city: [],
        unlocked_areas: [],
        building_metadata: JSON.parse(localStorage.getItem('FoE_BuildingMetadata') || '{}'), // Load from storage
        incidents: [],

        // Helper to see what we have
        getOverview: function () {
            console.group("🏰 FoE Data Overview");
            if (this.user) {
                console.log(`👤 Player: ${this.user.user_name} (${this.user.player_id})`);
                console.log(`🏙️ City: ${this.user.city_name} | Era: ${this.user.era}`);
            } else {
                console.warn("⚠️ No user data captured yet. Reload the game.");
            }

            if (this.city.length > 0) {
                console.log(`🏠 Buildings: ${this.city.length}`);
                console.log(`🗺️ Unlocked Areas: ${this.unlocked_areas.length}`);
                console.log(`📚 Metadata Definitions: ${Object.keys(this.building_metadata).length}`);

                // Count generic types
                const types = {};
                this.city.forEach(b => {
                    types[b.type] = (types[b.type] || 0) + 1;
                });
                console.table(types);

                // List Great Buildings
                const gbs = this.city.filter(b => b.type === 'greatbuilding').map(b => ({
                    ID: b.cityentity_id,
                    Level: b.level || '?',
                    Cmd: `Find at x:${b.x}, y:${b.y}`
                }));
                if (gbs.length > 0) {
                    console.log("🏛️ Great Buildings found:", gbs.length);
                    console.table(gbs);
                }

            } else {
                console.warn("⚠️ No city map data captured yet.");
            }
            console.groupEnd();
        },

        // Download full raw data
        downloadJSON: function () {
            if (!this.user && this.city.length === 0) {
                console.error("❌ No data to download yet. Wait for the game to load.");
                alert("No data captured yet! Please reload the game first.");
                return;
            }
            this._saveFile(this, `foe_data_${new Date().toISOString().slice(0, 10)}.json`);
        },

        // Download tailored map data for visualization
        downloadCityMap: function () {
            if (this.city.length === 0) {
                console.error("❌ No city data to download.");
                alert("No city data! Reload game.");
                return;
            }

            const mapExport = {
                info: {
                    player: this.user ? this.user.user_name : "Unknown",
                    city: this.user ? this.user.city_name : "Unknown",
                    era: this.user ? this.user.era : "Unknown",
                    export_date: new Date().toISOString()
                },
                grid: {
                    unlocked_areas: this.unlocked_areas
                },
                // The definitions are crucial for rendering (size, assets, names)
                definitions: this.building_metadata,
                // The instances on the map
                buildings: this.city.map(e => ({
                    id: e.id,
                    cityentity_id: e.cityentity_id,
                    type: e.type,
                    x: e.x,
                    y: e.y,
                    orientation: e.orientation,
                    level: e.level
                }))
            };

            console.log("🗺️ Exporting City Map configuration with definitions...");
            this._saveFile(mapExport, `city_map_export_${new Date().toISOString().slice(0, 10)}.json`);
        },

        // Internal helper to save file
        _saveFile: function (data, filename) {
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`⬇️ Downloaded ${filename}`);
        }
    };

    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;

    XHR.open = function (method, url) {
        this._url = url;
        return open.apply(this, arguments);
    };

    XHR.send = function (postData) {
        this.addEventListener('load', function () {
            if (this._url && this._url.includes('/game/json?h=')) {
                try {
                    const data = JSON.parse(this.responseText);

                    if (Array.isArray(data)) {
                        data.forEach(item => processService(item));
                    } else {
                        processService(data);
                    }

                } catch (e) {
                    console.error("[FoE-Data] JSON Parse Error:", e);
                }
            }
        });

        return send.apply(this, arguments);
    };

    function processService(data) {
        if (!data.requestClass) return;
        const method = `${data.requestClass}.${data.requestMethod}`;
        const response = data.responseData;

        // Captura genérica de definiciones de edificios (city_entities)
        // Pueden venir en StartupService, StaticDataService, o updates
        if (response && response.city_entities) {
            console.log(`✅ [FoE-Data] definitions found in ${method}`);
            const entities = response.city_entities;
            const target = window.FoEInterceptedData.building_metadata;

            if (Array.isArray(entities)) {
                entities.forEach(def => {
                    // El ID suele ser 'id' o 'asset_id'
                    const key = def.id || def.asset_id;
                    if (key) target[key] = def;
                });
            } else if (typeof entities === 'object') {
                Object.assign(target, entities);
            }

            // PERSISTENCE: Save to LocalStorage
            try {
                localStorage.setItem('FoE_BuildingMetadata', JSON.stringify(target));
                console.log("💾 [FoE-Data] Metadata saved to LocalStorage");
            } catch (e) {
                console.warn("⚠️ [FoE-Data] Failed to save metadata to LocalStorage (quota exceeded?)", e);
            }

            console.log(`📚 Metadata count: ${Object.keys(target).length}`);
        }

        switch (method) {
            case 'StartupService.getData':
                console.log("✅ [FoE-Data] Startup Data Captured");
                console.log("🔍 [DEBUG] Response Keys:", Object.keys(response)); // Injecting debug
                if (response.city_entities) console.log("🔍 [DEBUG] city_entities type:", typeof response.city_entities);

                window.FoEInterceptedData.user = response.user_data;
                if (response.city_map) {
                    window.FoEInterceptedData.city = response.city_map.entities || [];
                    window.FoEInterceptedData.unlocked_areas = response.city_map.unlocked_areas || [];
                }
                break;

            case 'CityMapService.getCityMap':
            case 'CityMapService.updateEntity': // A veces llegan updates parciales
                console.log(`✅ [FoE-Data] Map Update via ${method}`);
                if (response.entities) {
                    // Si es update completo reemplazamos, si no deberíamos hacer merge (pendiente)
                    // Por ahora asumimos que getCityMap trae todo, updateEntity trae cambios
                    if (method === 'CityMapService.getCityMap') {
                        window.FoEInterceptedData.city = response.entities;
                    }
                }
                if (response.unlocked_areas) {
                    window.FoEInterceptedData.unlocked_areas = response.unlocked_areas;
                }
                break;

            case 'HiddenRewardService.getOverview':
                window.FoEInterceptedData.incidents = response.hiddenRewards || [];
                break;
        }
    }

})();
