/**
 * ContactSensorAccessory - Contact Sensor accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class ContactSensorAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.CONTACT_SENSOR;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.ContactSensor,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Contact Sensor State characteristic
        this.charHelper.booleanCharacteristic(
            service, 'contactSensorState', this.Characteristic.ContactSensorState,
            null, topics.getContactSensorState, false,
            (val) => val ? 
                this.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : 
                this.Characteristic.ContactSensorState.CONTACT_DETECTED,
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
    type: ACCESSORY_TYPES.CONTACT_SENSOR,
    create: (platform, accessory, config) => new ContactSensorAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new ContactSensorAccessory(platform, accessory, config)
};
