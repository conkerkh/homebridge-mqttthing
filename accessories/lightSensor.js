/**
 * LightSensorAccessory - Light Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class LightSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.LIGHT_SENSOR;
    }

    createServices() {
        super.createServices();

        const service = this.getOrCreateService(
            this.Service.LightSensor,
            this.config.name,
            this.config.subtype
        );

        const topics = this.config.topics || {};

        // Current Ambient Light Level characteristic (lux, 0.0001 to 100000)
        this.charHelper.floatCharacteristic(
            service, 'currentAmbientLightLevel', this.Characteristic.CurrentAmbientLightLevel,
            null, topics.getCurrentAmbientLightLevel, 0.0001, { minValue: 0.0001, maxValue: 100000 }
        );

        // Add optional sensor characteristics (StatusActive, StatusFault, StatusTampered, StatusLowBattery)
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
    type: ACCESSORY_TYPES.LIGHT_SENSOR,
    create: (platform, accessory, config) => new LightSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new LightSensorAccessory(platform, accessory, config)
};
