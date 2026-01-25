/**
 * AbstractAccessory - Base class for all MQTT Thing accessories
 * 
 * Provides common functionality for all accessory types including
 * MQTT connection, codec support, and characteristic management.
 */

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const mqttlib = require('../libs/mqttlib');
const { CharacteristicHelper } = require('../characteristics');
const { TimerManager, isDefined, toBoolean, safeJsonParse } = require('../common/utils');
const packagedef = require('../package.json');

class AbstractAccessory {
    /**
     * Constructor
     * @param {object} platform - The MqttPlatform instance
     * @param {object} accessory - The PlatformAccessory instance
     * @param {object} config - The accessory configuration
     */
    constructor(platform, accessory, config) {
        this.platform = platform;
        this.accessory = accessory;
        this.config = config;
        this.log = platform.log;
        this.api = platform.api;
        
        // HAP references
        this.Service = platform.api.hap.Service;
        this.Characteristic = platform.api.hap.Characteristic;
        
        // State storage
        this.state = {};
        
        // Resource management
        this.timerManager = new TimerManager();
        this.eventListeners = [];
        this.cleanupTasks = [];
        
        // MQTT context (codec is stored here by mqttlib)
        this.mqttCtx = null;
        
        // Characteristic helper
        this.charHelper = new CharacteristicHelper(this);
        
        // Service list for this accessory
        this.servicesList = [];
    }

    /**
     * Get the accessory type (override in subclasses)
     */
    get type() {
        return 'abstract';
    }

    /**
     * Initialize the accessory
     */
    async init() {
        this.log.info(`Initializing ${this.type} accessory: ${this.config.name}`);
        
        // Initialize MQTT connection
        await this.initMqtt();
        
        // Load codec if specified
        await this.loadCodec();
        
        // Create services
        this.createServices();
        
        // Set up online state monitoring
        if (this.config.topics?.getOnline) {
            this.setupOnlineMonitoring();
        }
        
        // Publish startup messages
        this.publishStartupMessages();
        
        this.log.debug(`${this.type} accessory initialized: ${this.config.name}`);
    }

    /**
     * Initialize MQTT connection
     * Uses the platform's connection pool for shared connections
     */
    async initMqtt() {
        try {
            // Get connection from platform's pool
            // Pass the full config so pool can auto-detect broker from config.broker or config.url
            const pooledConnection = this.platform.mqttPool.getConnection(this.config, this.config.name);
            
            if (!pooledConnection) {
                throw new Error('Failed to get MQTT connection from pool');
            }
            
            // Store reference to release later
            this._pooledBrokerName = pooledConnection.brokerName;
            
            // Create MQTT context using the pool's shared resources
            // The pool's dispatcher is used so message routing works across accessories
            this.mqttCtx = {
                log: this.log,
                config: this.config,
                homebridgePath: this.platform.homebridgePath,
                mqttClient: pooledConnection.client,
                mqttDispatch: pooledConnection.dispatcher,  // Shared per broker
                propDispatch: {},   // Per-accessory (for codec notifications)
                brokerName: pooledConnection.brokerName
            };
            
            // Create cache of last-published values for publishing optimization
            if (this.config.optimizePublishing) {
                this.mqttCtx.lastPubValues = {};
            }
            
            // Load codec if configured (codec needs the context)
            this.loadCodecInternal();
            
            this.log.debug(`MQTT connection established for ${this.config.name} using broker '${pooledConnection.brokerName}'`);
        } catch (ex) {
            this.log.error(`MQTT initialization failed for ${this.config.name}: ${ex}`);
            throw ex;
        }
    }
    
    /**
     * Internal codec loading - separate from loadCodec to run during init
     */
    loadCodecInternal() {
        if (!this.config.codec) return;
        
        const fs = require('fs');
        const path = require('path');
        
        let codecPath = this.config.codec;
        // if it doesn't start with a '/' (i.e. not fully-qualified)...
        if (codecPath[0] !== '/') {
            if (codecPath.substr(codecPath.length - 3) !== '.js') {
                // no js extension - assume it's an internal codec
                codecPath = path.join(__dirname, '../codecs/', codecPath + '.js');
            } else {
                // relative external codec is relative to homebridge userdata
                codecPath = path.join(this.mqttCtx.homebridgePath, codecPath);
            }
        }
        
        if (!fs.existsSync(codecPath)) {
            this.log.error(`ERROR: Codec file [${codecPath}] does not exist`);
            return;
        }
        
        this.log(`Loading codec from ${codecPath}`);
        const codecMod = require(codecPath);
        
        if (typeof codecMod.init !== 'function') {
            this.log.error(`ERROR: No codec initialisation function returned from ${codecPath}`);
            return;
        }
        
        // Direct publishing function for codec
        const directPub = (topic, message) => {
            this.optimizedPublish(topic, message);
        };
        
        // Notification by property for codec
        const notifyByProp = (property, message) => {
            const handlers = this.mqttCtx.propDispatch[property];
            if (handlers) {
                for (const handler of handlers) {
                    handler('_prop-' + property, message);
                }
            }
        };
        
        // Initialize codec
        const codec = this.mqttCtx.codec = codecMod.init({
            log: this.log,
            config: this.config,
            publish: directPub,
            notify: notifyByProp
        });
        
        if (codec) {
            // encode/decode must be functions
            if (typeof codec.encode !== 'function') {
                this.log.warn('No codec encode() function');
                codec.encode = null;
            }
            if (typeof codec.decode !== 'function') {
                this.log.warn('No codec decode() function');
                codec.decode = null;
            }
        }
    }
    
