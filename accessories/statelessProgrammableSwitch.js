/**
 * StatelessProgrammableSwitchAccessory - Stateless Programmable Switch accessory for homebridge-mqttthing
 */

'use strict';

const AbstractAccessory = require('./abstractAccessory');
const { ACCESSORY_TYPES } = require('../common/constants');

class StatelessProgrammableSwitchAccessory extends AbstractAccessory {
    get type() {
        return ACCESSORY_TYPES.STATELESS_PROGRAMMABLE_SWITCH;
    }

    createServices() {
        super.createServices();
        
        const topics = this.config.topics || {};
        const buttons = this.config.buttons || 1;
        
        // Create service label if multiple buttons
        if (buttons > 1) {
            const labelService = this.getOrCreateService(
                this.Service.ServiceLabel,
                this.config.name + '-label',
                'label'
            );
            
            // Set label namespace (dots or numerals)
            if (this.config.labelType === 'numerals') {
                labelService.setCharacteristic(
                    this.Characteristic.ServiceLabelNamespace,
                    this.Characteristic.ServiceLabelNamespace.ARABIC_NUMERALS
                );
            } else {
                labelService.setCharacteristic(
                    this.Characteristic.ServiceLabelNamespace,
                    this.Characteristic.ServiceLabelNamespace.DOTS
                );
            }
        }
        
        // Create switch services for each button
        for (let i = 0; i < buttons; i++) {
            this.createButtonService(i, topics);
        }
        
        return this.servicesList[0];
    }

    createButtonService(index, topics) {
        const subtype = `button-${index}`;
        const name = this.config.buttonNames?.[index] || `${this.config.name} Button ${index + 1}`;
        
        const service = this.getOrCreateService(
            this.Service.StatelessProgrammableSwitch,
            name,
            subtype
        );
        
        // Set service label index
        service.setCharacteristic(this.Characteristic.ServiceLabelIndex, index + 1);
        
        // Get topic for this button
        let getTopic;
        if (Array.isArray(topics.getSwitch)) {
            getTopic = topics.getSwitch[index];
        } else if (index === 0) {
            getTopic = topics.getSwitch;
        }
        
        // Get switch values
        let switchValues = this.config.switchValues;
        if (!switchValues) {
            switchValues = ['SINGLE_PRESS', 'DOUBLE_PRESS', 'LONG_PRESS'];
        }
        
        // Programmable Switch Event characteristic
        const charac = service.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent);
        
        // Restrict valid values if configured
        if (this.config.restrictSwitchValues) {
            charac.setProps({ validValues: this.config.restrictSwitchValues });
        }
        
        // MQTT subscription
        if (getTopic) {
            this.mqttSubscribe(getTopic, `switch-${index}`, (topic, message) => {
                const decoded = this.decodeMessage(`switch-${index}`, message).toString().toUpperCase();
                
                let eventValue = null;
                
                // Find matching value
                const valueIndex = switchValues.findIndex(v => 
                    v.toString().toUpperCase() === decoded
                );
                
                if (valueIndex !== -1) {
                    eventValue = valueIndex;
                } else {
                    // Try parsing as integer
                    const parsed = parseInt(decoded, 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed < switchValues.length) {
                        eventValue = parsed;
                    }
                }
                
                if (eventValue !== null) {
                    this.log.debug(`Button ${index} event: ${eventValue}`);
                    charac.updateValue(eventValue);
                }
            });
        }
        
        return service;
    }
}

module.exports = {
    type: ACCESSORY_TYPES.STATELESS_PROGRAMMABLE_SWITCH,
    create: (platform, accessory, config) => new StatelessProgrammableSwitchAccessory(platform, accessory, config),
    restore: (platform, accessory, config) => new StatelessProgrammableSwitchAccessory(platform, accessory, config)
};
