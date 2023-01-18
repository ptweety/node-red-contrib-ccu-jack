'use strict';

const { axios, axiosRetry, API } = require('./api');
const { hasProperty, sortObject } = require('./utils');

const jackUrls = {
    root: '/',
    vendor: '/~vendor',
    config: '/~vendor/config/~pv',
    domains: '/~query?~path=/[a-z]*',
    resources: (resource) => `/~query?~path=/${resource}/*`,
    deviceChannels: '/~query?~path=/device/*/[^$]*&~path=/virtdev/*/[^$]*',
    channelDatapoints: '/~query?~path=/device/*/[^$]*/[^$]*&~path=/virtdev/*/[^$]*/[^$]*',
};

/**
 * @class JACK interfaces to your CCU-Jack application.
 */
class JACK {
    /**
     * Create a JACK instance
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
        this.options = {
            host: options.host || '127.0.0.1',
            port: options.port || 2121,
            usetls: options.usetls || false,
            useauth: options.useauth || false,
            username: options.username || '',
            password: options.password || '',
            shouldLog: options.shouldLog || false,
        };

        this.api = new API(this.options);

        /**
         * Search for matching hrefs in ~links[] property of an item
         * @param {object} item - item to get ~links from
         * @param {string} relation - relation to search for in the –links
         * @param {RegExp=} href - href to search for in the ~links
         * @returns {string[]} array of matched hrefs
         */
        this.getLinks = (item, relation, href = /.*/) => {
            const result = [];
            if (!hasProperty(item, '~links')) return result;

            for (const link of item['~links']) {
                if (relation === undefined || link.rel !== relation) continue;
                if (link.href.match(href) !== null) result.push(link.href);
            }
            return result;
        };

        /**
         * Get configuration from CCU-Jack
         * @returns {object[]} array of response objects for / and /vendor endpoints
         * @throws No domains found in VAEP server response.
         * @throws API does not support ExgDataService. Please upgrade your CCU-Jack!
         * @throws API does not support SearchService. Please upgrade your CCU-Jack!
         */
        this.getConfig = async () => {
            let root, vendor, config;

            try {
                [root, vendor, config] = await Promise.all(
                    [jackUrls.root, jackUrls.vendor, jackUrls.config].map((url) => {
                        return this.api.request({ method: 'GET', url });
                    })
                );
            } catch {
                [root, vendor, config] = [{ '~links': [] }, {}, {}];
            }

            if (!root['~links'].some((id) => id.rel === 'domain'))
                throw new Error('No domains found in VAEP server response.');

            if (!root['~links'].some((id) => id.rel === '~service' && id.href === '~exgdata'))
                throw new Error('API does not support ExgDataService. Please upgrade your CCU-Jack!');

            if (!root['~links'].some((id) => id.rel === '~service' && id.href === '~query'))
                throw new Error('API does not support SearchService. Please upgrade your CCU-Jack!');

            return [root, { vendor, config: config.v }];
        };

        /**
         * Get domains from CCU-Jack
         * @returns {object} response object for all regular /[a-z]* endpoints
         * @throws Empty response from API
         */
        this.getDomains = async () => {
            let domains;

            try {
                domains = await this.api.request({ method: 'GET', url: jackUrls.domains });
            } catch {
                domains = [];
            }

            if (domains.length === 0) throw new Error('Empty response from API');

            return domains;
        };

        /**
         * Get resources for all given domains from CCU-Jack
         * @param {string[]} domains array of domains to query
         * @returns {object[]} array of objects [children per domain, resources per domain] of given /'domains'/* endpoints
         * @throws Empty response from API
         */
        this.getDomainResources = async (domains) => {
            const result = { '~domains': {}, '~resources': {} };
            let domainResources;

            try {
                domainResources = await Promise.all(
                    domains.map(async (resource) => {
                        return {
                            [resource]: await this.api.request({
                                method: 'GET',
                                url: jackUrls.resources(resource),
                            }),
                        };
                    })
                );
            } catch {
                domainResources = [];
            }

            if (domainResources.length > 0) {
                for (const domains of domainResources) {
                    for (const domain in domains) {
                        const data = {};
                        const children = [];
                        const items = domains[domain];
                        if (Array.isArray(items))
                            for (const item of items) {
                                children.push(item.identifier);
                                data[item.identifier] = { '.': item };
                            }

                        result['~domains'][domain] = { children };
                        result['~resources'][domain] = sortObject(data);
                    }
                }
            } else throw new Error('Empty response from API');

            return [result['~domains'], result['~resources']];
        };

        /**
         * Get all device channels from CCU-Jack
         * @returns {object} sorted object with all channels grouped by device
         * @throws Empty response from API
         */
        this.getDeviceChannels = async () => {
            const result = {};
            let deviceChannels;

            try {
                deviceChannels = await this.api.request({
                    method: 'GET',
                    url: jackUrls.deviceChannels,
                });
            } catch {
                deviceChannels = [];
            }

            if (deviceChannels.length > 0) {
                for (const channel of deviceChannels) {
                    const [, domain, device] = channel['~path'].split('/');

                    if (!channel.children) channel.children = this.getLinks(channel, 'parameter');
                    channel.rooms = [];
                    for (const link of this.getLinks(channel, 'room')) {
                        const [, _, id] = link.split('/');
                        channel.rooms.push(id);
                    }
                    channel.functions = [];
                    for (const link of this.getLinks(channel, 'function')) {
                        const [, _, id] = link.split('/');
                        channel.functions.push(id);
                    }

                    if (!result[domain]) result[domain] = {};

                    if (result[domain][device]) {
                        result[domain][device][channel.identifier] = {
                            '.': channel,
                        };
                    } else {
                        result[domain][device] = {
                            [channel.identifier]: { '.': channel },
                        };
                    }
                }
            } else throw new Error('Empty response from API');

            return sortObject(result);
        };

        /**
         * Get all channel datapoints from CCU-Jack
         * @returns {object} sorted object with all datapoints grouped by device and channel
         * @throws Empty response from API
         */
        this.getChannelDatapoints = async () => {
            const result = {};
            let channelDatapoints;

            try {
                channelDatapoints = await this.api.request({
                    method: 'GET',
                    url: jackUrls.channelDatapoints,
                });
            } catch {
                channelDatapoints = [];
            }

            if (channelDatapoints.length > 0) {
                for (const datapoint of channelDatapoints) {
                    const [, domain, device, channel] = datapoint['~path'].split('/');

                    if (!result[domain]) result[domain] = {};

                    if (result[domain][device]) {
                        if (result[domain][device][channel]) {
                            result[domain][device][channel][datapoint.identifier] = {
                                '.': datapoint,
                            };
                        } else {
                            result[domain][device][channel] = {
                                [datapoint.identifier]: { '.': datapoint },
                            };
                        }
                    } else {
                        result[domain][device] = {
                            [channel]: {
                                [datapoint.identifier]: { '.': datapoint },
                            },
                        };
                    }
                }
            } else throw new Error('Empty response from API');

            return sortObject(result);
        };
    }
}

module.exports = { axios, axiosRetry, jackUrls, JACK };
