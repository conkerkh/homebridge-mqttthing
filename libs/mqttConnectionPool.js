/**
 * MQTT Connection Pool for homebridge-mqttthing
 * 
 * Manages shared MQTT connections across accessories.
 * Connections are pooled by broker configuration to avoid
 * creating multiple connections to the same broker.
 */

'use strict';

const mqtt = require('mqtt');
const fs = require('fs');

/**
 * Default broker name used when platform-level url/credentials are provided
 */
const DEFAULT_BROKER_NAME = 'default';

/**
 * MqttConnectionPool - Manages pooled MQTT connections
 */
class MqttConnectionPool {
    /**
     * @param {object} log - Homebridge logger
     * @param {object} platformConfig - Platform configuration
     */
    constructor(log, platformConfig) {
        this.log = log;
        this.platformConfig = platformConfig;
        
        // Map of broker name -> connection info
        this.brokers = new Map();
        
        // Map of broker name -> MQTT client
        this.connections = new Map();
        
        // Map of broker name -> dispatch handlers { topic -> [handlers] }
        this.dispatchers = new Map();
        
        // Map of broker name -> reference count
        this.refCounts = new Map();
        
        // Initialize brokers from config
        this._initializeBrokers();
    }

    /**
     * Initialize broker configurations from platform config
     */
    _initializeBrokers() {
        const config = this.platformConfig;
        
        // Option 1: Explicit brokers defined
        if (config.brokers && typeof config.brokers === 'object') {
            for (const [name, brokerConfig] of Object.entries(config.brokers)) {
                this.brokers.set(name, this._normalizeBrokerConfig(brokerConfig, name));
                this.log.debug(`Registered broker: ${name}`);
            }
        }
        
        // Option 2: Platform-level url (creates implicit 'default' broker)
        if (config.url || process.env.MQTTTHING_URL) {
            if (!this.brokers.has(DEFAULT_BROKER_NAME)) {
                const defaultBroker = this._normalizeBrokerConfig({
                    url: config.url,
                    username: config.username,
                    password: config.password,
                    mqttOptions: config.mqttOptions
                }, DEFAULT_BROKER_NAME);
                this.brokers.set(DEFAULT_BROKER_NAME, defaultBroker);
                this.log.debug(`Registered implicit default broker: ${defaultBroker.url}`);
            }
        }
        
        // Determine default broker
        this.defaultBrokerName = config.defaultBroker || DEFAULT_BROKER_NAME;
        
        // If no default set and we have brokers, use the first one
        if (!this.brokers.has(this.defaultBrokerName) && this.brokers.size > 0) {
            this.defaultBrokerName = this.brokers.keys().next().value;
            this.log.debug(`Using first broker as default: ${this.defaultBrokerName}`);
        }
        
        this.log.info(`MQTT Connection Pool initialized with ${this.brokers.size} broker(s)`);
        if (this.brokers.size > 0) {
            this.log.info(`Default broker: ${this.defaultBrokerName}`);
        } else {
            this.log.warn('No MQTT brokers configured! Accessories will fail to connect.');
            this.log.warn('Configure either platform-level "url" or "brokers" object in config.');
        }
    }

    /**
     * Normalize broker configuration with defaults
     */
    _normalizeBrokerConfig(config, name) {
        let url = config.url || process.env.MQTTTHING_URL;
        
        // Add protocol if missing
        if (url && !url.includes('://')) {
            url = 'mqtt://' + url;
        }
        
        return {
            name,
            url,
            username: config.username || process.env.MQTTTHING_USERNAME,
            password: config.password || process.env.MQTTTHING_PASSWORD,
            mqttOptions: config.mqttOptions || {},
            logMqtt: config.logMqtt
        };
    }

