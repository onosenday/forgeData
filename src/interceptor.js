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
        let xhrQueue = null; // Fix: Initialize to null so requests process immediately

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

            // User requested filter: Ignore asset URLs
            if (this.responseURL && this.responseURL.includes("/assets")) {
                return;
            }

            console.log("FoE Interceptor: XHR Load", this.responseURL || "unknown URL");
            if (xhrQueue) {
                xhrQueue.push(this);
                return;
            }
            xhrOnLoadHandlerExec.call(this);
        }

        function xhrOnLoadHandlerExec() {
            const requestData = getRequestData(this);
            const url = requestData.url || this.responseURL;
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
            // handle metadata request handlers
            const metadataIndex = url.indexOf("metadata?id=");

            if (metadataIndex > -1) {
                const metaURLend = metadataIndex + "metadata?id=".length,
                    metaArray = url.substring(metaURLend).split('-', 2),
                    meta = metaArray[0];

                // console.log(`FoE Interceptor: Metadata detected. Type: '${meta}'`);

                if (window.MainParser && window.MainParser.MetaIds) {
                    window.MainParser.MetaIds[meta] = metaArray[1];
                } else {
                    // console.error("FoE Interceptor: MainParser or MetaIds missing!");
                }

                const metaHandler = FoEproxy._getMetaMap()[meta];

                if (metaHandler) {
                    // console.log(`FoE Interceptor: Handler found for '${meta}'. executing...`);
                    for (let callback of metaHandler) {
                        try {
                            callback(this, postData);
                        } catch (e) {
                            console.error("FoE Interceptor: Error in meta handler:", e);
                        }
                    }
                } else {
                    // console.log(`FoE Interceptor: No handler found for '${meta}'`);
                }
            }

            // JSON data interception
            // if (url && (url.includes('json') || url.includes('game/json'))) {
            //     console.log("FoE Interceptor: SAW JSON URL:", url);
            // }

            // Relaxed check to debug
            if (url && (url.indexOf("game/json") > -1)) {
                // console.log("FoE Interceptor: MATCHED game/json", url);
                try {
                    let d = JSON.parse(this.responseText);
                    let requestData = postData;

                    try {
                        requestData = JSON.parse(new TextDecoder().decode(postData));

                        const handleEntry = (entry) => {
                            FoEproxy._addToHistory(entry.requestClass + '.' + entry.requestMethod);
                            FoEproxy._proxyAction(entry.requestClass, entry.requestMethod, entry, requestData);
                        };

                        // Debug log for checking parsed entries
                        // if (Array.isArray(d)) {
                        //     console.log(`FoE Interceptor: Parsed JSON array with ${d.length} entries. First: ${d[0]?.requestClass}.${d[0]?.requestMethod}`);
                        // }

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
                        // console.log('Can\'t parse postData: ', postData, e);
                    }
                } catch (e) {
                    // Response text parsing error
                    console.error("FoE Interceptor: Error parsing responseText for game/json", e);
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

        // WebSocket vars
        // Use getter for proxyEnabled since we can't access let variable from previous closure directly
        // But we can use FoEproxy._getProxyEnabled() if available, or just maintain a local sync.
        // Actually, foeproxy.js uses a shared `proxyEnabled` because it's in the SAME closure scope.
        // Here we have TWO closures.
        // We need to fetch enabled state dynamically.

        const oldWSSend = WebSocket.prototype.send;
        const observedWebsockets = new WeakSet();
        const wsHandlerMap = {};
        let wsRawHandler = [];
        let wsQueue = [];

        function _proxyWsAction(service, method, data) {
            const map = wsHandlerMap[service];
            if (!map) return;
            const list = map[method];
            if (!list) return;
            for (let callback of list) {
                try { callback(data); } catch (e) { console.error(e); }
            }
        }

        function proxyWsAction(service, method, data) {
            _proxyWsAction(service, method, data);
            _proxyWsAction('all', method, data);
            _proxyWsAction(service, 'all', data);
            _proxyWsAction('all', 'all', data);
        }

        function wsMessageHandler(evt) {
            if (wsQueue) {
                wsQueue.push(evt);
                return;
            }
            wsMessageHandlerExec(evt);
        }

        function wsMessageHandlerExec(evt) {
            try {
                if (evt.data === 'PONG') return;
                const data = JSON.parse(evt.data);

                // Raw handlers
                for (let callback of wsRawHandler) {
                    try { callback(data); } catch (e) { console.error(e); }
                }

                if (data instanceof Array) {
                    for (let entry of data) {
                        proxyWsAction(entry.requestClass, entry.requestMethod, entry);
                    }
                } else if (data.__class__ === "ServerResponse") {
                    proxyWsAction(data.requestClass, data.requestMethod, data);
                }
            } catch (e) {
                // Not JSON or other error
            }
        }

        WebSocket.prototype.send = function (data) {
            oldWSSend.call(this, data);
            // Check proxy enabled using the API from Part 1
            if (globalThis.FoEproxy._getProxyEnabled && globalThis.FoEproxy._getProxyEnabled() && !observedWebsockets.has(this)) {
                observedWebsockets.add(this);
                this.addEventListener('message', wsMessageHandler, { capture: false, passive: true });
            }
        };


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
            addWsHandler: function (service, method, callback) {
                if (method === undefined) { callback = service; service = method = 'all'; }
                else if (callback === undefined) { callback = method; method = 'all'; }

                if (!wsHandlerMap[service]) wsHandlerMap[service] = {};
                if (!wsHandlerMap[service][method]) wsHandlerMap[service][method] = [];
                wsHandlerMap[service][method].push(callback);
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
const handleStartup = (data, postData) => {
    console.log("FoE Interceptor: StartupService captured!", data);

    // CityMap
    if (data.responseData.city_map && data.responseData.city_map.entities) {
        window.MainParser.CityMapData = Object.assign({}, ...data.responseData.city_map.entities.map((x) => ({ [x.id]: x })));
        console.log("FoE Interceptor: CityMapData populated with " + Object.keys(window.MainParser.CityMapData).length + " entities.");
    }
};

FoEproxy.addHandler('StartupService', 'getData', handleStartup);
FoEproxy.addWsHandler('StartupService', 'getData', handleStartup);


// 2. City Entities (Metadata)
FoEproxy.addMetaHandler('city_entities', (xhr, postData) => {
    let EntityArray = JSON.parse(xhr.responseText);
    window.MainParser.CityEntities = Object.assign({}, ...EntityArray.map((x) => ({ [x.id]: x })));
    console.log("FoE Standalone: CityEntities populated with " + Object.keys(window.MainParser.CityEntities).length + " definitions.");
});

// 3. City Map Service (Updates)
const handleCityMap = (data, postData) => {
    if (data.responseData && Array.isArray(data.responseData)) {
        window.MainParser.CityMapData = Object.assign({}, ...data.responseData.map((x) => ({ [x.id]: x })));
        console.log("FoE Standalone: CityMapData updated.");
    }
};

FoEproxy.addHandler('CityMapService', 'getEntities', handleCityMap);
FoEproxy.addWsHandler('CityMapService', 'getEntities', handleCityMap); // Just in case
FoEproxy.addWsHandler('CityMapService', 'updateEntity', handleCityMap); // Often used in WS

console.log("FoE Data Export: Independent Interceptor Initialized (Restored with WS Support)");
