/**
 * Characteristic helper functions for homebridge-mqttthing
 * 
 * These helpers create and manage HomeKit characteristics with MQTT integration
 */

'use strict';

const { isDefined, toBoolean, toInteger, toFloat, clamp } = require('../common/utils');

/**
 * CharacteristicHelper - manages characteristic creation and MQTT binding
 */
class CharacteristicHelper {
    constructor(accessory) {
        this.accessory = accessory;
        this.log = accessory.log;
        this.config = accessory.config;
        this.state = accessory.state;
        this.Characteristic = accessory.Characteristic;
    }

    /**
     * Add a characteristic with getter callback
     */
    addCharacteristic(service, property, characteristic, initialValue, setCallback) {
        const charac = service.getCharacteristic(characteristic) || 
                       service.addCharacteristic(characteristic);
        
        this.state[property] = initialValue;

        charac.on('get', (callback) => {
            this.log.debug(`Getting '${property}': ${this.state[property]}`);
            callback(null, this.state[property]);
        });

        if (setCallback) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    this.state[property] = value;
                    setCallback(value);
                }
                callback();
            });
        }

        return charac;
    }

    /**
     * Create boolean characteristic with MQTT binding
     */
    booleanCharacteristic(service, property, characteristic, setTopic, getTopic, initialValue = false, mapFunc = null, turnOffAfterMs = null, resetStateAfterMs = null) {
        const charac = service.getCharacteristic(characteristic) ||
                       service.addCharacteristic(characteristic);

        // Initialize state
        this.state[property] = mapFunc ? mapFunc(initialValue) : initialValue;

        // Getter
        charac.on('get', (callback) => {
            const value = this.state[property];
            this.log.debug(`Getting '${property}': ${value}`);
            callback(null, value);
        });

        // Setter (if setTopic provided)
        if (setTopic) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    const publishValue = this.accessory.getOnOffValue(value);
                    this.accessory.mqttPublish(setTopic, property, publishValue);
                    
                    // Auto turn-off timer
                    if (turnOffAfterMs && value) {
                        this.accessory.timerManager.setTimeout(() => {
                            this.state[property] = mapFunc ? mapFunc(false) : false;
                            charac.updateValue(this.state[property]);
                        }, turnOffAfterMs);
                    }
                }
                callback();
            });
        }

        // MQTT subscription (if getTopic provided)
        if (getTopic) {
            this.accessory.mqttSubscribe(getTopic, property, (topic, message) => {
                const value = toBoolean(this.accessory.decodeMessage(property, message));
                const mappedValue = mapFunc ? mapFunc(value) : value;
                
                if (this.state[property] !== mappedValue) {
                    this.state[property] = mappedValue;
                    charac.updateValue(mappedValue);
                    this.log.debug(`MQTT: '${property}' updated to ${mappedValue}`);

                    // Reset state timer
                    if (resetStateAfterMs && value) {
                        this.accessory.timerManager.setTimeout(() => {
                            this.state[property] = mapFunc ? mapFunc(false) : false;
                            charac.updateValue(this.state[property]);
                        }, resetStateAfterMs);
                    }
                }
            });
        }

        return charac;
    }

    /**
     * Create integer characteristic with MQTT binding
     */
    integerCharacteristic(service, property, characteristic, setTopic, getTopic, options = {}) {
        const charac = service.getCharacteristic(characteristic) ||
                       service.addCharacteristic(characteristic);

        const { initialValue = 0, minValue, maxValue, minStep } = options;

        // Set props if provided (single call to avoid overwriting)
        const props = {};
        if (isDefined(minValue)) props.minValue = minValue;
        if (isDefined(maxValue)) props.maxValue = maxValue;
        if (isDefined(minStep)) props.minStep = minStep;
        if (Object.keys(props).length > 0) charac.setProps(props);

        // Initialize state
        this.state[property] = initialValue;

        // Getter
        charac.on('get', (callback) => {
            this.log.debug(`Getting '${property}': ${this.state[property]}`);
            callback(null, this.state[property]);
        });

        // Setter
        if (setTopic) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    this.state[property] = value;
                    this.accessory.mqttPublish(setTopic, property, value.toString());
                }
                callback();
            });
        }

        // MQTT subscription
        if (getTopic) {
            this.accessory.mqttSubscribe(getTopic, property, (topic, message) => {
                let value = toInteger(this.accessory.decodeMessage(property, message), this.state[property]);
                
                // Clamp to valid range
                if (isDefined(minValue) && isDefined(maxValue)) {
                    value = clamp(value, minValue, maxValue);
                }
                
                if (this.state[property] !== value) {
                    this.state[property] = value;
                    charac.updateValue(value);
                    this.log.debug(`MQTT: '${property}' updated to ${value}`);
                }
            });
        }

        return charac;
    }

    /**
     * Create float characteristic with MQTT binding
     */
    floatCharacteristic(service, property, characteristic, setTopic, getTopic, initialValue = 0, options = {}) {
        const charac = service.getCharacteristic(characteristic) ||
                       service.addCharacteristic(characteristic);

        const { minValue, maxValue, minStep } = options;

        // Set props if provided (single call to avoid overwriting)
        const props = {};
        if (isDefined(minValue)) props.minValue = minValue;
        if (isDefined(maxValue)) props.maxValue = maxValue;
        if (isDefined(minStep)) props.minStep = minStep;
        if (Object.keys(props).length > 0) charac.setProps(props);

        // Initialize state
        this.state[property] = initialValue;

        // Getter
        charac.on('get', (callback) => {
            this.log.debug(`Getting '${property}': ${this.state[property]}`);
            callback(null, this.state[property]);
        });

        // Setter
        if (setTopic) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    this.state[property] = value;
                    this.accessory.mqttPublish(setTopic, property, value.toString());
                }
                callback();
            });
        }

        // MQTT subscription
        if (getTopic) {
            this.accessory.mqttSubscribe(getTopic, property, (topic, message) => {
                let value = toFloat(this.accessory.decodeMessage(property, message), this.state[property]);
                
                // Clamp to valid range
                if (isDefined(minValue) && isDefined(maxValue)) {
                    value = clamp(value, minValue, maxValue);
                }
                
                if (this.state[property] !== value) {
                    this.state[property] = value;
                    charac.updateValue(value);
                    this.log.debug(`MQTT: '${property}' updated to ${value}`);
                }
            });
        }

        return charac;
    }

    /**
     * Create multi-value characteristic (enum-like) with MQTT binding
     */
    multiCharacteristic(service, property, characteristic, setTopic, getTopic, values, initialValue = null, noInitialGet = false) {
        const charac = service.getCharacteristic(characteristic) ||
                       service.addCharacteristic(characteristic);

        // Initialize state
        this.state[property] = initialValue !== null ? initialValue : 0;

        // Getter
        if (!noInitialGet) {
            charac.on('get', (callback) => {
                this.log.debug(`Getting '${property}': ${this.state[property]}`);
                callback(null, this.state[property]);
            });
        }

        // Setter
        if (setTopic) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    this.state[property] = value;
                    const publishValue = values[value] || value.toString();
                    this.accessory.mqttPublish(setTopic, property, publishValue);
                }
                callback();
            });
        }

        // MQTT subscription
        if (getTopic) {
            this.accessory.mqttSubscribe(getTopic, property, (topic, message) => {
                const decoded = this.accessory.decodeMessage(property, message);
                let value = this.state[property];

                // Try to find matching value in array
                if (Array.isArray(values)) {
                    const index = values.findIndex(v => 
                        v.toString().toLowerCase() === decoded.toString().toLowerCase()
                    );
                    if (index !== -1) {
                        value = index;
                    } else {
                        // Try parsing as integer
                        const parsed = parseInt(decoded, 10);
                        if (!isNaN(parsed) && parsed >= 0 && parsed < values.length) {
                            value = parsed;
                        }
                    }
                }

                if (this.state[property] !== value) {
                    this.state[property] = value;
                    charac.updateValue(value);
                    this.log.debug(`MQTT: '${property}' updated to ${value}`);
                }
            });
        }

        return charac;
    }

    /**
     * Create string characteristic with MQTT binding
     */
    stringCharacteristic(service, property, characteristic, setTopic, getTopic, initialValue = '') {
        const charac = service.getCharacteristic(characteristic) ||
                       service.addCharacteristic(characteristic);

        // Initialize state
        this.state[property] = initialValue;

        // Getter
        charac.on('get', (callback) => {
            this.log.debug(`Getting '${property}': ${this.state[property]}`);
            callback(null, this.state[property]);
        });

        // Setter
        if (setTopic) {
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.log.debug(`Setting '${property}' to ${value}`);
                    this.state[property] = value;
                    this.accessory.mqttPublish(setTopic, property, value);
                }
                callback();
            });
        }

        // MQTT subscription
        if (getTopic) {
            this.accessory.mqttSubscribe(getTopic, property, (topic, message) => {
                const value = this.accessory.decodeMessage(property, message).toString();
                
                if (this.state[property] !== value) {
                    this.state[property] = value;
                    charac.updateValue(value);
                    this.log.debug(`MQTT: '${property}' updated to ${value}`);
                }
            });
        }

        return charac;
    }
}

module.exports = CharacteristicHelper;
