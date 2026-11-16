/**
 * MqttPlatform - Dynamic Platform for homebridge-mqttthing
 * 
 * This is the main platform class that manages all MQTT accessories
 * using Homebridge's dynamic platform API.
 */

'use strict';

const fakegatoHistory = require('fakegato-history');
const { createAccessory, restoreAccessory, isTypeSupported, getSupportedTypes } = require('../accessories');
const MqttConnectionPool = require('../libs/mqttConnectionPool');

const PLATFORM_NAME = 'mqttthing';
const PLUGIN_NAME = 'homebridge-mqttthing';

/**
 * Deep copy of an accessory config (config.json data is plain JSON)
 */
function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
}

class MqttPlatform {
    /**
     * Constructor
     * @param {object} log - Homebridge logger
     * @param {object} config - Platform configuration
     * @param {object} api - Homebridge API
     */
    constructor(log, config, api) {
        this.log = log;
        this.config = config || {};
        this.api = api;
        
        // Store HAP references
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        
        // Storage path
        this.homebridgePath = api.user.storagePath();
        
        // Initialize MQTT Connection Pool
        this.mqttPool = new MqttConnectionPool(log, this.config);
        
        // Accessory storage
        this.accessories = new Map(); // UUID -> accessory wrapper
        this.accessoriesByName = new Map(); // name -> accessory wrapper
        
        // Configuration
        this.accessoryConfigs = this.config.accessories || [];
        
        // Log startup
        this.log.info(`${PLUGIN_NAME} platform initializing...`);
        this.log.info(`Found ${this.accessoryConfigs.length} accessory configurations`);
        this.log.debug(`Supported accessory types: ${getSupportedTypes().join(', ')}`);
        
        // Wait for homebridge to finish launching
        this.api.on('didFinishLaunching', () => {
            this.log.info('Homebridge finished launching, discovering accessories...');
            this.discoverAccessories();
        });
        
        // Handle shutdown
        this.api.on('shutdown', () => {
            this.log.info('Homebridge shutting down, cleaning up accessories...');
            this.shutdown();
        });
    }

    /**
     * Configure cached accessory (called by Homebridge for Dynamic Platform)
     * @param {object} accessory - The cached PlatformAccessory
     */
    configureAccessory(accessory) {
        this.log.info(`Restoring cached accessory: ${accessory.displayName}`);
        
        const context = accessory.context;
        
        if (!context || !context.mqttthing) {
            this.log.warn(`Accessory ${accessory.displayName} has no mqttthing context, will be removed`);
            this.accessories.set(accessory.UUID, { accessory, needsRemoval: true });
            return;
        }
        
        const config = context.mqttthing;
        const type = config.type;
        
        if (!isTypeSupported(type)) {
            this.log.warn(`Accessory type '${type}' not supported, accessory will be removed`);
            this.accessories.set(accessory.UUID, { accessory, needsRemoval: true });
            return;
        }
        
        // Store immediately as "pending" to prevent duplicates during discovery
        // The wrapper will be initialized later in discoverAccessories
        this.accessories.set(accessory.UUID, { 
            accessory, 
            config,
            type,
            needsInit: true,
            needsRemoval: false 
        });
        this.accessoriesByName.set(config.name, this.accessories.get(accessory.UUID));
        this.log.debug(`Cached accessory queued for initialization: ${config.name}`);
    }

    /**
     * Discover and create accessories from configuration
     */
    async discoverAccessories() {
        // First, remove any cached accessories that need removal
        const toRemove = [];
        for (const [uuid, entry] of this.accessories) {
            if (entry.needsRemoval) {
                this.log.info(`Removing stale accessory: ${entry.accessory.displayName}`);
                toRemove.push(entry.accessory);
                this.accessories.delete(uuid);
            }
        }
        if (toRemove.length > 0) {
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
        }
        
        // Index current config.json entries by name (first entry wins, matching
        // the duplicate-name handling in the creation loop below)
        const configsByName = new Map();
        for (const accessoryConfig of this.accessoryConfigs) {
            if (accessoryConfig && accessoryConfig.name && !configsByName.has(accessoryConfig.name)) {
                configsByName.set(accessoryConfig.name, accessoryConfig);
            }
        }
        
        // Initialize cached accessories that match current config. The current
        // config.json entry always wins over the copy cached in accessory.context,
        // otherwise edits to existing accessories would be silently ignored.
        const updated = [];
        for (const [uuid, entry] of this.accessories) {
            if (!entry.needsInit) {
                continue;
            }
            
            const cachedName = entry.config.name;
            const currentConfig = configsByName.get(cachedName);
            
            if (!currentConfig) {
                // Cached accessory not in config anymore - remove it
                this.log.info(`Removing accessory no longer in config: ${cachedName}`);
                this.removeCachedAccessory(uuid, entry);
                continue;
            }
            
            if (!this.isSameType(entry.config.type, currentConfig.type)) {
                // Type changed (or is now invalid) - services differ, so drop the
                // cached accessory; the loop below recreates it from config (same
                // name, so same UUID) or logs why it can't.
                this.log.info(`Accessory "${cachedName}" type changed from '${entry.config.type}' to '${currentConfig.type}', recreating`);
                this.removeCachedAccessory(uuid, entry);
                continue;
            }
            
            if (JSON.stringify(entry.config) !== JSON.stringify(currentConfig)) {
                this.log.info(`Configuration changed for cached accessory "${cachedName}", applying config.json`);
                updated.push(entry.accessory);
            }
            
            // Cache an untouched copy and give the accessory its own working copy:
            // codecs add topics etc. to the config they get, and caching that would
            // make every restart look like a config change.
            entry.config = cloneConfig(currentConfig);
            entry.type = currentConfig.type;
            entry.accessory.context.mqttthing = cloneConfig(currentConfig);
            await this.initCachedAccessory(uuid, entry);
        }
        
        // Persist refreshed context for accessories that are still registered
        const stillRegistered = updated.filter(acc => this.accessories.has(acc.UUID));
        if (stillRegistered.length > 0) {
            this.api.updatePlatformAccessories(stillRegistered);
        }
        
        // Process each accessory configuration - create only new ones
        for (const accessoryConfig of this.accessoryConfigs) {
            // Check if this accessory already exists (by name)
            if (!this.accessoriesByName.has(accessoryConfig.name)) {
                await this.addAccessoryFromConfig(accessoryConfig);
            } else {
                this.log.debug(`Accessory "${accessoryConfig.name}" already exists, skipping`);
            }
        }
        
        this.log.info(`Discovery complete. ${this.accessories.size} accessories active.`);
    }

