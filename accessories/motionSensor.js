/**
 * MotionSensorAccessory - Motion Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class MotionSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.MOTION_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.MotionSensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Motion Detected characteristic
        this.charHelper.booleanCharacteristic(
            service, 'motionDetected', this.Characteristic.MotionDetected,
            null, topics.getMotionDetected, false, null, null,
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
    type: ACCESSORY_TYPES.MOTION_SENSOR,
    create: (platform, accessory, config) => new MotionSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new MotionSensorAccessory(platform, accessory, config)
};
