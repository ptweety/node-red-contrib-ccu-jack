'use strict';

const { axios, jackUrls, JACK } = require('../../nodes/lib/jack');
const MockAdapter = require('axios-mock-adapter');

const testData = require('../data/jack-request');
const testResponse = require('../data/jack-response');

describe('jack', () => {
    describe('get requests (happy path)', () => {
        let mock;
        let jack;

        const options = {
            host: '127.0.0.1',
            port: 2122,
            usetls: true,
            useauth: true,
            username: 'veap',
            password: 'secret',
            shouldLog: false,
        };

        const baseUrl = (options.usetls ? 'https://' : 'http://') + options.host + ':' + options.port;

        beforeAll(() => {
            mock = new MockAdapter(axios, { delayResponse: 20, onNoMatch: 'throwException' });
            jack = new JACK(options);
        });

        beforeEach(() => {
            // api = new API(options);
        });

        afterEach(() => {
            mock.reset();
        });

        it('should get server configuration', async () => {
            mock.onGet(baseUrl + jackUrls.root)
                .reply(200, testData['root'])
                .onGet(baseUrl + jackUrls.vendor)
                .reply(200, testData['vendor'])
                .onGet(baseUrl + jackUrls.refresh)
                .reply(200, testData['refresh'])
                .onGet(baseUrl + jackUrls.config)
                .reply(200, testData['config']);

            const [root, vendor] = await jack.getConfig();
            // console.dir(root);
            // console.dir(vendor);

            expect(mock.history.get[0].baseURL).toEqual(baseUrl);
            expect(mock.history.get[0].url).toEqual(jackUrls.root);
            expect(mock.history.get[1].url).toEqual(jackUrls.vendor);
            expect(mock.history.get[2].url).toEqual(jackUrls.refresh);
            expect(mock.history.get[3].url).toEqual(jackUrls.config);

            expect(root).toEqual(testData['root']);
            expect(vendor).toEqual({
                vendor: testData['vendor'],
                refresh: testData['refresh'],
                config: testData['config'].v,
            });
            // expect(config.v).toEqual(testData['config'].v);
        });

        it('should get domains', async () => {
            mock.onGet(baseUrl + jackUrls.domains).reply(200, testData['domains']);

            const rootDomains = await jack.getDomains();
            // console.dir(rootDomains);

            const domains = [];
            for (const domain of rootDomains) {
                domains.push(domain.identifier);
            }
            // console.dir(domains);

            expect(mock.history.get[0].baseURL).toEqual(baseUrl);
            expect(mock.history.get[0].url).toEqual(jackUrls.domains);

            expect(rootDomains).toEqual(testData['domains']);
        });

        it('should get domain resources', async () => {
            mock.onGet(baseUrl + jackUrls.resources('device'))
                .reply(200, testData['devices'])
                .onGet(baseUrl + jackUrls.resources('sysvar'))
                .reply(200, testData['sysvars'])
                .onGet(baseUrl + jackUrls.resources('program'))
                .reply(200, testData['programs'])
                .onGet(baseUrl + jackUrls.resources('room'))
                .reply(200, testData['rooms'])
                .onGet(baseUrl + jackUrls.resources('function'))
                .reply(200, testData['functions'])
                .onGet(baseUrl + jackUrls.resources('virtdev'))
                .reply(200, testData['virtdevs']);

            const domains = ['device', 'sysvar', 'program', 'room', 'function', 'virtdev'];
            const domainResources = await jack.getDomainResources(domains);
            // console.dir(domainResources);

            expect(mock.history.get[0].baseURL).toEqual(baseUrl);
            expect(mock.history.get[0].url).toEqual(jackUrls.resources('device'));

            expect(domainResources.devices).toEqual(testData['domains'].devices);
        });

        it('should get device channels', async () => {
            mock.onGet(baseUrl + jackUrls.deviceChannels).reply(200, testData['deviceChannels']);

            const deviceChannels = await jack.getDeviceChannels();
            // console.dir(deviceChannels);

            expect(mock.history.get[0].baseURL).toEqual(baseUrl);
            expect(mock.history.get[0].url).toEqual(jackUrls.deviceChannels);

            expect(deviceChannels).toEqual(testResponse['deviceChannels']);
        });

        it('should get channel datapoints', async () => {
            mock.onGet(baseUrl + jackUrls.channelDatapoints).reply(200, testData['channelDatapoints']);

            const channelDatapoints = await jack.getChannelDatapoints();
            // console.dir(channelDatapoints);

            expect(mock.history.get[0].baseURL).toEqual(baseUrl);
            expect(mock.history.get[0].url).toEqual(jackUrls.channelDatapoints);

            expect(channelDatapoints).toEqual(testResponse['channelDatapoints']);
        });
    });

    describe('get requests (error cases)', () => {
        let mock;
        let jack;

        const options = {
            host: '127.0.0.1',
            port: 2122,
            usetls: true,
            useauth: true,
            username: 'veap',
            password: 'secret',
            shouldLog: false,
        };

        const baseUrl = (options.usetls ? 'https://' : 'http://') + options.host + ':' + options.port;

        beforeAll(() => {
            mock = new MockAdapter(axios, { delayResponse: 20, onNoMatch: 'throwException' });
            jack = new JACK(options);
        });

        beforeEach(() => {
            // api = new API(options);
        });

        afterEach(() => {
            mock.reset();
        });

        it('should throw error (generic)', async () => {
            mock.onGet(baseUrl + jackUrls.root).replyOnce(200, {});
            await expect(jack.getConfig()).rejects.toThrow(Error);
        });

        it('should throw error if no domains found', async () => {
            mock.onGet(baseUrl + jackUrls.root)
                .replyOnce(200, {
                    '~links': [
                        { rel: '~no-domain', href: '..' },
                        { rel: '~service', href: '~exgdata' },
                        { rel: '~service', href: '~query' },
                    ],
                })
                .onGet(baseUrl + jackUrls.vendor)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.refresh)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.config)
                .replyOnce(200, {});
            await expect(jack.getConfig()).rejects.toThrow('No domains found in VAEP server response.');
        });

        it('should throw error if ExgDataService not supported', async () => {
            mock.onGet(baseUrl + jackUrls.root)
                .replyOnce(200, {
                    '~links': [
                        { rel: 'domain', href: '..' },
                        { rel: '~no-service', href: '~exgdata' },
                        { rel: '~service', href: '~query' },
                    ],
                })
                .onGet(baseUrl + jackUrls.vendor)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.refresh)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.config)
                .replyOnce(200, {});
            await expect(jack.getConfig()).rejects.toThrow(
                'API does not support ExgDataService. Please upgrade your CCU-Jack!'
            );
        });

        it('should throw error if SearchService not supported', async () => {
            mock.onGet(baseUrl + jackUrls.root)
                .replyOnce(200, {
                    '~links': [
                        { rel: 'domain', href: '..' },
                        { rel: '~service', href: '~exgdata' },
                        { rel: '~no-service', href: '~query' },
                    ],
                })
                .onGet(baseUrl + jackUrls.vendor)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.refresh)
                .replyOnce(200, {})
                .onGet(baseUrl + jackUrls.config)
                .replyOnce(200, {});
            await expect(jack.getConfig()).rejects.toThrow(
                'API does not support SearchService. Please upgrade your CCU-Jack!'
            );
        });

        it('should throw error if empty response for getDomains', async () => {
            mock.onGet(baseUrl + jackUrls.domains).replyOnce(200);

            await expect(jack.getDomains()).rejects.toThrow('Empty response from API');
        });

        it('should throw error if empty response for getDomainResources', async () => {
            mock.onGet(baseUrl + jackUrls.devices).replyOnce(200);

            await expect(jack.getDomainResources(['device'])).rejects.toThrow('Empty response from API');
        });

        it('should throw error if empty response for getDeviceChannels', async () => {
            mock.onGet(baseUrl + jackUrls.deviceChannels).replyOnce(200);

            await expect(jack.getDeviceChannels()).rejects.toThrow('Empty response from API');
        });

        it('should throw error if empty response for getChannelDatapoints', async () => {
            mock.onGet(baseUrl + jackUrls.channelDatapoints).replyOnce(200);

            await expect(jack.getChannelDatapoints()).rejects.toThrow('Empty response from API');
        });
    });

    describe('special cases', () => {
        it('should return found href', () => {
            const jack = new JACK({});
            expect(
                jack.getLinks({ '~links': [{ rel: 'channel', href: '..', title: 'HM-RCV-50 BidCoS-RF:0' }] }, 'channel')
            ).toEqual(['..']);
        });

        it('should return empty array', () => {
            const jack = new JACK({});
            expect(jack.getLinks({}, 'channel')).toEqual([]);
        });

        it('should create jack with defaults', () => {
            const jack = new JACK({});
            // console.dir(jack);
            expect(jack.options.host).toBe('127.0.0.1');
            expect(jack.options.port).toBe(2121);
        });

        it('should create jack with given options', () => {
            const jack = new JACK({ logLevel: 'DEBUG', host: '192.168.0.1', port: 1234 });
            // console.dir(jack);
            expect(jack.options.host).toBe('192.168.0.1');
            expect(jack.options.port).toBe(1234);
        });
    });
});
