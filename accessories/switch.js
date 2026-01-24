/**
 * SwitchAccessory - Switch accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class SwitchAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.SWITCH;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.Switch,
            this.config.name,
            this.config.subtype
        );
        
        this.setupOnCharacteristic(service);
        
        // Add name characteristic if topic provided
        if (this.config.topics?.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, this.config.topics.getName, this.config.name
            );
        }
        
        // Add optional sensor characteristics
        this.addSensorOptionalCharacteristics(service);
        
        return service;
    }

    setupOnCharacteristic(service) {
        const topics = this.config.topics || {};
        
        this.charHelper.booleanCharacteristic(
            service,
            'on',
            this.Characteristic.On,
            topics.setOn,
            topics.getOn,
            false,
            null,
            this.config.turnOffAfterms
        );
    }
}

module.exports = {
    type: ACCESSORY_TYPES.SWITCH,
    create: (platform, accessory, config) => new SwitchAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new SwitchAccessory(platform, accessory, config)
};
