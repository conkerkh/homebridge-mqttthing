/**
 * homebridge-mqttthing
 * 
 * A Homebridge plugin for MQTT-based accessories
 * 
 * Main entry point for the modular platform architecture
 */

'use strict';

const { MqttPlatform, PLATFORM_NAME, PLUGIN_NAME } = require('./platform/mqttPlatform');

/**
 * Homebridge plugin entry point
 * @param {object} homebridge - Homebridge API
 */
module.exports = function(homebridge) {
    // Register the dynamic platform
    homebridge.registerPlatform(
        PLUGIN_NAME,
        PLATFORM_NAME,
        MqttPlatform,
        true // dynamic platform
    );
};
