/**
 * OutletAccessory - Outlet accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class OutletAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.OUTLET;
    }

    createServices() {
        super.createServices();
        
        const service = this.getOrCreateService(
            this.Service.Outlet,
            this.config.name,
            this.config.subtype
        );
        
        const topics = this.config.topics || {};
        
        // On/Off characteristic
        this.charHelper.booleanCharacteristic(
            service, 'on', this.Characteristic.On,
            topics.setOn, topics.getOn, false, null,
            this.config.turnOffAfterms
        );
        
        // Outlet In Use
        if (topics.getInUse) {
            this.charHelper.booleanCharacteristic(
                service, 'outletInUse', this.Characteristic.OutletInUse,
                null, topics.getInUse, true
            );
        }
        
        // Eve energy characteristics (if supported)
        this.setupEveEnergyCharacteristics(service);
        
        // Add name characteristic if topic provided
        if (topics.getName) {
            this.charHelper.stringCharacteristic(
                service, 'name', this.Characteristic.Name,
                null, topics.getName, this.config.name
            );
        }
        
        return service;
    }

    /**
     * Setup Eve energy monitoring characteristics
     */
    setupEveEnergyCharacteristics(service) {
        const topics = this.config.topics || {};
        const Eve = this.platform.Eve;
        
        if (!Eve) return;
        
        // Current Consumption (Watts)
        if (topics.getWatts) {
            service.addOptionalCharacteristic(Eve.Characteristics.CurrentConsumption);
            this.charHelper.floatCharacteristic(
                service, 'currentConsumption', Eve.Characteristics.CurrentConsumption,
                null, topics.getWatts, 0
            );
        }
        
        // Voltage
        if (topics.getVolts) {
            service.addOptionalCharacteristic(Eve.Characteristics.Voltage);
            this.charHelper.floatCharacteristic(
                service, 'voltage', Eve.Characteristics.Voltage,
                null, topics.getVolts, 0, {
                    minValue: this.config.minVolts,
                    maxValue: this.config.maxVolts
                }
            );
        }
        
        // Electric Current (Amperes)
        if (topics.getAmperes) {
            service.addOptionalCharacteristic(Eve.Characteristics.ElectricCurrent);
            this.charHelper.floatCharacteristic(
                service, 'electricCurrent', Eve.Characteristics.ElectricCurrent,
                null, topics.getAmperes, 0
            );
        }
        
        // Total Consumption (kWh)
        if (topics.getTotalConsumption) {
            service.addOptionalCharacteristic(Eve.Characteristics.TotalConsumption);
            this.charHelper.floatCharacteristic(
                service, 'totalConsumption', Eve.Characteristics.TotalConsumption,
                null, topics.getTotalConsumption, 0
            );
        }
    }
}

module.exports = {
    type: ACCESSORY_TYPES.OUTLET,
    create: (platform, accessory, config) => new OutletAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new OutletAccessory(platform, accessory, config)
};
