/**
 * TemperatureSensorAccessory - Temperature Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class TemperatureSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.TEMPERATURE_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.TemperatureSensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Current Temperature characteristic
        const minValue = this.config.minTemperature !== undefined ? this.config.minTemperature : -40;
        const maxValue = this.config.maxTemperature !== undefined ? this.config.maxTemperature : 100;
        
        this.charHelper.floatCharacteristic(
            service, 'currentTemperature', this.Characteristic.CurrentTemperature,
            null, topics.getCurrentTemperature, 20, { minValue, maxValue }
        );
        
        // Set temperature display props
        const charac = service.getCharacteristic(this.Characteristic.CurrentTemperature);
        charac.setProps({ minValue, maxValue });
        
        // Add optional sensor characteristics
        this.addSensorOptionalCharacteristics(service);
        
        // Add name characteristic if topic provided
        if (topics.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, topics.getName, this.config.name
            );
        }
        
        return service;
    }
}

module.exports = {
    type: ACCESSORY_TYPES.TEMPERATURE_SENSOR,
    create: (platform, accessory, config) => new TemperatureSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new TemperatureSensorAccessory(platform, accessory, config)
};