    /**
     * Get or create a broker configuration for per-accessory URL (backward compat)
     * @param {object} accessoryConfig - Accessory configuration
     * @returns {string} Broker name to use
     */
    getOrCreateBrokerForAccessory(accessoryConfig) {
        // 1. Explicit broker name specified - use that
        if (accessoryConfig.broker) {
            if (!this.brokers.has(accessoryConfig.broker)) {
                this.log.error(`Accessory "${accessoryConfig.name}" references unknown broker "${accessoryConfig.broker}"`);
                return null;
            }
            return accessoryConfig.broker;
        }
        
        // 2. Per-accessory URL specified - create ad-hoc broker for it (backward compat)
        if (accessoryConfig.url) {
            // Create a unique broker name based on the URL
            const brokerKey = `adhoc_${this._hashUrl(accessoryConfig.url)}`;
            
            if (!this.brokers.has(brokerKey)) {
                // Create ad-hoc broker config
                const adhocConfig = this._normalizeBrokerConfig({
                    url: accessoryConfig.url,
                    username: accessoryConfig.username,
                    password: accessoryConfig.password,
                    mqttOptions: accessoryConfig.mqttOptions,
                    logMqtt: accessoryConfig.logMqtt
                }, brokerKey);
                
                this.brokers.set(brokerKey, adhocConfig);
                this.log.debug(`Created ad-hoc broker "${brokerKey}" for accessory "${accessoryConfig.name}"`);
            }
            
            return brokerKey;
        }
        
        // 3. Use default broker
        if (this.brokers.has(this.defaultBrokerName)) {
            return this.defaultBrokerName;
        }
        
        // No broker available
        this.log.error(`No broker configured for accessory "${accessoryConfig.name}". Configure platform-level "url" or per-accessory "url".`);
        return null;
    }
    
    /**
     * Create a short hash of a URL for use as broker key
     */
    _hashUrl(url) {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    }

    /**
     * Get or create MQTT connection for an accessory
     * @param {string|object} brokerNameOrConfig - Broker name or accessory config for auto-detection
     * @param {string} accessoryName - Name of accessory (for logging)
     * @returns {object} Connection info { client, brokerName, dispatcher }
     */
    getConnection(brokerNameOrConfig, accessoryName) {
        let brokerName;
        
        // Handle accessory config object (auto-detect broker)
        if (typeof brokerNameOrConfig === 'object') {
            brokerName = this.getOrCreateBrokerForAccessory(brokerNameOrConfig);
            accessoryName = brokerNameOrConfig.name;
        } else {
            brokerName = brokerNameOrConfig;
        }
        
        // Use default broker if not specified
        if (!brokerName) {
            brokerName = this.defaultBrokerName;
        }
        
        if (!this.brokers.has(brokerName)) {
            throw new Error(`Unknown broker: ${brokerName}`);
        }
        
        // Create connection if it doesn't exist
        if (!this.connections.has(brokerName)) {
            this._createConnection(brokerName);
        }
        
        // Increment reference count
        const refCount = (this.refCounts.get(brokerName) || 0) + 1;
        this.refCounts.set(brokerName, refCount);
        
        this.log.debug(`Accessory "${accessoryName}" using broker "${brokerName}" (${refCount} refs)`);
        
        return {
            client: this.connections.get(brokerName),
            brokerName,
            brokerConfig: this.brokers.get(brokerName),
            // Dispatcher for this broker (handlers can add to this)
            dispatcher: this.dispatchers.get(brokerName)
        };
    }

    /**
     * Create a new MQTT connection
     */
    _createConnection(brokerName) {
        const brokerConfig = this.brokers.get(brokerName);
        
        this.log.info(`Creating MQTT connection to broker "${brokerName}": ${brokerConfig.url}`);
        
        // Initialize dispatch map for this broker
        const mqttDispatch = {};
        this.dispatchers.set(brokerName, mqttDispatch);
        
        // Build MQTT options
        const clientId = `mqttthing_${brokerName}_${Math.random().toString(16).substr(2, 8)}`;
        
        const options = {
            keepalive: 10,
            clientId,
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 30 * 1000,
            will: {
                topic: 'WillMsg',
                payload: `mqttthing broker [${brokerName}] disconnected`,
                qos: 0,
                retain: false
            },
            username: brokerConfig.username,
            password: brokerConfig.password,
            rejectUnauthorized: false,
            ...brokerConfig.mqttOptions
        };
        
        // Load certificate files if specified
        if (options.cafile) {
            options.ca = fs.readFileSync(options.cafile);
        }
        if (options.certfile) {
            options.cert = fs.readFileSync(options.certfile);
        }
        if (options.keyfile) {
            options.key = fs.readFileSync(options.keyfile);
        }
        
        // Handle insecure mode
        if (options.insecure) {
            options.checkServerIdentity = () => undefined;
        }
        
        // Log connection details (without password)
        if (brokerConfig.logMqtt || this.platformConfig.logMqtt) {
            this.log.info(`MQTT broker "${brokerName}" URL: ${brokerConfig.url}`);
            this.log.debug(`MQTT broker "${brokerName}" options: ${JSON.stringify(options, (k, v) => k === 'password' ? '***' : v)}`);
        }
        
        // Create MQTT client
        const mqttClient = mqtt.connect(brokerConfig.url, options);
        
        mqttClient.on('connect', () => {
            this.log.info(`MQTT broker "${brokerName}" connected`);
        });
        
        mqttClient.on('error', (err) => {
            this.log.error(`MQTT broker "${brokerName}" error: ${err}`);
        });
        
        mqttClient.on('offline', () => {
            this.log.warn(`MQTT broker "${brokerName}" offline`);
        });
        
        mqttClient.on('reconnect', () => {
            this.log.debug(`MQTT broker "${brokerName}" reconnecting...`);
        });
        
        mqttClient.on('message', (topic, message) => {
            if (brokerConfig.logMqtt || this.platformConfig.logMqtt) {
                this.log.debug(`MQTT [${brokerName}] received: ${topic} = ${message}`);
            }
            
            const handlers = mqttDispatch[topic];
            if (handlers) {
                for (const handler of handlers) {
                    try {
                        handler(topic, message);
                    } catch (ex) {
                        this.log.error(`MQTT handler error for topic "${topic}": ${ex}`);
                    }
                }
            }
        });
        
        this.connections.set(brokerName, mqttClient);
        this.refCounts.set(brokerName, 0);
        
        return mqttClient;
    }

