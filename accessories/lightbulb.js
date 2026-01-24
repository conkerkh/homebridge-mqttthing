/**
 * LightbulbAccessory - Lightbulb accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES, DEFAULTS } = require('../common/constants');
const { isDefined, toFloat, clamp } = require('../common/utils');

class LightbulbAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.LIGHTBULB;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.Lightbulb,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Determine lightbulb type based on topics
        if (topics.setHSV) {
            this.setupHSVLight(service);
        } else if (topics.setRGB || topics.setRGBW || topics.setRGBWW) {
            this.setupRGBLight(service);
        } else if (topics.setWhite) {
            this.setupWhiteLight(service);
        } else {
            this.setupBasicLight(service);
        }
        
        // Add name characteristic if topic provided
        if (topics.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, topics.getName, this.config.name
            );
        }
        
        return service;
    }

    /**
     * Setup basic on/off and brightness light
     */
    setupBasicLight(service) {
        const topics = this.config.topics || {};
        
        // On/Off - required if setOn topic or no brightness topic
        if (topics.setOn || !topics.setBrightness) {
            this.charHelper.booleanCharacteristic(
                service, 'on', this.Characteristic.On,
                topics.setOn, topics.getOn, false, null,
                this.config.turnOffAfterms
            );
        }
        
        // Brightness
        if (topics.setBrightness) {
            this.setupBrightness(service);
        }
        
        // Hue
        if (topics.setHue) {
            this.charHelper.floatCharacteristic(
                service, 'hue', this.Characteristic.Hue,
                topics.setHue, topics.getHue, 0, { minValue: 0, maxValue: 360 }
            );
        }
        
        // Saturation
        if (topics.setSaturation) {
            this.charHelper.floatCharacteristic(
                service, 'saturation', this.Characteristic.Saturation,
                topics.setSaturation, topics.getSaturation, 0, { minValue: 0, maxValue: 100 }
            );
        }
        
        // Color Temperature
        if (topics.setColorTemperature) {
            this.setupColorTemperature(service);
        }
    }

    /**
     * Setup HSV light (combined Hue/Saturation/Value)
     */
    setupHSVLight(service) {
        const topics = this.config.topics || {};
        
        // Initialize HSV state
        this.state.hsvValue = { h: 0, s: 0, v: 100 };
        
        // On characteristic
        const onCharac = service.getCharacteristic(this.Characteristic.On);
        onCharac.on('get', (callback) => {
            callback(null, this.state.hsvValue.v > 0);
        });
        onCharac.on('set', (value, callback, context) => {
            if (context !== 'mqttRx') {
                if (!value) {
                    this.state.hsvValue.v = 0;
                } else if (this.state.hsvValue.v === 0) {
                    this.state.hsvValue.v = 100;
                }
                this.publishHSV();
            }
            callback();
        });
        
        // Hue
        const hueCharac = service.addCharacteristic(this.Characteristic.Hue);
        hueCharac.on('get', (callback) => callback(null, this.state.hsvValue.h));
        hueCharac.on('set', (value, callback, context) => {
            if (context !== 'mqttRx') {
                this.state.hsvValue.h = value;
                this.publishHSV();
            }
            callback();
        });
        
        // Saturation
        const satCharac = service.addCharacteristic(this.Characteristic.Saturation);
        satCharac.on('get', (callback) => callback(null, this.state.hsvValue.s));
        satCharac.on('set', (value, callback, context) => {
            if (context !== 'mqttRx') {
                this.state.hsvValue.s = value;
                this.publishHSV();
            }
            callback();
        });
        
        // Brightness (Value in HSV)
        const brightCharac = service.addCharacteristic(this.Characteristic.Brightness);
        brightCharac.on('get', (callback) => callback(null, this.state.hsvValue.v));
        brightCharac.on('set', (value, callback, context) => {
            if (context !== 'mqttRx') {
                this.state.hsvValue.v = value;
                this.publishHSV();
            }
            callback();
        });
        
        // Subscribe to HSV topic
        if (topics.getHSV) {
            this.mqttSubscribe(topics.getHSV, 'hsv', (topic, message) => {
                this.handleHSVMessage(message, service);
            });
        }
    }

    /**
     * Publish HSV value
     */
    publishHSV() {
        const { h, s, v } = this.state.hsvValue;
        const hsvString = `${h},${s},${v}`;
        this.mqttPublish(this.config.topics.setHSV, 'hsv', hsvString);
    }

    /**
     * Handle incoming HSV message
     */
    handleHSVMessage(message, service) {
        const decoded = this.decodeMessage('hsv', message);
        const parts = decoded.toString().split(',');
        
        if (parts.length >= 3) {
            this.state.hsvValue.h = parseFloat(parts[0]) || 0;
            this.state.hsvValue.s = parseFloat(parts[1]) || 0;
            this.state.hsvValue.v = parseFloat(parts[2]) || 0;
            
            service.updateCharacteristic(this.Characteristic.On, this.state.hsvValue.v > 0);
            service.updateCharacteristic(this.Characteristic.Hue, this.state.hsvValue.h);
            service.updateCharacteristic(this.Characteristic.Saturation, this.state.hsvValue.s);
            service.updateCharacteristic(this.Characteristic.Brightness, this.state.hsvValue.v);
        }
    }

    /**
     * Setup RGB/RGBW/RGBWW light
     */
    setupRGBLight(service) {
        const topics = this.config.topics || {};
        
        // Initialize RGB state
        this.state.rgbValue = { r: 255, g: 255, b: 255, w: 0, ww: 0 };
        this.state.on = true;
        this.state.brightness = 100;
        this.state.hue = 0;
        this.state.saturation = 0;
        
        // On characteristic
        this.charHelper.booleanCharacteristic(
            service, 'on', this.Characteristic.On,
            null, null, true
        );
        
        // Add color characteristics
        this.charHelper.floatCharacteristic(
            service, 'hue', this.Characteristic.Hue,
            null, null, 0, { minValue: 0, maxValue: 360 }
        );
        
        this.charHelper.floatCharacteristic(
            service, 'saturation', this.Characteristic.Saturation,
            null, null, 0, { minValue: 0, maxValue: 100 }
        );
        
        this.charHelper.integerCharacteristic(
            service, 'brightness', this.Characteristic.Brightness,
            null, null, { initialValue: 100, minValue: 0, maxValue: 100 }
        );
        
        // Color temperature if supported
        if (topics.setRGBWW) {
            this.setupColorTemperature(service);
        }
        
        // Subscribe to RGB topic
        const getTopic = topics.getRGB || topics.getRGBW || topics.getRGBWW;
        if (getTopic) {
            this.mqttSubscribe(getTopic, 'rgb', (topic, message) => {
                this.handleRGBMessage(message, service);
            });
        }
    }

    /**
     * Handle incoming RGB message
     */
    handleRGBMessage(message, service) {
        const decoded = this.decodeMessage('rgb', message);
        // Parse RGB hex or comma-separated values
        // Implementation depends on format
        this.log.debug(`RGB message received: ${decoded}`);
    }

    /**
     * Setup white-only light
     */
    setupWhiteLight(service) {
        const topics = this.config.topics || {};
        
        // On characteristic based on brightness
        const onCharac = service.getCharacteristic(this.Characteristic.On);
        this.state.brightness = 100;
        this.state.on = true;
        
        onCharac.on('get', (callback) => callback(null, this.state.on));
        onCharac.on('set', (value, callback, context) => {
            if (context !== 'mqttRx') {
                this.state.on = value;
                this.publishWhite();
            }
            callback();
        });
        
        // Brightness
        this.setupBrightness(service, () => this.publishWhite());
    }

    /**
     * Publish white value
     */
    publishWhite() {
        const value = this.state.on ? this.state.brightness : 0;
        this.mqttPublish(this.config.topics.setWhite, 'white', value.toString());
    }

    /**
     * Setup brightness characteristic
     */
    setupBrightness(service, onChange = null) {
        const topics = this.config.topics || {};
        
        const options = {
            initialValue: DEFAULTS.BRIGHTNESS,
            minValue: 0,
            maxValue: 100
        };
        
        if (onChange) {
            // Custom onChange handler
            const charac = service.addCharacteristic(this.Characteristic.Brightness);
            charac.on('get', (callback) => callback(null, this.state.brightness));
            charac.on('set', (value, callback, context) => {
                if (context !== 'mqttRx') {
                    this.state.brightness = value;
                    onChange();
                }
                callback();
            });
            
            if (topics.getBrightness) {
                this.mqttSubscribe(topics.getBrightness, 'brightness', (topic, message) => {
                    const value = parseInt(this.decodeMessage('brightness', message), 10);
                    if (!isNaN(value)) {
                        this.state.brightness = clamp(value, 0, 100);
                        charac.updateValue(this.state.brightness);
                    }
                });
            }
        } else {
            this.charHelper.integerCharacteristic(
                service, 'brightness', this.Characteristic.Brightness,
                topics.setBrightness, topics.getBrightness, options
            );
        }
    }

    /**
     * Setup color temperature characteristic
     */
    setupColorTemperature(service) {
        const topics = this.config.topics || {};
        
        const minValue = this.config.minColorTemperature || 140;
        const maxValue = this.config.maxColorTemperature || 500;
        
        this.charHelper.integerCharacteristic(
            service, 'colorTemperature', this.Characteristic.ColorTemperature,
            topics.setColorTemperature, topics.getColorTemperature,
            { initialValue: minValue, minValue, maxValue }
        );
    }
}

module.exports = {
    type: ACCESSORY_TYPES.LIGHTBULB,
    create: (platform, accessory, config) => new LightbulbAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new LightbulbAccessory(platform, accessory, config)
};
