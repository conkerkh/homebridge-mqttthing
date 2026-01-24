/**
 * ValveAccessory - Valve accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class ValveAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.VALVE;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.Valve,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // Active (On/Off)
        this.charHelper.booleanCharacteristic(
            service, 'active', this.Characteristic.Active,
            topics.setActive, topics.getActive, false,
            (val) => val ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE,
            this.config.turnOffAfterms
        );
        
        // In Use
        this.charHelper.booleanCharacteristic(
            service, 'inUse', this.Characteristic.InUse,
            null, topics.getInUse, false,
            (val) => val ? this.Characteristic.InUse.IN_USE : this.Characteristic.InUse.NOT_IN_USE
        );
        
        // Valve Type
        this.setupValveType(service);
        
        // Set Duration (optional)
        if (topics.setDuration || topics.getDuration || this.config.durationTimer) {
            this.setupSetDuration(service);
        }
        
        // Remaining Duration (optional)
        if (topics.getRemainingDuration || this.config.durationTimer) {
            this.setupRemainingDuration(service);
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

    setupValveType(service) {
        let valveType = this.Characteristic.ValveType.GENERIC_VALVE;
        
        if (this.config.valveType === 'sprinkler') {
            valveType = this.Characteristic.ValveType.IRRIGATION;
        } else if (this.config.valveType === 'shower') {
            valveType = this.Characteristic.ValveType.SHOWER_HEAD;
        } else if (this.config.valveType === 'faucet') {
            valveType = this.Characteristic.ValveType.WATER_FAUCET;
        }
        
        service.setCharacteristic(this.Characteristic.ValveType, valveType);
    }

    setupSetDuration(service) {
        const topics = this.config.topics || {};
        
        let initialValue = 1200; // 20 minutes default
        if (this.config.minDuration !== undefined && initialValue < this.config.minDuration) {
            initialValue = this.config.minDuration;
        } else if (this.config.maxDuration !== undefined && initialValue > this.config.maxDuration) {
            initialValue = this.config.maxDuration;
        }
        
        const options = {
            initialValue,
            minValue: this.config.minDuration || 0,
            maxValue: this.config.maxDuration || 3600
        };
        
        this.charHelper.integerCharacteristic(
            service, 'setDuration', this.Characteristic.SetDuration,
            topics.setDuration, topics.getDuration, options
        );
    }

    setupRemainingDuration(service) {
        const topics = this.config.topics || {};
        
        this.state.durationEndTime = Math.floor(Date.now() / 1000);
        
        const charac = service.addCharacteristic(this.Characteristic.RemainingDuration);
        
        charac.on('get', (callback) => {
            const remaining = this.getRemainingDuration();
            callback(null, remaining);
        });
        
        // Subscribe to remaining duration topic
        if (topics.getRemainingDuration) {
            this.mqttSubscribe(topics.getRemainingDuration, 'remainingDuration', (topic, message) => {
                const remainingDuration = parseInt(this.decodeMessage('remainingDuration', message), 10);
                if (!isNaN(remainingDuration)) {
                    this.state.durationEndTime = Math.floor(Date.now() / 1000) + remainingDuration;
                    charac.updateValue(remainingDuration);
                }
            });
        }
        
        // Setup duration timer if configured
        if (this.config.durationTimer) {
            this.setupDurationTimer(service, charac);
        }
    }

    getRemainingDuration() {
        const remaining = this.state.durationEndTime - Math.floor(Date.now() / 1000);
        return (this.state.inUse && remaining > 0) ? remaining : 0;
    }

    setupDurationTimer(service, remainingCharac) {
        let durationTimer = null;
        
        const activeCharac = service.getCharacteristic(this.Characteristic.Active);
        const inUseCharac = service.getCharacteristic(this.Characteristic.InUse);
        
        const timerFunc = () => {
            durationTimer = null;
            this.state.active = false;
            activeCharac.setValue(this.Characteristic.Active.INACTIVE, undefined, 'time expired');
        };
        
        inUseCharac.on('change', (obj) => {
            if (obj.newValue === this.Characteristic.InUse.IN_USE) {
                // Start timer
                const duration = this.state.setDuration || 1200;
                this.state.durationEndTime = Math.floor(Date.now() / 1000) + duration;
                
                if (durationTimer) {
                    this.timerManager.clearTimeout(durationTimer);
                }
                durationTimer = this.timerManager.setTimeout(timerFunc, duration * 1000);
            } else {
                // Stop timer
                if (durationTimer) {
                    this.timerManager.clearTimeout(durationTimer);
                    durationTimer = null;
                }
                this.state.durationEndTime = Math.floor(Date.now() / 1000);
            }
            remainingCharac.updateValue(this.getRemainingDuration());
        });
    }
}

module.exports = {
    type: ACCESSORY_TYPES.VALVE,
    create: (platform, accessory, config) => new ValveAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new ValveAccessory(platform, accessory, config)
};
