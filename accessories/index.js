/**
 * Accessory Factory/Registry for homebridge-mqttthing
 * 
 * This module registers all accessory types and provides factory methods
 * for creating and restoring accessories.
 */

'use strict';

const { ACCESSORY_TYPES } = require('../common/constants');

// Import all accessory modules
const lightbulb = require('./lightbulb');
const switchAccessory = require('./switch');
const outlet = require('./outlet');
const motionSensor = require('./motionSensor');
const temperatureSensor = require('./temperatureSensor');
const contactSensor = require('./contactSensor');
const thermostat = require('./thermostat');
const garageDoorOpener = require('./garageDoorOpener');
const fan = require('./fan');
const windowCovering = require('./windowCovering');
const lockMechanism = require('./lockMechanism');
const securitySystem = require('./securitySystem');
const humiditySensor = require('./humiditySensor');
const leakSensor = require('./leakSensor');
const occupancySensor = require('./occupancySensor');
const smokeSensor = require('./smokeSensor');
const statelessProgrammableSwitch = require('./statelessProgrammableSwitch');
const valve = require('./valve');

// Array of all accessory wrappers
const accessoryWrappers = [
    lightbulb,
    switchAccessory,
    outlet,
    motionSensor,
    temperatureSensor,
    contactSensor,
    thermostat,
    garageDoorOpener,
    fan,
    windowCovering,
    lockMechanism,
    securitySystem,
    humiditySensor,
    leakSensor,
    occupancySensor,
    smokeSensor,
    statelessProgrammableSwitch,
    valve
];

// Build lookup map by type
const wrappersByType = accessoryWrappers.reduce((acc, wrapper) => {
    acc[wrapper.type] = wrapper;
    // Also add aliases for common variations
    acc[wrapper.type.toLowerCase()] = wrapper;
    return acc;
}, {});

// Add type aliases for backward compatibility
const typeAliases = {
    'light': ACCESSORY_TYPES.LIGHTBULB,
    'bulb': ACCESSORY_TYPES.LIGHTBULB,
    'motion': ACCESSORY_TYPES.MOTION_SENSOR,
    'temperature': ACCESSORY_TYPES.TEMPERATURE_SENSOR,
    'temp': ACCESSORY_TYPES.TEMPERATURE_SENSOR,
    'humidity': ACCESSORY_TYPES.HUMIDITY_SENSOR,
    'contact': ACCESSORY_TYPES.CONTACT_SENSOR,
    'door': ACCESSORY_TYPES.CONTACT_SENSOR,
    'window': ACCESSORY_TYPES.CONTACT_SENSOR,
    'garage': ACCESSORY_TYPES.GARAGE_DOOR_OPENER,
    'garagedoor': ACCESSORY_TYPES.GARAGE_DOOR_OPENER,
    'lock': ACCESSORY_TYPES.LOCK_MECHANISM,
    'blind': ACCESSORY_TYPES.WINDOW_COVERING,
    'blinds': ACCESSORY_TYPES.WINDOW_COVERING,
    'shade': ACCESSORY_TYPES.WINDOW_COVERING,
    'shutter': ACCESSORY_TYPES.WINDOW_COVERING,
    'security': ACCESSORY_TYPES.SECURITY_SYSTEM,
    'alarm': ACCESSORY_TYPES.SECURITY_SYSTEM,
    'smoke': ACCESSORY_TYPES.SMOKE_SENSOR,
    'leak': ACCESSORY_TYPES.LEAK_SENSOR,
    'water': ACCESSORY_TYPES.LEAK_SENSOR,
    'occupancy': ACCESSORY_TYPES.OCCUPANCY_SENSOR,
    'presence': ACCESSORY_TYPES.OCCUPANCY_SENSOR,
    'button': ACCESSORY_TYPES.STATELESS_PROGRAMMABLE_SWITCH,
    'programmableswitch': ACCESSORY_TYPES.STATELESS_PROGRAMMABLE_SWITCH,
    'fanv2': ACCESSORY_TYPES.FAN
};

// Add aliases to lookup map
for (const [alias, type] of Object.entries(typeAliases)) {
    if (wrappersByType[type]) {
        wrappersByType[alias] = wrappersByType[type];
    }
}

/**
 * Get accessory wrapper by type
 * @param {string} type - The accessory type
 * @returns {object|null} The accessory wrapper or null if not found
 */
function getAccessoryWrapper(type) {
    if (!type) return null;
    
    // Handle type with subtype (e.g., 'lightbulb-OnOff')
    const baseType = type.split('-')[0].toLowerCase();
    
    return wrappersByType[baseType] || null;
}

/**
 * Create a new accessory instance
 * @param {string} type - The accessory type
 * @param {object} platform - The MqttPlatform instance
 * @param {object} accessory - The PlatformAccessory instance
 * @param {object} config - The accessory configuration
 * @returns {object|null} The created accessory wrapper or null
 */
function createAccessory(type, platform, accessory, config) {
    const wrapper = getAccessoryWrapper(type);
    
    if (!wrapper) {
        platform.log.error(`Unknown accessory type: ${type}`);
        return null;
    }
    
    return wrapper.create(platform, accessory, config);
}

/**
 * Restore an existing accessory from cache
 * @param {string} type - The accessory type
 * @param {object} platform - The MqttPlatform instance
 * @param {object} accessory - The PlatformAccessory instance
 * @param {object} config - The accessory configuration
 * @returns {object|null} The restored accessory wrapper or null
 */
function restoreAccessory(type, platform, accessory, config) {
    const wrapper = getAccessoryWrapper(type);
    
    if (!wrapper) {
        platform.log.error(`Unknown accessory type for restore: ${type}`);
        return null;
    }
    
    return wrapper.restore(platform, accessory, config);
}

/**
 * Get list of all supported accessory types
 * @returns {string[]} Array of supported type names
 */
function getSupportedTypes() {
    return accessoryWrappers.map(w => w.type);
}

/**
 * Check if an accessory type is supported
 * @param {string} type - The accessory type to check
 * @returns {boolean} True if supported
 */
function isTypeSupported(type) {
    return getAccessoryWrapper(type) !== null;
}

module.exports = {
    getAccessoryWrapper,
    createAccessory,
    restoreAccessory,
    getSupportedTypes,
    isTypeSupported,
    ACCESSORY_TYPES
};
