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
        
        // Build a set of configured accessory names for comparison
        const configNames = new Set(this.accessoryConfigs.map(c => c.name));
        
        // Initialize cached accessories that match current config
        for (const [uuid, entry] of this.accessories) {
            if (entry.needsInit && configNames.has(entry.config.name)) {
                await this.initCachedAccessory(uuid, entry);
            } else if (entry.needsInit) {
                // Cached accessory not in config anymore - remove it
                this.log.info(`Removing accessory no longer in config: ${entry.config.name}`);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [entry.accessory]);
                this.accessories.delete(uuid);
                this.accessoriesByName.delete(entry.config.name);
            }
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
        
        // Store configuration in context
        accessory.context.mqttthing = config;
        
        try {
            const wrapper = createAccessory(config.type, this, accessory, config);
            
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
