/**
 * GarageDoorOpenerAccessory - Garage Door Opener accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class GarageDoorOpenerAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.GARAGE_DOOR_OPENER;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.GarageDoorOpener,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Current Door State
        this.setupCurrentDoorState(service);
        
        // Target Door State
        this.setupTargetDoorState(service);
        
        // Obstruction Detected
        if (topics.getObstructionDetected) {
            this.charHelper.booleanCharacteristic(
                service, 'obstructionDetected', this.Characteristic.ObstructionDetected,
                null, topics.getObstructionDetected, false
            );
        }
        
        // Lock Current State (optional)
        if (topics.getLockCurrentState) {
            this.setupLockCurrentState(service);
        }
        
        // Lock Target State (optional)
        if (topics.setLockTargetState || topics.getLockTargetState) {
            this.setupLockTargetState(service);
        }
        
        // Add name characteristic if topic provided
        if (topics.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, topics.getName, this.config.name
            );
        }
        
        return service;
    }

    setupCurrentDoorState(service) {
        const topics = this.config.topics || {};
        let values = this.config.doorCurrentValues || this.config.doorValues;
        
        if (!values) {
            values = ['OPEN', 'CLOSED', 'OPENING', 'CLOSING', 'STOPPED'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'currentDoorState', this.Characteristic.CurrentDoorState,
            null, topics.getCurrentDoorState, values,
            this.Characteristic.CurrentDoorState.CLOSED
        );
    }

    setupTargetDoorState(service) {
        const topics = this.config.topics || {};
        let values = this.config.doorTargetValues || this.config.doorValues;
        
        if (!values) {
            values = ['OPEN', 'CLOSED'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'targetDoorState', this.Characteristic.TargetDoorState,
            topics.setTargetDoorState, topics.getTargetDoorState, values,
            this.Characteristic.TargetDoorState.CLOSED
        );
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
    type: ACCESSORY_TYPES.GARAGE_DOOR_OPENER,
    create: (platform, accessory, config) => new GarageDoorOpenerAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new GarageDoorOpenerAccessory(platform, accessory, config)
};
