/**
 * Constants for homebridge-mqttthing
 */

'use strict';

// Accessory Types
const ACCESSORY_TYPES = {
    LIGHTBULB: 'lightbulb',
    SWITCH: 'switch',
    OUTLET: 'outlet',
    MOTION_SENSOR: 'motionSensor',
    OCCUPANCY_SENSOR: 'occupancySensor',
    LIGHT_SENSOR: 'lightSensor',
    TEMPERATURE_SENSOR: 'temperatureSensor',
    HUMIDITY_SENSOR: 'humiditySensor',
    AIR_QUALITY_SENSOR: 'airQualitySensor',
    CONTACT_SENSOR: 'contactSensor',
    DOORBELL: 'doorbell',
    SECURITY_SYSTEM: 'securitySystem',
    SMOKE_SENSOR: 'smokeSensor',
    CARBON_MONOXIDE_SENSOR: 'carbonMonoxideSensor',
    CARBON_DIOXIDE_SENSOR: 'carbonDioxideSensor',
    LEAK_SENSOR: 'leakSensor',
    GARAGE_DOOR_OPENER: 'garageDoorOpener',
    LOCK_MECHANISM: 'lockMechanism',
    FAN: 'fan',
    FAN_V2: 'fanv2',
    THERMOSTAT: 'thermostat',
    HEATER_COOLER: 'heaterCooler',
    HUMIDIFIER_DEHUMIDIFIER: 'humidifierDehumidifier',
    AIR_PURIFIER: 'airPurifier',
    WINDOW_COVERING: 'windowCovering',
    WINDOW: 'window',
    DOOR: 'door',
    TELEVISION: 'television',
    VALVE: 'valve',
    IRRIGATION_SYSTEM: 'irrigationSystem',
    STATELESS_PROGRAMMABLE_SWITCH: 'statelessProgrammableSwitch',
    BATTERY: 'battery',
    WEATHER_STATION: 'weatherStation',
    CUSTOM: 'custom'
};

// Default values for characteristics
const DEFAULTS = {
    BRIGHTNESS: 100,
    HUE: 0,
    SATURATION: 0,
    COLOR_TEMPERATURE: 140,
    POSITION: 0,
    VOLUME: 50
};

// Timing constants
const TIMING = {
    DEFAULT_TURN_OFF_DELAY: 0,
    DEFAULT_DEBOUNCE_RECV: 100,
    HISTORY_PERSIST_INTERVAL: 600000, // 10 minutes
    STATE_CHECK_INTERVAL: 30000 // 30 seconds
};

// MQTT QoS levels
const MQTT_QOS = {
    AT_MOST_ONCE: 0,
    AT_LEAST_ONCE: 1,
    EXACTLY_ONCE: 2
};

module.exports = {
    ACCESSORY_TYPES,
    DEFAULTS,
    TIMING,
    MQTT_QOS
};
