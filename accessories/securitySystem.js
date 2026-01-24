/**
 * SecuritySystemAccessory - Security System accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class SecuritySystemAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.SECURITY_SYSTEM;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.SecuritySystem,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Security System Current State
        this.setupCurrentState(service);
        
        // Security System Target State
        this.setupTargetState(service);
        
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

    setupCurrentState(service) {
        const topics = this.config.topics || {};
        let values = this.config.currentStateValues;
        
        if (!values) {
            values = ['STAY_ARM', 'AWAY_ARM', 'NIGHT_ARM', 'DISARMED', 'ALARM_TRIGGERED'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'currentState', this.Characteristic.SecuritySystemCurrentState,
            null, topics.getCurrentState, values,
            this.Characteristic.SecuritySystemCurrentState.DISARMED
        );
    }

    setupTargetState(service) {
        const topics = this.config.topics || {};
        let values = this.config.targetStateValues;
        
        if (!values) {
            values = ['STAY_ARM', 'AWAY_ARM', 'NIGHT_ARM', 'DISARM'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'targetState', this.Characteristic.SecuritySystemTargetState,
            topics.setTargetState, topics.getTargetState, values,
            this.Characteristic.SecuritySystemTargetState.DISARM
        );
        
        // Restrict valid values if configured
        if (this.config.restrictTargetState) {
            const characteristic = service.getCharacteristic(this.Characteristic.SecuritySystemTargetState);
            characteristic.setProps({ validValues: this.config.restrictTargetState });
        }
    }
}

module.exports = {
    type: ACCESSORY_TYPES.SECURITY_SYSTEM,
    create: (platform, accessory, config) => new SecuritySystemAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new SecuritySystemAccessory(platform, accessory, config)
};
