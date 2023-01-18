'use strict';

const net = require('net');
const dgram = require('dgram');
const buf = require('buffer').Buffer;

const check = (id, host, port) =>
    new Promise((resolve) => {
        const c = net.connect({ port, host, timeout: this.timeout }, () => {
            c.end();
            resolve({ id, port, active: true });
        });
        c.on('error', () => {
            resolve({ id, port, active: false });
        });
    });

const discover = (options) =>
    new Promise((resolve) => {
        if (typeof options !== 'object') {
            options = {};
        }

        const timeout = options.timeout || 1200;
        const requests = options.requests || [
            { id: 'ReGaHSS', port: 1999 },
            { id: 'BidCos-Wired', port: 2000 },
            { id: 'BidCos-RF', port: 2001 },
            { id: 'HmIP-RF', port: 2010 },
            { id: 'VirtualDevices', port: 9292 },
            { id: 'CUxD', port: 8701 },
            { id: 'Jack-VEAP', port: 2121 },
            { id: 'Jack-secure-VEAP', port: 2122 },
            { id: 'Jack-MQTT', port: 1883 },
            { id: 'Jack-secure-MQTT', port: 8883 },
        ];
        const remoteport = 43_439;
        const nullByte = buf.from([0x00]);
        // eslint-disable-next-line prettier/prettier
		const message = buf.from([0x02, 0x8F, 0x91, 0xC0, 0x01, 'e', 'Q', '3', 0x2D, 0x2A, 0x00, 0x2A, 0x00, 0x49]);
        const header = message.subarray(0, 5);
        const found = [];
        const foundAddresses = [];
        const client = dgram.createSocket({ type: 'udp4' });

        setTimeout(() => {
            client.close();
            resolve(found);
        }, timeout);

        client.on('message', async (response, remote) => {
            // console.log('discover: in ->', response);
            if (response.subarray(0, 5).equals(header)) {
                const indexType = response.indexOf(nullByte, 5);
                const indexSerial = response.indexOf(nullByte, indexType + 1);
                const indexVersion = response.indexOf(nullByte, indexSerial + 1 + 3);

                const device = {
                    type: response.toString('utf8', 5, indexType),
                    serial: response.toString('utf8', indexType + 1, indexSerial),
                    version: response.toString('utf8', indexSerial + 1 + 3, indexVersion),
                    address: remote.address,
                    interfaces: {},
                };
                // console.log('discover: process ->', device);

                if (!foundAddresses.includes(remote.address)) {
                    foundAddresses.push(remote.address);

                    const returnValues = await Promise.all(
                        requests.map(async (item) => check(item.id, remote.address, item.port))
                    );

                    for (const item of returnValues) {
                        device.interfaces[item.id] = {
                            port: item.port,
                            active: item.active,
                        };
                    }

                    found.push(device);
                }
            }
        });

        client.bind(() => {
            client.setBroadcast(true);
            client.send(message, 0, message.length, remoteport, '255.255.255.255');
            // console.log('discover: out ->', message);
        });
    });

module.exports = discover;
module.exports.check = check;