    /**
     * Check whether two configured accessory types are the same
     * (case-insensitive, subtype suffix such as 'lightbulb-RGB' included)
     */
    isSameType(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }
        return a.toLowerCase() === b.toLowerCase();
    }

    /**
     * Unregister a cached accessory and forget it
     */
    removeCachedAccessory(uuid, entry) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [entry.accessory]);
        this.accessories.delete(uuid);
        if (this.accessoriesByName.get(entry.config.name) === entry) {
            this.accessoriesByName.delete(entry.config.name);
        }
    }

    /**
     * Initialize a cached accessory
     */
    async initCachedAccessory(uuid, entry) {
        const { accessory, config, type } = entry;
        
        try {
            const wrapper = restoreAccessory(type, this, accessory, config);
            
            if (wrapper) {
                await wrapper.init();
                this.accessories.set(uuid, wrapper);
                this.accessoriesByName.set(config.name, wrapper);
                this.log.info(`Restored accessory: ${config.name} (${type})`);
            }
        } catch (err) {
            this.log.error(`Error restoring accessory ${config.name}: ${err}`);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.delete(uuid);
            this.accessoriesByName.delete(config.name);
        }
    }

    /**
     * Add or update accessory from configuration
     * @param {object} config - Accessory configuration
     */
    async addAccessoryFromConfig(config) {
        if (!config.name) {
            this.log.error('Accessory configuration missing required "name" property');
            return;
        }
        
        if (!config.type) {
            this.log.error(`Accessory "${config.name}" missing required "type" property`);
            return;
        }
        
        if (!isTypeSupported(config.type)) {
            this.log.error(`Accessory "${config.name}" has unsupported type: ${config.type}`);
            this.log.error(`Supported types: ${getSupportedTypes().join(', ')}`);
            return;
        }
        
        // Generate UUID for this accessory
        const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${config.name}`);
        
        // Double-check accessory doesn't already exist
        if (this.accessories.has(uuid)) {
            this.log.debug(`Accessory "${config.name}" with UUID ${uuid} already exists, skipping`);
            return;
        }
        
        // Create new accessory
        this.log.info(`Creating new accessory: ${config.name} (${config.type})`);
        
        const accessory = new this.api.platformAccessory(config.name, uuid);
        
        // Cache an untouched copy and give the accessory its own working copy
        // (codecs modify the config they get)
        accessory.context.mqttthing = cloneConfig(config);

        try {
            const wrapper = createAccessory(config.type, this, accessory, cloneConfig(config));
            
            if (wrapper) {
                await wrapper.init();
                this.accessories.set(uuid, wrapper);
                this.accessoriesByName.set(config.name, wrapper);
                
                // Register the accessory
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                
                this.log.info(`Accessory created: ${config.name} (${config.type})`);
            }
        } catch (err) {
            this.log.error(`Error creating accessory ${config.name}: ${err}`);
        }
    }

    /**
     * Get accessory by name
     * @param {string} name - Accessory name
     * @returns {object|undefined} The accessory wrapper or undefined
     */
    getAccessoryByName(name) {
        return this.accessoriesByName.get(name);
    }

    /**
     * Shutdown all accessories
     */
    shutdown() {
        this.log.info('Shutting down all accessories...');
        
        for (const [uuid, wrapper] of this.accessories) {
            if (wrapper.shutdown) {
                try {
                    wrapper.shutdown();
                } catch (err) {
                    this.log.error(`Error shutting down accessory: ${err}`);
                }
            }
        }
        
        this.accessories.clear();
        this.accessoriesByName.clear();
        
        // Shutdown MQTT Connection Pool
        if (this.mqttPool) {
            this.mqttPool.shutdown();
        }
        
        this.log.info('All accessories shut down');
    }
}

module.exports = {
    MqttPlatform,
    PLATFORM_NAME,
    PLUGIN_NAME
};
