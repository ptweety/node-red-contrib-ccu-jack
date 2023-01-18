/* eslint-disable unicorn/prefer-node-protocol */
'use strict';

const discover = require('../../nodes/lib/discover');

const buf = require('buffer').Buffer;
const dgram = require('dgram');
const net = require('net');

const serverPort = 43_439;
const serverType = 'eQ3-HmIP-CCU3-MOCK';
const serverSerial = '3014F711A00012345678F711';

const nullByte = buf.from([0x00]);
// eslint-disable-next-line prettier/prettier
const message = buf.from([0x02, 0x8F, 0x91, 0xC0, 0x01, 'e', 'Q', '3', 0x2D, 0x2A, 0x00, 0x2A, 0x00, 0x49]);
const header = message.subarray(0, 5);

const createClient = (port) => {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        let timer;

        if (srv) {
            srv.listen(port);

            srv.on('listening', () => {
                clearTimeout(timer);
                resolve(srv);
            });

            srv.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log('Address in use, retrying...');
                    setTimeout(() => {
                        srv.close();
                        srv.listen(port);
                    }, 100);
                } else {
                    srv.close();
                    reject(error);
                }
            });

            timer = setTimeout(() => {
                srv.close();
                reject();
            }, 500);
        } else reject();
    });
};

const destroyClient = (srv) => {
    return new Promise((resolve, reject) => {
        if (srv) {
            srv.on('close', () => {
                resolve();
            });
            srv.close((error) => {
                reject(error);
            });
        } else reject();
    });
};

const createServer = (port) => {
    return new Promise((resolve, reject) => {
        const srv = dgram.createSocket('udp4');
        let timer;

        if (srv) {
            srv.on('message', (_, rinfo) => {
                // eslint-disable-next-line unicorn/prefer-spread
                const message = buf.concat([
                    header,
                    buf.from(serverType),
                    nullByte,
                    buf.from(serverSerial),
                    nullByte,
                    buf.from(''),
                ]);

                srv.send(message, 0, message.length, rinfo.port, rinfo.address);
                // console.log('server: out (' + rinfo.address + ':' + rinfo.port + ') -> ', message);
            });

            srv.bind(port);

            srv.on('listening', () => {
                clearTimeout(timer);
                resolve(srv);
            });

            srv.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log('Address in use, retrying...');
                    setTimeout(() => {
                        srv.close();
                        srv.bind(port);
                    }, 100);
                } else {
                    srv.close();
                    reject(error);
                }
            });

            timer = setTimeout(() => {
                srv.close();
                reject();
            }, 500);
        } else reject();
    });
};

const destroyServer = (srv) => {
    return new Promise((resolve, reject) => {
        if (srv) {
            srv.on('close', () => {
                resolve();
            });
            srv.close((error) => {
                reject(error);
            });
        } else reject();
    });
};

describe('discover', () => {
    let server;
    let clients = [];

    beforeAll(async () => {
        try {
            server = await createServer(serverPort);
        } catch (error) {
            console.log(error);
        }
    });

    afterAll(async () => {
        try {
            await destroyServer(server);
        } catch (error) {
            console.log(error);
        }
    });

    afterEach(async () => {
        try {
            for (const client of clients) {
                await destroyClient(client);
            }
        } catch (error) {
            console.log(error);
        }
    });

    it('should return (happy path)', async () => {
        try {
            const client = await createClient(1999); // ReGaHSS
            if (client) clients.push(client);
        } catch (error) {
            console.log(error);
        }

        const result = await discover();
        expect(result).toBeDefined();
    });

    it('should work on one port', async () => {
        try {
            const client = await createClient(2121); // Jack-VEAP
            if (client) clients.push(client);
        } catch (error) {
            console.log(error);
        }

        const ids = ['Jack'];
        const result = await discover({
            timeout: 100,
            requests: [{ id: ids[0], port: 2121 }],
        });

        const filterResult = [];
        expect(result).toBeDefined();
        for (const item of result) {
            expect(item).toHaveProperty('type');
            if (item.type === serverType) {
                filterResult.push(item);
            }
        }
        for (const item of filterResult) {
            expect(item).toMatchObject({ type: serverType });
            expect(item).toHaveProperty('address');
            expect(item).toHaveProperty('serial');
            expect(item.serial).toBe(serverSerial);
            expect(item).toHaveProperty('version');
            expect(item).toHaveProperty('interfaces');
            for (const id of ids) {
                expect(item.interfaces).toHaveProperty(id);
                expect(item.interfaces[id]).toHaveProperty('active');
                expect(item.interfaces[id]['active']).toBe(true);
            }
        }
    });

    it('should work on multiple ports (one beeing active)', async () => {
        try {
            const client = await createClient(2121); // Jack-VEAP
            if (client) clients.push(client);
        } catch (error) {
            console.log(error);
        }

        const ids = ['Jack-VEAP', 'Jack-secure-VEAP'];
        const result = await discover({
            timeout: 100,
            requests: [
                { id: ids[0], port: 2121 },
                { id: ids[1], port: 2122 },
            ],
        });

        const filterResult = [];
        expect(result).toBeDefined();
        for (const item of result) {
            expect(item).toHaveProperty('type');
            if (item.type === serverType) {
                filterResult.push(item);
            }
        }
        for (const item of filterResult) {
            expect(item).toMatchObject({ type: serverType });
            expect(item).toHaveProperty('address');
            expect(item).toHaveProperty('serial');
            expect(item.serial).toBe(serverSerial);
            expect(item).toHaveProperty('version');
            expect(item).toHaveProperty('interfaces');
            for (const id of ids) {
                expect(item.interfaces).toHaveProperty(id);
                expect(item.interfaces[id]).toHaveProperty('active');
            }
            expect(item.interfaces[ids[0]]['active']).toBe(true);
            expect(item.interfaces[ids[1]]['active']).toBe(false);
        }
    });

    it('should work on multiple ports (all active)', async () => {
        try {
            const client1 = await createClient(2121); // Jack-VEAP
            if (client1) clients.push(client1);
            const client2 = await createClient(2122); // Jack-secure-VEAP
            if (client2) clients.push(client2);
        } catch (error) {
            console.log(error);
        }

        const ids = ['CCU-Jack', 'CCU-Jack-secure'];
        const result = await discover({
            timeout: 100,
            requests: [
                { id: ids[0], port: 2121 },
                { id: ids[1], port: 2122 },
            ],
        });

        const filterResult = [];
        expect(result).toBeDefined();
        for (const item of result) {
            expect(item).toHaveProperty('type');
            if (item.type === serverType) {
                filterResult.push(item);
            }
        }
        for (const item of filterResult) {
            expect(item).toMatchObject({ type: serverType });
            expect(item).toHaveProperty('address');
            expect(item).toHaveProperty('serial');
            expect(item.serial).toBe(serverSerial);
            expect(item).toHaveProperty('version');
            expect(item).toHaveProperty('interfaces');
            for (const id of ids) {
                expect(item.interfaces).toHaveProperty(id);
                expect(item.interfaces[id]).toHaveProperty('active');
                expect(item.interfaces[id]['active']).toBe(true);
            }
        }
    });
});
