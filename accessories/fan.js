/**
 * FanAccessory - Fan accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class FanAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.FAN;
    }

    createServices() {
        super.createServices();
        
        // Use Fanv2 service for more features
        const service = this.getOrCreateService(
            this.Service.Fanv2,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Active (On/Off)
        this.charHelper.booleanCharacteristic(
            service, 'active', this.Characteristic.Active,
            topics.setOn, topics.getOn, false,
            (val) => val ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE,
            this.config.turnOffAfterms
        );
        
        // Rotation Speed (optional)
        if (topics.setRotationSpeed || topics.getRotationSpeed) {
            this.charHelper.floatCharacteristic(
                service, 'rotationSpeed', this.Characteristic.RotationSpeed,
                topics.setRotationSpeed, topics.getRotationSpeed, 100,
                { minValue: 0, maxValue: 100 }
            );
        }
        
        // Rotation Direction (optional)
        if (topics.setRotationDirection || topics.getRotationDirection) {
            this.charHelper.integerCharacteristic(
                service, 'rotationDirection', this.Characteristic.RotationDirection,
                topics.setRotationDirection, topics.getRotationDirection,
                { initialValue: this.Characteristic.RotationDirection.CLOCKWISE }
            );
        }
        
        // Current Fan State (optional)
        if (topics.getCurrentFanState) {
            let values = this.config.currentFanValues;
            if (!values) {
                values = ['INACTIVE', 'IDLE', 'BLOWING_AIR'];
            }
            this.charHelper.multiCharacteristic(
                service, 'currentFanState', this.Characteristic.CurrentFanState,
                null, topics.getCurrentFanState, values,
                this.Characteristic.CurrentFanState.INACTIVE
            );
        }
        
        // Target Fan State (optional)
        if (topics.setTargetFanState || topics.getTargetFanState) {
            let values = this.config.targetFanStateValues;
            if (!values) {
                values = ['MANUAL', 'AUTO'];
            }
            this.charHelper.multiCharacteristic(
                service, 'targetFanState', this.Characteristic.TargetFanState,
                topics.setTargetFanState, topics.getTargetFanState, values,
                this.Characteristic.TargetFanState.AUTO
            );
        }
        
        // Swing Mode (optional)
        if (topics.setSwingMode || topics.getSwingMode) {
            let values = this.config.swingModeValues;
            if (!values) {
                values = ['DISABLED', 'ENABLED'];
            }
            this.charHelper.multiCharacteristic(
                service, 'swingMode', this.Characteristic.SwingMode,
                topics.setSwingMode, topics.getSwingMode, values,
                this.Characteristic.SwingMode.SWING_DISABLED
            );
        }
        
        // Lock Physical Controls (optional)
        if (topics.setLockPhysicalControls || topics.getLockPhysicalControls) {
            let values = this.config.lockPhysicalControlsValues;
            if (!values) {
                values = ['DISABLED', 'ENABLED'];
            }
            this.charHelper.multiCharacteristic(
                service, 'lockPhysicalControls', this.Characteristic.LockPhysicalControls,
                topics.setLockPhysicalControls, topics.getLockPhysicalControls, values,
                this.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED
            );
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
}

module.exports = {
    type: ACCESSORY_TYPES.FAN,
    create: (platform, accessory, config) => new FanAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new FanAccessory(platform, accessory, config)
};