    /**
     * Optimized publish - avoids duplicate messages
     */
    optimizedPublish(topic, message) {
        const messageString = message.toString();
        if (this.config.optimizePublishing && this.mqttCtx.lastPubValues) {
            if (this.mqttCtx.lastPubValues[topic] === messageString) {
                return; // optimized - don't publish
            }
            this.mqttCtx.lastPubValues[topic] = messageString;
        }
        if (this.config.logMqtt) {
            this.log(`Publishing MQTT: ${topic} = ${messageString}`);
        }
        this.mqttCtx.mqttClient.publish(topic, messageString, this.config.mqttPubOptions);
    }

    /**
     * Load codec if specified in config
     * Note: Codec is already loaded by loadCodecInternal() during initMqtt()
     * This method just verifies it's properly loaded
     */
    async loadCodec() {
        if (!this.config.codec) return;
        
        if (this.mqttCtx && this.mqttCtx.codec) {
            this.log.debug(`Codec '${this.config.codec}' loaded successfully`);
        } else {
            this.log.warn(`Codec '${this.config.codec}' specified but not loaded`);
        }
    }

    /**
     * Create services for this accessory (override in subclasses)
     */
    createServices() {
        // Create accessory information service
        this.createAccessoryInformationService();
    }

    /**
     * Create AccessoryInformation service
     */
    createAccessoryInformationService() {
        const infoService = this.accessory.getService(this.Service.AccessoryInformation) ||
                           this.accessory.addService(this.Service.AccessoryInformation);
        
        infoService
            .setCharacteristic(this.Characteristic.Manufacturer, this.config.manufacturer || 'mqttthing')
            .setCharacteristic(this.Characteristic.Model, this.config.model || this.type)
            .setCharacteristic(this.Characteristic.SerialNumber, this.config.serialNumber || `${os.hostname()}-${this.config.name}`)
            .setCharacteristic(this.Characteristic.FirmwareRevision, this.config.firmwareRevision || packagedef.version);
        
        return infoService;
    }

    /**
     * Get or create a service
     */
    getOrCreateService(serviceType, name, subtype) {
        let service;
        
        if (subtype) {
            service = this.accessory.getServiceById(serviceType, subtype);
        } else {
            service = this.accessory.getService(serviceType);
        }
        
        if (!service) {
            service = this.accessory.addService(serviceType, name || this.config.name, subtype);
        }
        
        this.servicesList.push(service);
        return service;
    }

    /**
     * Setup online state monitoring
     */
    setupOnlineMonitoring() {
        this.state.online = true;
        
        this.mqttSubscribe(this.config.topics.getOnline, 'online', (topic, message) => {
            const online = toBoolean(this.decodeMessage('online', message));
            
            if (this.state.online !== online) {
                this.state.online = online;
                this.log.info(`${this.config.name} is now ${online ? 'online' : 'offline'}`);
            }
        });
    }

    /**
     * Publish startup messages
     */
    publishStartupMessages() {
        if (!this.config.startPub) return;
        
        if (Array.isArray(this.config.startPub)) {
            // New format: [{ topic: x, message: y }, ...]
            for (const entry of this.config.startPub) {
                if (entry.topic) {
                    this.mqttPublish(entry.topic, 'startPub', entry.message || '');
                }
            }
        } else if (typeof this.config.startPub === 'object') {
            // Old format: { topic: message, ... }
            for (const topic in this.config.startPub) {
                if (this.config.startPub.hasOwnProperty(topic)) {
                    this.mqttPublish(topic, 'startPub', this.config.startPub[topic]);
                }
            }
        }
    }

    /**
     * MQTT Subscribe wrapper
     */
    mqttSubscribe(topic, property, handler) {
        if (!topic) return;
        mqttlib.subscribe(this.mqttCtx, topic, property, handler);
    }

    /**
     * MQTT Publish wrapper
     */
    mqttPublish(topic, property, message) {
        if (!topic) {
            this.log.debug(`mqttPublish called with no topic for property '${property}'`);
            return;
        }
        if (message === null || message === undefined) {
            this.log.debug(`mqttPublish called with null/undefined message for property '${property}'`);
            return;
        }
        
        // Note: codec encoding is handled by mqttlib.publish internally
        // Don't encode here to avoid double-encoding
        
        // Apply apply function if configured
        const applyKey = 'apply' + property.charAt(0).toUpperCase() + property.slice(1);
        if (this.config[applyKey] && typeof this.config[applyKey] === 'function') {
            message = this.config[applyKey](message);
        }
        
        mqttlib.publish(this.mqttCtx, topic, property, message);
    }

