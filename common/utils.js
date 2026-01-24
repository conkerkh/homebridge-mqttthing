/**
 * Utility functions for homebridge-mqttthing
 */

'use strict';

const os = require('os');
const path = require('path');

/**
 * Deep clone an object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if value is defined and not null
 */
function isDefined(value) {
    return value !== undefined && value !== null;
}

/**
 * Convert string to boolean
 */
function toBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'on' || lower === 'yes') {
            return true;
        }
        if (lower === 'false' || lower === '0' || lower === 'off' || lower === 'no') {
            return false;
        }
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    return defaultValue;
}

/**
 * Parse integer with default
 */
function toInteger(value, defaultValue = 0) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float with default
 */
function toFloat(value, defaultValue = 0) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Generate unique ID for accessory
 */
function generateUUID(name) {
    return `${os.hostname()}-${name}`.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Safe JSON parse
 */
function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Safe JSON stringify
 */
function safeJsonStringify(obj, defaultValue = '') {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Map value from one range to another
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/**
 * Get nested property safely
 */
function getNestedProperty(obj, path, defaultValue = undefined) {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result === null || result === undefined) {
            return defaultValue;
        }
        result = result[key];
    }
    return result !== undefined ? result : defaultValue;
}

/**
 * Set nested property
 */
function setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return obj;
}

/**
 * Create a managed timer that can be tracked for cleanup
 */
class TimerManager {
    constructor() {
        this.timers = new Set();
    }

    setTimeout(func, timeout) {
        const timerId = setTimeout(() => {
            this.timers.delete(timerId);
            func();
        }, timeout);
        this.timers.add(timerId);
        return timerId;
    }

    setInterval(func, interval) {
        const timerId = setInterval(func, interval);
        this.timers.add(timerId);
        return timerId;
    }

    clearTimeout(timerId) {
        clearTimeout(timerId);
        this.timers.delete(timerId);
    }

    clearInterval(timerId) {
        clearInterval(timerId);
        this.timers.delete(timerId);
    }

    clearAll() {
        for (const timerId of this.timers) {
            clearTimeout(timerId);
            clearInterval(timerId);
        }
        this.timers.clear();
    }
}

module.exports = {
    deepClone,
    isDefined,
    toBoolean,
    toInteger,
    toFloat,
    clamp,
    generateUUID,
    safeJsonParse,
    safeJsonStringify,
    debounce,
    throttle,
    mapRange,
    getNestedProperty,
    setNestedProperty,
    TimerManager
};
