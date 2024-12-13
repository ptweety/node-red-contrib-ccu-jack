'use strict';

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const https = require('https');

/**
 * @class API handels axios requests.
 */
class API {
    /**
     * Create a API instance
     * @param {object} options
     * @param {string} options.host - hostname or IP address of the Homematic CCU
     * @param {number=} options.port - rega remote script port. Defaults to 48181 if options.tls is true
     * @param {boolean=} options.usetls=- Connect using TLS
     * @param {boolean=} options.useauth- Use Basic Authentication
     * @param {string=} options.username - Auth Username
     * @param {string=} options.password - Auth Password
     * @param {object=} options.log - Logger
     * @param {boolean=} options.shouldlog - should log with logger
     */
    constructor(options) {
        this.logger = options.log || console;
        this.shouldLog = options.shouldLog || false;

        this.host = options.host || '127.0.0.1';
        this.port = options.port || 2121;

        this.usetls = options.usetls || false;
        this.tlsOptions = options.tls || { rejectUnauthorized: false };

        this.useauth = options.useauth || false;
        this.username = options.username;
        this.password = options.password;

        this.axiosConfig = {
            baseURL: (this.usetls ? 'https://' : 'http://') + this.host + ':' + this.port,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            httpsAgent: new https.Agent(this.tlsOptions),
            // DEBUG: Test timeout handling
            // timeout: 200,
            'axios-retry': options.retries || { retries: 3 },
        };

        if (this.useauth) this.axiosConfig.auth = { username: this.username, password: this.password };

        /* c8 ignore start */
        this.queue = async (argumentsArray, poolLimit, f_) => {
            const returnValue = [];
            const executing = [];

            for (const item of argumentsArray) {
                const nextPromise = Promise.resolve().then(() => f_(item, argumentsArray));
                returnValue.push(nextPromise);
                if (poolLimit <= argumentsArray.length) {
                    const execute = nextPromise.then(() => executing.splice(executing.indexOf(execute), 1));
                    executing.push(execute);
                    if (executing.length >= poolLimit) {
                        await Promise.race(executing);
                    }
                }
            }
            return Promise.all(returnValue);
        };
        /* c8 ignore stop */

        this.request = async ({ method = 'GET', url = '/', data }) => {
            const request = { method, url, ...this.axiosConfig };
            // if (this.shouldLog) console.debug(request);

            if (method !== 'GET' && data !== null) request['data'] = data;

            const response = await axios(request);
            if (response.data.length <= 0) {
                return new Error('Empty response from API');
            }
            if (this.shouldLog) console.debug(response);
            return response.data;
        };

        // DEBUG: Interceptors for retries
        /* c8 ignore start */
        axiosRetry(axios, {
            shouldResetTimeout: true,
            retryDelay: () => 1000,
            onRetry: (retryCount, error, requestConfig) => {
                if (this.shouldLog)
                    this.logger.debug(
                        `${requestConfig.method.toUpperCase()} request: ${
                            requestConfig.baseURL + requestConfig.url
                        }, retryCount: ${retryCount}`
                    );
                if (this.shouldLog) this.logger.trace(error);
                return;
            },
            retryCondition: (error) => {
                return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
            },
        });

        // DEBUG: Request interceptor for capturing start time
        axios.interceptors.request.use(
            (request) => {
                request.time = { startTime: new Date() };
                return request;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // DEBUG: Response interceptor for computing duration
        axios.interceptors.response.use(
            (response) => {
                response.config.time.endTime = new Date();
                response.duration = response.config.time.endTime - response.config.time.startTime;
                if (this.shouldLog)
                    this.logger.debug(
                        `${response.config.method.toUpperCase()} request: ${
                            response.config.baseURL + response.config.url
                        }, duration: ${response.duration}`
                    );
                return response;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
        /* c8 ignore stop */
    }
}

// EXPORT
module.exports = { axios, axiosRetry, API };
