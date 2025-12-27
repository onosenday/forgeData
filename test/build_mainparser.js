/*
 * Standalone FoE Proxy & MainParser Re-implementation
 * Based on FoE Helper Extension
 */

if (typeof globalThis.FoEproxy == 'undefined') {
    globalThis.FoEproxy = (function () {
        const requestInfoHolder = new WeakMap();
        function getRequestData(xhr) {
            let data = requestInfoHolder.get(xhr);
            if (data != null) return data;

            data = { url: null, method: null, postData: null };
            requestInfoHolder.set(xhr, data);
            return data;
        }

        let proxyEnabled = true;
        let xhrQueue = [];

        // ###########################################
        // ################# XHR-Proxy ###############
        // ###########################################

        const XHR = XMLHttpRequest.prototype,
            open = XHR.open,
            send = XHR.send;

        XHR.open = function (method, url) {
            if (proxyEnabled) {
                const data = getRequestData(this);
                data.method = method;
                data.url = url;
            }
            return open.apply(this, arguments);
        };

        function xhrOnLoadHandler() {
            if (!proxyEnabled) return;
            if (xhrQueue) {
                xhrQueue.push(this);
                return;
            }
            xhrOnLoadHandlerExec.call(this);
        }

        function xhrOnLoadHandlerExec() {
            const requestData = getRequestData(this);
            const url = requestData.url;
            const postData = requestData.postData;

            // handle raw request handlers
            for (let callback of FoEproxy._getProxyRaw()) {
                try {
                    callback(this, requestData);
                } catch (e) {
                    console.error(e);
                }
            }

            // handle metadata request handlers
            const metadataIndex = url.indexOf("metadata?id=");

            if (metadataIndex > -1) {
                const metaURLend = metadataIndex + "metadata?id=".length,
                    metaArray = url.substring(metaURLend).split('-', 2),
                    meta = metaArray[0];

                if (MainParser.MetaIds) MainParser.MetaIds[meta] = metaArray[1];

                const metaHandler = FoEproxy._getMetaMap()[meta];

                if (metaHandler) {
                    for (let callback of metaHandler) {
                        try {
                            callback(this, postData);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            }

            // JSON data interception
            if (url.indexOf("game/json?h=") > -1) {
                try {
                    let d = JSON.parse(this.responseText);
                    let requestData = postData;

                    try {
                        requestData = JSON.parse(new TextDecoder().decode(postData));

                        const handleEntry = (entry) => {
                            FoEproxy._addToHistory(entry.requestClass + '.' + entry.requestMethod);
                            FoEproxy._proxyAction(entry.requestClass, entry.requestMethod, entry, requestData);
                        };

                        // StartUp Service first
                        for (let entry of d) {
                            if (entry['requestClass'] === 'StaticDataService' && entry['requestMethod'] === 'getMetadata') {
                                handleEntry(entry);
                            }
                        }
                        for (let entry of d) {
                            if (entry['requestClass'] === 'StartupService' && entry['requestMethod'] === 'getData') {
                                handleEntry(entry);
                            }
                        }
                        // Rest
                        for (let entry of d) {
                            if (!(entry['requestClass'] === 'StartupService' && entry['requestMethod'] === 'getData') &&
                                !(entry['requestClass'] === 'StaticDataService' && entry['requestMethod'] === 'getMetadata')) {
                                handleEntry(entry);
                            }
                        }

                    } catch (e) {
                        console.log('Can\'t parse postData: ', postData, e);
                    }
                } catch (e) {
                    // Response text parsing error
                }
            }
        }

        function xhrOnSend(data) {
            if (!proxyEnabled || !data) return;
            try {
                let posts = [];
                if (typeof data === 'object' && (data instanceof ArrayBuffer || data instanceof Uint8Array)) {
                    // Check for gzip signature (31, 139, 8)
                    let bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                    if (bytes[0] === 31 && bytes[1] === 139 && bytes[2] === 8) {
                        return; // gzipped
                    }
                    posts = JSON.parse(new TextDecoder().decode(data));
                } else {
                    posts = JSON.parse(data);
                }

                if (posts instanceof Array) {
                    for (let post of posts) {
                        if (post && post.requestClass && post.requestMethod) {
                            FoEproxy._proxyRequestAction(post.requestClass, post.requestMethod, post);
                        }
                    }
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }

        XHR.send = function (postData) {
            if (proxyEnabled) {
                const data = getRequestData(this);
                data.postData = postData;
                xhrOnSend(postData);
                this.addEventListener('load', xhrOnLoadHandler, { capture: false, passive: true });
            }
            return send.apply(this, arguments);
        };

        return {
            _setXhrQueue: (queue) => { xhrQueue = queue; },
            _getXhrQueue: () => xhrQueue,
            _setProxyEnabled: (enabled) => { proxyEnabled = enabled; },
            _getProxyEnabled: () => proxyEnabled,
            _xhrOnLoadHandlerExec: xhrOnLoadHandlerExec
        };
    })();

    // Extended FoEproxy API
    Object.assign(globalThis.FoEproxy, (function () {
        const proxyMap = {};
        const proxyRequestsMap = {};
        const proxyMetaMap = {};
        let proxyRaw = [];
        let JSONhistory = [];

        function _proxyAction(service, method, data, postData) {
            const map = proxyMap[service];
            if (!map) return;
            const list = map[method];
            if (!list) return;
            for (let callback of list) {
                try { callback(data, postData); } catch (e) { console.error(e); }
            }
        }

        function proxyAction(service, method, data, postData) {
            let filteredPostData = postData && Array.isArray(postData) ? postData.filter(r => r && r.requestId && data && data.requestId && r.requestId === data.requestId) : postData;
            _proxyAction(service, method, data, filteredPostData);
            _proxyAction('all', method, data, filteredPostData);
            _proxyAction(service, 'all', data, filteredPostData);
            _proxyAction('all', 'all', data, filteredPostData);
        }

        function _proxyRequestAction(service, method, postData) {
            const map = proxyRequestsMap[service];
            if (!map) return;
            const list = map[method];
            if (!list) return;
            for (let callback of list) {
                try { callback(postData); } catch (e) { console.error(e); }
            }
        }

        function proxyRequestAction(service, method, postData) {
            _proxyRequestAction(service, method, postData);
            _proxyRequestAction('all', method, postData);
            _proxyRequestAction(service, 'all', postData);
            _proxyRequestAction('all', 'all', postData);
        }

        return {
            addHandler: function (service, method, callback) {
                if (method === undefined) { callback = service; service = method = 'all'; }
                else if (callback === undefined) { callback = method; method = 'all'; }

                if (!proxyMap[service]) proxyMap[service] = {};
                if (!proxyMap[service][method]) proxyMap[service][method] = [];
                proxyMap[service][method].push(callback);
            },
            addMetaHandler: function (meta, callback) {
                if (!proxyMetaMap[meta]) proxyMetaMap[meta] = [];
                proxyMetaMap[meta].push(callback);
            },
            addRequestHandler: function (service, method, callback) {
                if (method === undefined) { callback = service; service = method = 'all'; }
                else if (callback === undefined) { callback = method; method = 'all'; }

                if (!proxyRequestsMap[service]) proxyRequestsMap[service] = {};
                if (!proxyRequestsMap[service][method]) proxyRequestsMap[service][method] = [];
                proxyRequestsMap[service][method].push(callback);
            },
            // Internal methods needed by XHR logic
            _getProxyMap: () => proxyMap,
            _getMetaMap: () => proxyMetaMap,
            _getProxyRaw: () => proxyRaw,
            _getProxyRequestsMap: () => proxyRequestsMap,
            _proxyAction: proxyAction,
            _proxyRequestAction: proxyRequestAction,
            _addToHistory: (entry) => { JSONhistory.push(entry); }
        };
    })());
}

// ==========================================
// MAIN PARSER RECONSTRUCTION
// ==========================================

window.MainParser = {
    CityMapData: {},
    CityEntities: {},
    BuildingUpgrades: {},
    BuildingSets: {},
    BuildingChains: {},
    BonusService: null,
    MetaIds: {},
    ArkBonus: 0,

    // Minimal reset logic
    reset: function () {
        this.CityMapData = {};
        this.CityEntities = {};
    },

    // Setters helper to avoid undefined errors if called before init
    SetArkBonus: function (responseData) {
        // Implementation from original
        if (responseData) {
            // Logic to find Ark bonus ... simplified for now
            // Original iterates over limited bonuses
        }
    },

    SetArkBonus2: function () {
        // Logic to calculate ark bonus from CityMap
    }
};

// ==========================================
// REGISTER HANDLERS
// ==========================================

// 1. Startup Data
FoEproxy.addHandler('StartupService', 'getData', (data, postData) => {
    console.log("FoE Standalone: StartupService captured!", data);

    // CityMap
    if (data.responseData.city_map && data.responseData.city_map.entities) {
        window.MainParser.CityMapData = Object.assign({}, ...data.responseData.city_map.entities.map((x) => ({ [x.id]: x })));
        console.log("FoE Standalone: CityMapData populated with " + Object.keys(window.MainParser.CityMapData).length + " entities.");
    }

    // User Data (Arc Bonus check often happens here or in BonusService)
});

// 2. City Entities (Metadata)
FoEproxy.addMetaHandler('city_entities', (xhr, postData) => {
    let EntityArray = JSON.parse(xhr.responseText);
    window.MainParser.CityEntities = Object.assign({}, ...EntityArray.map((x) => ({ [x.id]: x })));
    console.log("FoE Standalone: CityEntities populated with " + Object.keys(window.MainParser.CityEntities).length + " definitions.");
});

// 3. City Map Service (Updates)
FoEproxy.addHandler('CityMapService', 'getEntities', (data, postData) => {
    window.MainParser.CityMapData = Object.assign({}, ...data.responseData.map((x) => ({ [x.id]: x })));
    console.log("FoE Standalone: CityMapData updated.");
});

console.log("FoEproxy and MainParser initialized (Test Mode)");
