/**
 * Regression test: cached accessories must be initialized from the current
 * config.json entry, not from the stale copy in accessory.context.mqttthing.
 *
 * Run: node test/platform-restore.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');

// --- Stub the accessory factory so no MQTT/HAP is needed ---------------------
const accessoriesPath = require.resolve(path.join(__dirname, '..', 'accessories'));
const realAccessories = require(accessoriesPath);
const calls = { create: [], restore: [] };
const fakeWrapper = (kind) => (type, platform, accessory, config) => {
    calls[kind].push({ type, accessory, config });
    return { init: async () => {}, shutdown: () => {} };
};
require.cache[accessoriesPath].exports = {
    ...realAccessories,
    createAccessory: fakeWrapper('create'),
    restoreAccessory: fakeWrapper('restore')
};

const { MqttPlatform, PLUGIN_NAME } = require('../platform/mqttPlatform');

// --- Fake Homebridge API ------------------------------------------------------
function makeApi() {
    const api = new EventEmitter();
    api.hap = {
        Service: {},
        Characteristic: {},
        uuid: { generate: (s) => `uuid:${s}` }
    };
    api.user = { storagePath: () => '/tmp' };
    api.registered = [];
    api.unregistered = [];
    api.updated = [];
    api.registerPlatformAccessories = (p, n, accs) => api.registered.push(...accs);
    api.unregisterPlatformAccessories = (p, n, accs) => api.unregistered.push(...accs);
    api.updatePlatformAccessories = (accs) => api.updated.push(...accs);
    api.platformAccessory = class {
        constructor(displayName, UUID) {
            this.displayName = displayName;
            this.UUID = UUID;
            this.context = {};
        }
    };
    return api;
}

const log = Object.assign(() => {}, { info() {}, warn() {}, error() {}, debug() {} });

function cachedAccessory(api, config) {
    const acc = new api.platformAccessory(config.name, api.hap.uuid.generate(`${PLUGIN_NAME}-${config.name}`));
    acc.context.mqttthing = JSON.parse(JSON.stringify(config));
    return acc;
}

async function run(currentConfigs, cachedConfigs) {
    calls.create.length = 0;
    calls.restore.length = 0;
    const api = makeApi();
    const platform = new MqttPlatform(log, { accessories: currentConfigs }, api);
    const cached = cachedConfigs.map(c => cachedAccessory(api, c));
    cached.forEach(acc => platform.configureAccessory(acc));
    await platform.discoverAccessories();
    platform.mqttPool.shutdown();
    return { api, platform, cached };
}

(async () => {
    // 1. Edited value in config.json is picked up for a cached accessory
    {
        const cachedCfg = { name: 'PIR 2', type: 'motionSensor', logMqtt: false, topics: { getMotionDetected: 'old/topic' } };
        const currentCfg = { name: 'PIR 2', type: 'motionSensor', logMqtt: true, codec: 'zwave.js', topics: { getMotionDetected: 'new/topic' } };
        const { api, cached } = await run([currentCfg], [cachedCfg]);

        assert.strictEqual(calls.restore.length, 1, 'cached accessory restored once');
        assert.strictEqual(calls.create.length, 0, 'no new accessory created');
        const restored = calls.restore[0];
        assert.strictEqual(restored.accessory, cached[0], 'same PlatformAccessory (UUID preserved)');
        assert.strictEqual(restored.config, currentCfg, 'restored with current config.json entry');
        assert.strictEqual(restored.config.logMqtt, true);
        assert.strictEqual(restored.config.codec, 'zwave.js');
        assert.strictEqual(restored.config.topics.getMotionDetected, 'new/topic');
        assert.strictEqual(cached[0].context.mqttthing, currentCfg, 'context refreshed');
        assert.deepStrictEqual(api.updated, [cached[0]], 'updatePlatformAccessories called');
        assert.strictEqual(api.unregistered.length, 0);
        assert.strictEqual(api.registered.length, 0);
        console.log('ok 1 - edited config is applied to cached accessory');
    }

    // 2. Unchanged config: restored, no needless cache write
    {
        const cfg = { name: 'PIR 1 Light', type: 'lightSensor', topics: { getCurrentAmbientLightLevel: 'a/b' } };
        const { api } = await run([cfg], [cfg]);
        assert.strictEqual(calls.restore.length, 1);
        assert.strictEqual(api.updated.length, 0, 'no update when unchanged');
        console.log('ok 2 - unchanged config restores without cache update');
    }

    // 3. Type changed: cached accessory removed and recreated with same UUID
    {
        const cachedCfg = { name: 'Hall', type: 'switch', topics: {} };
        const currentCfg = { name: 'Hall', type: 'lightbulb', topics: {} };
        const { api, cached } = await run([currentCfg], [cachedCfg]);
        assert.strictEqual(calls.restore.length, 0, 'not restored with old type');
        assert.deepStrictEqual(api.unregistered, [cached[0]], 'old accessory unregistered');
        assert.strictEqual(calls.create.length, 1, 'recreated from config');
        assert.strictEqual(calls.create[0].config, currentCfg);
        assert.strictEqual(api.registered.length, 1);
        assert.strictEqual(api.registered[0].UUID, cached[0].UUID, 'UUID unchanged');
        assert.strictEqual(api.updated.length, 0);
        console.log('ok 3 - type change recreates accessory with same UUID');
    }

    // 4. Removed from config: unregistered, not recreated
    {
        const cachedCfg = { name: 'Gone', type: 'switch', topics: {} };
        const { api, cached } = await run([], [cachedCfg]);
        assert.deepStrictEqual(api.unregistered, [cached[0]]);
        assert.strictEqual(calls.restore.length + calls.create.length, 0);
        console.log('ok 4 - accessory removed from config is unregistered');
    }

    console.log('All platform restore tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
