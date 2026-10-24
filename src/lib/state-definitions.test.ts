import { expect } from 'chai';
import { DreoDevice, DreoFan, DreoHeater } from 'dreo-client';
import type { DreoRawDevice } from 'dreo-client';
import { getStateDefinitions, type StateDefinition } from './state-definitions';

/** Roles from https://www.iobroker.net/#en/documentation/dev/stateroles.md used by this adapter */
const KNOWN_ROLES = [
    'switch',
    'switch.power',
    'indicator.reachable',
    'indicator.alarm',
    'text',
    'value.temperature',
    'level',
    'level.temperature',
    'level.timer',
    'level.mode.airconditioner',
    'level.mode.fan',
];

function rawDevice(model: string, reported: Record<string, unknown> = {}): DreoRawDevice {
    return { sn: 'SN123', model, deviceName: 'Test device', reported };
}

function byId(definitions: StateDefinition[], id: string): StateDefinition {
    const definition = definitions.find(d => d.id === id);
    expect(definition, `state ${id}`).to.not.equal(undefined);
    return definition!;
}

describe('state-definitions', () => {
    const sentCommands: Record<string, unknown>[] = [];
    const transport = async (params: Record<string, unknown>): Promise<void> => {
        sentCommands.push(params);
        await Promise.resolve();
    };

    beforeEach(() => {
        sentCommands.length = 0;
    });

    const devices = {
        heater: new DreoHeater(rawDevice('DR-HSH004'), transport),
        fan: new DreoFan(rawDevice('DR-HTF001'), transport),
        generic: new DreoDevice(rawDevice('DR-UNKNOWN'), transport),
    };

    for (const [type, device] of Object.entries(devices)) {
        describe(type, () => {
            const definitions = getStateDefinitions(device, 'celsius');

            it('uses only known state roles', () => {
                for (const definition of definitions) {
                    expect(KNOWN_ROLES, definition.id).to.include(definition.common.role);
                }
            });

            it('provides a setter exactly for writable states', () => {
                for (const definition of definitions) {
                    expect(typeof definition.set === 'function', definition.id).to.equal(definition.common.write);
                }
            });

            it('has unique state IDs', () => {
                const ids = definitions.map(d => d.id);
                expect(new Set(ids).size).to.equal(ids.length);
            });
        });
    }

    it('creates only common states for unknown devices', () => {
        const ids = getStateDefinitions(devices.generic, 'celsius').map(d => d.id);
        expect(ids).to.have.members(['power', 'info.online', 'info.model', 'info.name', 'info.product']);
    });

    it('creates heater states', () => {
        const ids = getStateDefinitions(devices.heater, 'celsius').map(d => d.id);
        expect(ids).to.include.members([
            'temperature',
            'targetTemperature',
            'mode',
            'heatLevel',
            'oscillation',
            'childLock',
            'timer',
            'tippedOver',
        ]);
    });

    it('creates fan states', () => {
        const ids = getStateDefinitions(devices.fan, 'celsius').map(d => d.id);
        expect(ids).to.include.members(['speed', 'oscillation', 'verticalOscillation', 'windType']);
    });

    describe('temperature unit handling', () => {
        const heater = new DreoHeater(rawDevice('DR-HSH004', { temperature: 20, target_temp: 22 }), transport);

        it('uses °C for celsius', () => {
            const definitions = getStateDefinitions(heater, 'celsius');
            const temperature = byId(definitions, 'temperature');
            const target = byId(definitions, 'targetTemperature');
            expect(temperature.common.unit).to.equal('°C');
            expect(temperature.get()).to.equal(20);
            expect(target.get()).to.equal(22);
            expect(target.common.min).to.equal(5);
            expect(target.common.max).to.equal(35);
        });

        it('uses °F for fahrenheit', () => {
            const definitions = getStateDefinitions(heater, 'fahrenheit');
            const temperature = byId(definitions, 'temperature');
            const target = byId(definitions, 'targetTemperature');
            expect(temperature.common.unit).to.equal('°F');
            expect(temperature.get()).to.equal(68);
            expect(target.get()).to.equal(72);
            expect(target.common.min).to.equal(41);
            expect(target.common.max).to.equal(95);
        });

        it('sends the target temperature in the configured unit', async () => {
            const target = byId(getStateDefinitions(heater, 'fahrenheit'), 'targetTemperature');
            await target.set!(68);
            expect(sentCommands).to.have.length(1);
            expect(sentCommands[0]).to.include({ ecolevel: 68, target_temp: 20, temp_unit: 'fahrenheit' });
        });
    });

    describe('device information', () => {
        function infoValue(raw: Record<string, unknown>, id: string): unknown {
            const device = new DreoDevice({ ...rawDevice('DR-HSH006S'), ...raw }, transport);
            return byId(getStateDefinitions(device, 'celsius'), id).get();
        }

        it('builds the product name from brand and series', () => {
            expect(infoValue({ brand: 'Dreo', seriesName: '316S', productName: 'Heater' }, 'info.product')).to.equal(
                'Dreo 316S',
            );
        });

        it('falls back to the product name without series', () => {
            expect(infoValue({ brand: 'Dreo', productName: 'Heater' }, 'info.product')).to.equal('Heater');
        });

        it('falls back to the model without series and product name', () => {
            expect(infoValue({}, 'info.product')).to.equal('DR-HSH006S');
        });

        it('reports online from the connected state', () => {
            expect(infoValue({ reported: { connected: true } }, 'info.online')).to.equal(true);
            expect(infoValue({ reported: { connected: false } }, 'info.online')).to.equal(false);
        });

        it('falls back to the device list online flag', () => {
            expect(infoValue({ online: false }, 'info.online')).to.equal(false);
            expect(infoValue({}, 'info.online')).to.equal(true);
        });
    });

    it('passes converted values to device commands', async () => {
        const definitions = getStateDefinitions(devices.fan, 'celsius');
        await byId(definitions, 'power').set!(1);
        await byId(definitions, 'speed').set!('4');
        expect(sentCommands[0]).to.deep.equal({ poweron: true });
        expect(sentCommands[1]).to.include({ windlevel: 4 });
        expect(byId(definitions, 'speed').get()).to.equal(4);
    });
});
