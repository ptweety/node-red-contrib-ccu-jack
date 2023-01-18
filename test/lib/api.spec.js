'use strict';

const { axios, API } = require('../../nodes/lib/api');
const MockAdapter = require('axios-mock-adapter');

describe('api', () => {
    describe('get requests (happy path)', () => {
        let mock;
        let api;

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
            api = new API(options);
        });

        beforeEach(() => {
            // api = new API(options);
        });

        afterEach(() => {
            mock.reset();
        });

        it('should get something', async () => {
            mock.onGet(baseUrl + '/').reply(200, {});

            const result = await api.request({ method: 'GET', url: '/', retries: 0 });
            expect(result).toEqual({});
        });

        it('should post something', async () => {
            mock.onPost(baseUrl + '/').reply(200, {});

            const result = await api.request({ method: 'POST', url: '/', retries: 0, data: 'something' });
            expect(result).toEqual({});
        });
    });

    describe('special cases', () => {
        it('should create api with defaults', () => {
            const api = new API({});
            // console.dir(api);
            expect(api.host).toBe('127.0.0.1');
            expect(api.port).toBe(2121);
        });

        it('should create api with given options', () => {
            const api = new API({ logLevel: 'DEBUG', host: '192.168.0.1', port: 1234 });
            // console.dir(api);
            expect(api.host).toBe('192.168.0.1');
            expect(api.port).toBe(1234);
        });

        it('should check shouldLog', async () => {
            const mock = new MockAdapter(axios);
            const api = new API({ shouldLog: true });

            mock.onGet('http://127.0.0.1:2121/').reply(200, {});
            console.debug = jest.fn();

            await api.request({ method: 'GET', url: '/', retries: 0 });

            expect(console.debug).toHaveBeenCalled();
        });

        it('should return an error', async () => {
            const mock = new MockAdapter(axios);
            const api = new API({});

            mock.onGet('http://127.0.0.1:2121/').reply(200, '');

            const result = await api.request({ method: 'GET', url: '/', retries: 0 });
            expect(result).toEqual(new Error('Empty response from API'));
        });
    });
});