    /**
     * Decode MQTT message - handles JSON extraction
     * Note: Codec decoding is already done by mqttlib.subscribe
     */
    decodeMessage(property, message) {
        let decoded = message;
        
        // Handle JSON payload with property extraction
        if (typeof decoded === 'string') {
            const json = safeJsonParse(decoded);
            if (json !== null && typeof json === 'object') {
                // Try to extract property from JSON
                if (isDefined(json[property])) {
                    decoded = json[property];
                } else if (isDefined(json.value)) {
                    decoded = json.value;
                }
            }
        }
        
        return decoded;
    }

    /**
     * Get On/Off value based on config
     */
    getOnOffValue(value) {
        if (value) {
            return this.config.onValue !== undefined ? this.config.onValue : 'true';
        } else {
            return this.config.offValue !== undefined ? this.config.offValue : 'false';
        }
    }

    /**
     * Get the accessory object
     */
    getAccessory() {
        return this.accessory;
    }

    /**
     * Get services list
     */
    getServices() {
        return this.servicesList;
    }

    /**
     * Add tracked event listener for cleanup
     */
    addTrackedListener(emitter, event, handler) {
        emitter.addListener(event, handler);
        this.eventListeners.push({ emitter, event, handler });
    }

    /**
     * Register cleanup task
     */
    registerCleanup(task) {
        this.cleanupTasks.push(task);
    }

    /**
     * Shutdown and cleanup
     */
    shutdown() {
        this.log.info(`Shutting down ${this.type} accessory: ${this.config.name}`);
        
        // Clear all timers
        this.timerManager.clearAll();
        
        // Remove event listeners
        for (const { emitter, event, handler } of this.eventListeners) {
            try {
                emitter.removeListener(event, handler);
            } catch (ex) {
                this.log.debug(`Error removing listener: ${ex}`);
            }
        }
        this.eventListeners = [];
        
        // Release MQTT connection back to pool (don't close it directly)
        if (this._pooledBrokerName && this.platform && this.platform.mqttPool) {
            try {
                this.platform.mqttPool.releaseConnection(this._pooledBrokerName, this.config.name);
                this.log.debug('MQTT connection released to pool');
            } catch (ex) {
                this.log.error(`Error releasing MQTT connection: ${ex}`);
            }
        }
        
        // Run cleanup tasks
        for (const task of this.cleanupTasks) {
            try {
                task();
            } catch (ex) {
                this.log.error(`Cleanup task error: ${ex}`);
            }
        }
        this.cleanupTasks = [];
        
        this.log.info(`Shutdown complete for ${this.config.name}`);
    }

    /**
     * Common sensor optional characteristics
     */
    addSensorOptionalCharacteristics(service) {
        const topics = this.config.topics || {};
        
        if (topics.getStatusActive) {
            this.charHelper.booleanCharacteristic(
                service, 'statusActive', this.Characteristic.StatusActive,
                null, topics.getStatusActive, true
            );
        }
        
        if (topics.getStatusFault) {
            this.charHelper.integerCharacteristic(
                service, 'statusFault', this.Characteristic.StatusFault,
                null, topics.getStatusFault, { initialValue: 0 }
            );
        }
        
        if (topics.getStatusTampered) {
            this.charHelper.integerCharacteristic(
                service, 'statusTampered', this.Characteristic.StatusTampered,
                null, topics.getStatusTampered, { initialValue: 0 }
            );
        }
        
        if (topics.getStatusLowBattery) {
            this.charHelper.integerCharacteristic(
                service, 'statusLowBattery', this.Characteristic.StatusLowBattery,
                null, topics.getStatusLowBattery, { initialValue: 0 }
            );
        }
    }

    /**
     * Common battery characteristics
     */
    addBatteryCharacteristics(service) {
        const topics = this.config.topics || {};
        
        if (topics.getBatteryLevel) {
            this.charHelper.integerCharacteristic(
                service, 'batteryLevel', this.Characteristic.BatteryLevel,
                null, topics.getBatteryLevel, { initialValue: 100 }
            );
        }
        
        if (topics.getChargingState) {
            const values = this.config.chargingStateValues || ['NOT_CHARGING', 'CHARGING', 'NOT_CHARGEABLE'];
            this.charHelper.multiCharacteristic(
                service, 'chargingState', this.Characteristic.ChargingState,
                null, topics.getChargingState, values, 
                this.Characteristic.ChargingState.NOT_CHARGING
            );
        }
        
        if (topics.getStatusLowBattery && !service.testCharacteristic(this.Characteristic.StatusLowBattery)) {
            this.charHelper.integerCharacteristic(
                service, 'statusLowBattery', this.Characteristic.StatusLowBattery,
                null, topics.getStatusLowBattery, { initialValue: 0 }
            );
        }
    }
}

module.exports = AbstractAccessory;
