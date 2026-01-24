/**
 * ThermostatAccessory - Thermostat accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class ThermostatAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.THERMOSTAT;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.Thermostat,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Current Heating/Cooling State
        this.setupCurrentHeatingCoolingState(service);
        
        // Target Heating/Cooling State
        this.setupTargetHeatingCoolingState(service);
        
        // Current Temperature
        this.setupCurrentTemperature(service);
        
        // Target Temperature
        this.setupTargetTemperature(service);
        
        // Temperature Display Units
        this.setupTemperatureDisplayUnits(service);
        
        // Optional: Current Relative Humidity
        if (topics.getCurrentRelativeHumidity) {
            this.charHelper.floatCharacteristic(
                service, 'currentRelativeHumidity', this.Characteristic.CurrentRelativeHumidity,
                null, topics.getCurrentRelativeHumidity, 50, { minValue: 0, maxValue: 100 }
            );
        }
        
        // Optional: Target Relative Humidity
        if (topics.setTargetRelativeHumidity || topics.getTargetRelativeHumidity) {
            this.charHelper.floatCharacteristic(
                service, 'targetRelativeHumidity', this.Characteristic.TargetRelativeHumidity,
                topics.setTargetRelativeHumidity, topics.getTargetRelativeHumidity, 50,
                { minValue: 0, maxValue: 100 }
            );
        }
        
        // Optional: Cooling/Heating Threshold Temperatures
        if (topics.setCoolingThresholdTemperature || topics.getCoolingThresholdTemperature) {
            this.setupCoolingThresholdTemperature(service);
        }
        
        if (topics.setHeatingThresholdTemperature || topics.getHeatingThresholdTemperature) {
            this.setupHeatingThresholdTemperature(service);
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

    setupCurrentHeatingCoolingState(service) {
        const topics = this.config.topics || {};
        let values = this.config.heatingCoolingStateValues;
        
        if (!values) {
            values = ['OFF', 'HEAT', 'COOL'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'currentHeatingCoolingState', this.Characteristic.CurrentHeatingCoolingState,
            null, topics.getCurrentHeatingCoolingState, values,
            this.Characteristic.CurrentHeatingCoolingState.OFF
        );
    }

    setupTargetHeatingCoolingState(service) {
        const topics = this.config.topics || {};
        let values = this.config.heatingCoolingStateValues;
        
        if (!values) {
            values = ['OFF', 'HEAT', 'COOL', 'AUTO'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'targetHeatingCoolingState', this.Characteristic.TargetHeatingCoolingState,
            topics.setTargetHeatingCoolingState, topics.getTargetHeatingCoolingState, values,
            this.Characteristic.TargetHeatingCoolingState.OFF
        );
        
        // Restrict valid values if configured
        if (this.config.restrictHeatingCoolingState) {
            const characteristic = service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState);
            characteristic.setProps({ validValues: this.config.restrictHeatingCoolingState });
        }
    }

    setupCurrentTemperature(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minTemperature !== undefined ? this.config.minTemperature : 0;
        const maxValue = this.config.maxTemperature !== undefined ? this.config.maxTemperature : 40;
        
        this.charHelper.floatCharacteristic(
            service, 'currentTemperature', this.Characteristic.CurrentTemperature,
            null, topics.getCurrentTemperature, 20, { minValue, maxValue }
        );
    }

    setupTargetTemperature(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minTargetTemperature !== undefined ? this.config.minTargetTemperature : 10;
        const maxValue = this.config.maxTargetTemperature !== undefined ? this.config.maxTargetTemperature : 38;
        const minStep = this.config.temperatureStep || 0.5;
        
        this.charHelper.floatCharacteristic(
            service, 'targetTemperature', this.Characteristic.TargetTemperature,
            topics.setTargetTemperature, topics.getTargetTemperature, 20,
            { minValue, maxValue, minStep }
        );
    }

    setupTemperatureDisplayUnits(service) {
        const topics = this.config.topics || {};
        let values = this.config.temperatureDisplayUnitsValues;
        
        if (!values) {
            values = ['CELSIUS', 'FAHRENHEIT'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'temperatureDisplayUnits', this.Characteristic.TemperatureDisplayUnits,
            topics.setTemperatureDisplayUnits, topics.getTemperatureDisplayUnits, values,
            this.Characteristic.TemperatureDisplayUnits.CELSIUS
        );
    }

    setupCoolingThresholdTemperature(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minCoolingThreshold !== undefined ? this.config.minCoolingThreshold : 10;
        const maxValue = this.config.maxCoolingThreshold !== undefined ? this.config.maxCoolingThreshold : 35;
        
        this.charHelper.floatCharacteristic(
            service, 'coolingThresholdTemperature', this.Characteristic.CoolingThresholdTemperature,
            topics.setCoolingThresholdTemperature, topics.getCoolingThresholdTemperature, 26,
            { minValue, maxValue }
        );
    }

    setupHeatingThresholdTemperature(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minHeatingThreshold !== undefined ? this.config.minHeatingThreshold : 0;
        const maxValue = this.config.maxHeatingThreshold !== undefined ? this.config.maxHeatingThreshold : 25;
        
        this.charHelper.floatCharacteristic(
            service, 'heatingThresholdTemperature', this.Characteristic.HeatingThresholdTemperature,
            topics.setHeatingThresholdTemperature, topics.getHeatingThresholdTemperature, 18,
            { minValue, maxValue }
        );
    }
}

module.exports = {
    type: ACCESSORY_TYPES.THERMOSTAT,
    create: (platform, accessory, config) => new ThermostatAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new ThermostatAccessory(platform, accessory, config)
};
