import { GA_CONFIG } from './config.js';

// Google Analytics 4 Credentials
const GA_MEASUREMENT_ID = GA_CONFIG.MEASUREMENT_ID;
const GA_API_SECRET = GA_CONFIG.API_SECRET;

const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// Debug mode (prints events to console instead of sending)
const DEBUG = false;

class Analytics {
    constructor() {
        this.clientId = null;
        this.enabled = true; // Default to true, strictly controlled by user setting
    }

    /**
     * Initialize the analytics service.
     * Loads client ID and privacy preference.
     */
    async init() {
        // Load Client ID
        const stored = await chrome.storage.local.get(['analytics_client_id', 'analytics_enabled']);

        if (stored.analytics_client_id) {
            this.clientId = stored.analytics_client_id;
        } else {
            this.clientId = this._generateUUID();
            await chrome.storage.local.set({ analytics_client_id: this.clientId });
        }

        // Load Privacy Setting (default to true if undefined)
        this.enabled = stored.analytics_enabled !== false;
    }

    /**
     * Enable or disable analytics.
     * @param {boolean} isEnabled 
     */
    async setEnabled(isEnabled) {
        this.enabled = isEnabled;
        await chrome.storage.local.set({ analytics_enabled: isEnabled });
    }

    /**
     * Track a custom event.
     * @param {string} eventName - e.g. 'export_json', 'view_popup'
     * @param {object} params - Additional parameters
     */
    async track(eventName, params = {}) {
        if (!this.enabled) return;

        // Ensure init complete
        if (!this.clientId) await this.init();

        const payload = {
            client_id: this.clientId,
            events: [{
                name: eventName,
                params: {
                    ...params,
                    session_id: '1' // Simplified session handling
                }
            }]
        };

        if (DEBUG) {
            console.log('[Analytics] Tracking:', eventName, payload);
            if (GA_MEASUREMENT_ID === 'YOUR_MEASUREMENT_ID') {
                console.warn('[Analytics] Credentials missing. Request not sent.');
                return;
            }
        }

        try {
            const response = await fetch(GA_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (!response.ok && DEBUG) {
                console.error('[Analytics] Failed to send event', response);
            }
        } catch (e) {
            if (DEBUG) console.error('[Analytics] Network error', e);
        }
    }

    /**
     * Generate a random UUID v4
     */
    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
}

// Export singleton
export const analytics = new Analytics();
