/**
 * OccupancySensorAccessory - Occupancy Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class OccupancySensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.OCCUPANCY_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.OccupancySensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Occupancy Detected characteristic
        this.charHelper.booleanCharacteristic(
            service, 'occupancyDetected', this.Characteristic.OccupancyDetected,
            null, topics.getOccupancyDetected, false,
            (val) => val ? 
                this.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED : 
                this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
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
    type: ACCESSORY_TYPES.OCCUPANCY_SENSOR,
    create: (platform, accessory, config) => new OccupancySensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new OccupancySensorAccessory(platform, accessory, config)
};
