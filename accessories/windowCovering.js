/**
 * WindowCoveringAccessory - Window Covering (blinds/shades) accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class WindowCoveringAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.WINDOW_COVERING;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.WindowCovering,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Current Position
        this.setupCurrentPosition(service);
        
        // Target Position
        this.setupTargetPosition(service);
        
        // Position State
        this.setupPositionState(service);
        
        // Hold Position (optional)
        if (topics.setHoldPosition) {
            this.charHelper.booleanCharacteristic(
                service, 'holdPosition', this.Characteristic.HoldPosition,
                topics.setHoldPosition, null, false
            );
        }
        
        // Horizontal Tilt Angle (optional)
        if (topics.setTargetHorizontalTiltAngle || topics.getTargetHorizontalTiltAngle) {
            this.charHelper.integerCharacteristic(
                service, 'targetHorizontalTiltAngle', this.Characteristic.TargetHorizontalTiltAngle,
                topics.setTargetHorizontalTiltAngle, topics.getTargetHorizontalTiltAngle,
                { initialValue: 0, minValue: -90, maxValue: 90 }
            );
        }
        
        if (topics.getCurrentHorizontalTiltAngle) {
            this.charHelper.integerCharacteristic(
                service, 'currentHorizontalTiltAngle', this.Characteristic.CurrentHorizontalTiltAngle,
                null, topics.getCurrentHorizontalTiltAngle,
                { initialValue: 0, minValue: -90, maxValue: 90 }
            );
        }
        
        // Vertical Tilt Angle (optional)
        if (topics.setTargetVerticalTiltAngle || topics.getTargetVerticalTiltAngle) {
            this.charHelper.integerCharacteristic(
                service, 'targetVerticalTiltAngle', this.Characteristic.TargetVerticalTiltAngle,
                topics.setTargetVerticalTiltAngle, topics.getTargetVerticalTiltAngle,
                { initialValue: 0, minValue: -90, maxValue: 90 }
            );
        }
        
        if (topics.getCurrentVerticalTiltAngle) {
            this.charHelper.integerCharacteristic(
                service, 'currentVerticalTiltAngle', this.Characteristic.CurrentVerticalTiltAngle,
                null, topics.getCurrentVerticalTiltAngle,
                { initialValue: 0, minValue: -90, maxValue: 90 }
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

    setupCurrentPosition(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minPosition || 0;
        const maxValue = this.config.maxPosition || 100;
        
        this.charHelper.integerCharacteristic(
            service, 'currentPosition', this.Characteristic.CurrentPosition,
            null, topics.getCurrentPosition,
            { initialValue: minValue, minValue, maxValue }
        );
    }

    setupTargetPosition(service) {
        const topics = this.config.topics || {};
        const minValue = this.config.minPosition || 0;
        const maxValue = this.config.maxPosition || 100;
        
        this.charHelper.integerCharacteristic(
            service, 'targetPosition', this.Characteristic.TargetPosition,
            topics.setTargetPosition, topics.getTargetPosition,
            { initialValue: minValue, minValue, maxValue }
        );
    }

    setupPositionState(service) {
        const topics = this.config.topics || {};
        let values = this.config.positionStateValues;
        
        if (!values) {
            values = ['DECREASING', 'INCREASING', 'STOPPED'];
        }
        
        this.charHelper.multiCharacteristic(
            service, 'positionState', this.Characteristic.PositionState,
            null, topics.getPositionState, values,
            this.Characteristic.PositionState.STOPPED
        );
    }
}

module.exports = {
    type: ACCESSORY_TYPES.WINDOW_COVERING,
    create: (platform, accessory, config) => new WindowCoveringAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new WindowCoveringAccessory(platform, accessory, config)
};
