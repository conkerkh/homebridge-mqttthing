/**
 * HumiditySensorAccessory - Humidity Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class HumiditySensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.HUMIDITY_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.HumiditySensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Current Relative Humidity characteristic
        this.charHelper.floatCharacteristic(
            service, 'currentRelativeHumidity', this.Characteristic.CurrentRelativeHumidity,
            null, topics.getCurrentRelativeHumidity, 50, { minValue: 0, maxValue: 100 }
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
    type: ACCESSORY_TYPES.HUMIDITY_SENSOR,
    create: (platform, accessory, config) => new HumiditySensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new HumiditySensorAccessory(platform, accessory, config)
};
