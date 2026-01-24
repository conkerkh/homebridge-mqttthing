/**
 * LeakSensorAccessory - Leak Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class LeakSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.LEAK_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.LeakSensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Leak Detected characteristic
        this.charHelper.booleanCharacteristic(
            service, 'leakDetected', this.Characteristic.LeakDetected,
            null, topics.getLeakDetected, false,
            (val) => val ? 
                this.Characteristic.LeakDetected.LEAK_DETECTED : 
                this.Characteristic.LeakDetected.LEAK_NOT_DETECTED,
            null,
            this.config.resetStateAfterms
        );
        
        // Water Level (optional)
        if (topics.getWaterLevel) {
            this.charHelper.integerCharacteristic(
                service, 'waterLevel', this.Characteristic.WaterLevel,
                null, topics.getWaterLevel, { initialValue: 0, minValue: 0, maxValue: 100 }
            );
        }
        
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
    type: ACCESSORY_TYPES.LEAK_SENSOR,
    create: (platform, accessory, config) => new LeakSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new LeakSensorAccessory(platform, accessory, config)
};
