/**
 * ForgeData - i18n Module
 * Internationalization support for the extension
 */

// Available languages (loaded dynamically from src/lang/)
const AVAILABLE_LANGUAGES = ['en', 'es', 'fr', 'de', 'it'];
const DEFAULT_LANGUAGE = 'en';

class I18n {
    constructor() {
        this.currentLanguage = DEFAULT_LANGUAGE;
        this.translations = {};
        this.fallbackTranslations = {};
    }

    /**
     * Initialize the i18n module
     * Priority: 1. Saved preference, 2. Browser language, 3. Default (en)
     */
    async init() {
        // Load fallback (English) first
        this.fallbackTranslations = await this.loadLanguage(DEFAULT_LANGUAGE);

        // Determine which language to use
        const savedLang = await this.getSavedLanguage();
        const browserLang = this.getBrowserLanguage();

        this.currentLanguage = savedLang || browserLang || DEFAULT_LANGUAGE;

        // Load current language translations
        if (this.currentLanguage !== DEFAULT_LANGUAGE) {
            this.translations = await this.loadLanguage(this.currentLanguage);
        } else {
            this.translations = this.fallbackTranslations;
        }

        // Apply translations to DOM
        this.applyTranslations();

        return this.currentLanguage;
    }

    /**
     * Get saved language preference from storage
     */
    async getSavedLanguage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['language'], (result) => {
                resolve(result.language || null);
            });
        });
    }

    /**
     * Save language preference to storage
     */
    async saveLanguage(lang) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ language: lang }, resolve);
        });
    }

    /**
     * Get browser language and match to available languages
     */
    getBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage;
        const shortLang = browserLang.split('-')[0].toLowerCase();

        if (AVAILABLE_LANGUAGES.includes(shortLang)) {
            return shortLang;
        }

        return null;
    }

    /**
     * Load language file
     */
    async loadLanguage(lang) {
        try {
            const url = chrome.runtime.getURL(`src/lang/${lang}.json`);
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[i18n] Could not load language: ${lang}`);
                return {};
            }
            return await response.json();
        } catch (e) {
            console.warn(`[i18n] Error loading language ${lang}:`, e);
            return {};
        }
    }

    /**
     * Get translation for a key (dot notation supported)
     * Example: t('buttons.exportJson')
     */
    t(key, params = {}) {
        let value = this.getNestedValue(this.translations, key);

        // Fallback to English if not found
        if (value === undefined) {
            value = this.getNestedValue(this.fallbackTranslations, key);
        }

        // Return key if still not found
        if (value === undefined) {
            return key;
        }

        // Replace placeholders like {count}, {message}
        if (typeof value === 'string' && Object.keys(params).length > 0) {
            for (const [param, val] of Object.entries(params)) {
                value = value.replace(new RegExp(`\\{${param}\\}`, 'g'), val);
            }
        }

        return value;
    }

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, key) {
        return key.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    /**
     * Apply translations to all elements with data-i18n attribute
     */
    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            el.textContent = translation;
        });

        // Handle placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // Handle titles
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // Update document language
        document.documentElement.lang = this.currentLanguage;
    }

    /**
     * Change language and reload translations
     */
    async setLanguage(lang) {
        if (!AVAILABLE_LANGUAGES.includes(lang)) {
            console.warn(`[i18n] Language not available: ${lang}`);
            return false;
        }

        this.currentLanguage = lang;
        await this.saveLanguage(lang);

        if (lang !== DEFAULT_LANGUAGE) {
            this.translations = await this.loadLanguage(lang);
        } else {
            this.translations = this.fallbackTranslations;
        }

        this.applyTranslations();
        return true;
    }

    /**
     * Get list of available languages with their native names
     */
    getAvailableLanguages() {
        const langs = [];
        for (const code of AVAILABLE_LANGUAGES) {
            const name = this.t(`languages.${code}`);
            langs.push({ code, name });
        }
        return langs;
    }

    /**
     * Get current language code
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// Export singleton instance
export const i18n = new I18n();

// Shortcut function for translation
export function t(key, params = {}) {
    return i18n.t(key, params);
}