    /**
     * Release a connection reference
     * @param {string} brokerName - Broker name
     * @param {string} accessoryName - Accessory name (for logging)
     */
    releaseConnection(brokerName, accessoryName) {
        if (!this.refCounts.has(brokerName)) return;
        
        const refCount = this.refCounts.get(brokerName) - 1;
        this.refCounts.set(brokerName, Math.max(0, refCount));
        
        this.log.debug(`Accessory "${accessoryName}" released broker "${brokerName}" (${refCount} refs remaining)`);
        
        // Note: We don't close connections when refCount hits 0
        // because accessories might be re-added. Connections are
        // only closed on shutdown.
    }

    /**
     * Subscribe to a topic on a specific broker
     * @param {string} brokerName - Broker name
     * @param {string} topic - MQTT topic
     * @param {function} handler - Message handler
     */
    subscribe(brokerName, topic, handler) {
        const mqttDispatch = this.dispatchers.get(brokerName);
        const mqttClient = this.connections.get(brokerName);
        
        if (!mqttDispatch || !mqttClient) {
            this.log.error(`Cannot subscribe: broker "${brokerName}" not connected`);
            return;
        }
        
        if (mqttDispatch[topic]) {
            // Add to existing handlers
            mqttDispatch[topic].push(handler);
        } else {
            // New topic - subscribe
            mqttDispatch[topic] = [handler];
            mqttClient.subscribe(topic, (err) => {
                if (err) {
                    this.log.error(`Failed to subscribe to "${topic}" on broker "${brokerName}": ${err}`);
                }
            });
        }
    }

    /**
     * Publish to a topic on a specific broker
     * @param {string} brokerName - Broker name
     * @param {string} topic - MQTT topic
     * @param {string} message - Message to publish
     * @param {object} options - Publish options
     */
    publish(brokerName, topic, message, options = {}) {
        const mqttClient = this.connections.get(brokerName);
        
        if (!mqttClient) {
            this.log.error(`Cannot publish: broker "${brokerName}" not connected`);
            return;
        }
        
        mqttClient.publish(topic, message, options);
    }

    /**
     * Shutdown all connections
     */
    shutdown() {
        this.log.info('Shutting down MQTT Connection Pool...');
        
        for (const [brokerName, mqttClient] of this.connections) {
            try {
                this.log.debug(`Closing connection to broker "${brokerName}"`);
                mqttClient.end(true);
            } catch (ex) {
                this.log.error(`Error closing broker "${brokerName}": ${ex}`);
            }
        }
        
        this.connections.clear();
        this.dispatchers.clear();
        this.refCounts.clear();
        
        this.log.info('MQTT Connection Pool shut down');
    }

    /**
     * Get statistics about the pool
     */
    getStats() {
        const stats = {
            brokerCount: this.brokers.size,
            activeConnections: this.connections.size,
            brokers: {}
        };
        
        for (const [name, config] of this.brokers) {
            stats.brokers[name] = {
                url: config.url,
                connected: this.connections.has(name),
                refCount: this.refCounts.get(name) || 0
            };
        }
        
        return stats;
    }
}

module.exports = MqttConnectionPool;
