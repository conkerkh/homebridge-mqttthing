/**
 * SmokeSensorAccessory - Smoke Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class SmokeSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.SMOKE_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.SmokeSensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Smoke Detected characteristic
        this.charHelper.booleanCharacteristic(
            service, 'smokeDetected', this.Characteristic.SmokeDetected,
            null, topics.getSmokeDetected, false,
            (val) => val ? 
                this.Characteristic.SmokeDetected.SMOKE_DETECTED : 
                this.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
            null,
            this.config.resetStateAfterms
        );
        
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
    type: ACCESSORY_TYPES.SMOKE_SENSOR,
    create: (platform, accessory, config) => new SmokeSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new SmokeSensorAccessory(platform, accessory, config)
};
