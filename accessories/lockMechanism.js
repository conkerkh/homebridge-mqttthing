/**
 * LockMechanismAccessory - Lock Mechanism accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class LockMechanismAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.LOCK_MECHANISM;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.LockMechanism,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Lock Current State
        this.setupLockCurrentState(service);
        
        // Lock Target State
        this.setupLockTargetState(service);
        
        // Add name characteristic if topic provided
        if (topics.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, topics.getName, this.config.name
            );
        }
        
        return service;
    }

    setupLockCurrentState(service) {
        const topics = this.config.topics || {};
        let values = this.config.lockValues;
        
        if (!values) {
            values = ['UNSECURED', 'SECURED', 'JAMMED', 'UNKNOWN'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'lockCurrentState', this.Characteristic.LockCurrentState,
            null, topics.getLockCurrentState, values,
            this.Characteristic.LockCurrentState.UNSECURED
        );
    }

    setupLockTargetState(service) {
        const topics = this.config.topics || {};
        let values = this.config.lockValues;
        
        if (!values) {
            values = ['UNSECURED', 'SECURED'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'lockTargetState', this.Characteristic.LockTargetState,
            topics.setLockTargetState, topics.getLockTargetState, values,
            this.Characteristic.LockTargetState.UNSECURED
        );
    }
}

module.exports = {
    type: ACCESSORY_TYPES.LOCK_MECHANISM,
    create: (platform, accessory, config) => new LockMechanismAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new LockMechanismAccessory(platform, accessory, config)
};
