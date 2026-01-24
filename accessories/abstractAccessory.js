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
        
        // MQTT context
        this.mqttCtx = null;
        
        // Characteristic helper
        this.charHelper = new CharacteristicHelper(this);
        
        // Codec support
        this.codec = null;
        this.codecEncoder = null;
        this.codecDecoder = null;
        
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
     */
    async initMqtt() {
        this.mqttCtx = {
            log: this.log,
            config: this.config,
            homebridgePath: this.platform.homebridgePath
        };
        
        try {
            mqttlib.init(this.mqttCtx);
        } catch (ex) {
            this.log.error(`MQTT initialization failed for ${this.config.name}: ${ex}`);
            throw ex;
        }
    }

    /**
     * Load codec if specified in config
     * Note: mqttlib.init() handles codec loading internally with proper notify/publish functions
     * We just need to get references to the encoder/decoder from the context
     */
    async loadCodec() {
        if (!this.config.codec) return;
        
        // mqttlib.init() already loaded the codec - get it from context
        if (this.mqttCtx && this.mqttCtx.codec) {
            this.codec = this.mqttCtx.codec;
            
            if (typeof this.codec.encode === 'function') {
                this.codecEncoder = this.codec.encode.bind(this.codec);
            }
            if (typeof this.codec.decode === 'function') {
                this.codecDecoder = this.codec.decode.bind(this.codec);
            }
            
            this.log.debug(`Codec loaded from mqttlib context`);
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
        if (!topic) return;
        
        // Apply codec encoding if available
        if (this.codecEncoder) {
            message = this.codecEncoder(property, message);
        }
        
        // Apply apply function if configured
        const applyKey = 'apply' + property.charAt(0).toUpperCase() + property.slice(1);
        if (this.config[applyKey] && typeof this.config[applyKey] === 'function') {
            message = this.config[applyKey](message);
        }
        
        mqttlib.publish(this.mqttCtx, topic, property, message);
    }

    /**
     * Decode MQTT message using codec
     */
    decodeMessage(property, message) {
        let decoded = message;
        
        // Apply codec decoding if available
        if (this.codecDecoder) {
            try {
                decoded = this.codecDecoder(property, message);
            } catch (ex) {
                // Codec decode failed - log and use original message
                this.log.debug(`Codec decode error for property '${property}': ${ex.message}`);
                decoded = message;
            }
        }
        
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
        
        // Close MQTT connection
        if (this.mqttCtx && this.mqttCtx.mqttClient) {
            try {
                this.mqttCtx.mqttClient.end(true);
                this.log.debug('MQTT client closed');
            } catch (ex) {
                this.log.error(`Error closing MQTT client: ${ex}`);
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
