'use strict';

//#region ----- Module level variables ---- //

const path = require('path');
const events = require('events');
const package_ = require(path.join(__dirname, '..', 'package.json'));

const { JACK } = require('./lib/jack');
const discover = require('./lib/discover');
const { hasProperty, isValidTopic } = require('./lib/utils');
const { statusTypes, statusMessages, domainTypes, eventTypes } = require('./lib/constants');

const nodeConfig = {
    /** @type {runtimeRED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Node Name - has to match with html file and package.json `red` section */
    nodeName: 'jack-config',
    /** @type {boolean} enable development features */
    development: false,
};

const i18nCatalog = '@ptweety/node-red-contrib-ccu-jack/messages:';

//#endregion ----- Module level variables ---- //

//#region ----- Module-level support functions ----- //

function nodeInstance(config) {
    const RED = nodeConfig.RED;

    this.config = config;

    RED.nodes.createNode(this, config);

    this.events = new events.EventEmitter();

    // eslint-disable-next-line unicorn/no-this-assignment
    // const node = this;

    this.status = statusTypes.BLANK;

    this.network = {};

    this.name = config.name;
    this.host = config.host;
    this.port = config.port;
    this.autoConnect = config.autoConnect;

    this.consumers = {};

    this.globalContext = this.context().global;
    this.contextStore = {};
    this.userStore = {};
    this.userStoreName = config.type + '-' + config.id;
    this.timerContextStore;
    this.useContext = config.useContext;

    this.isLocal = config.host.startsWith('127.') || config.host === 'localhost' || false;

    this.useauth = config.useauth || false;
    this.usetls = config.usetls || false;

    this.url = `http${this.usetls ? 's' : ''}://${this.host}:${this.port}`;

    this.username = '';
    this.password = '';
    if (this.useauth && this.credentials.user && this.credentials.password) {
        this.username = this.credentials.user;
        this.password = this.credentials.password;
    }

    // CCU-Jack prep
    this.options = {
        host: this.host,
        port: this.port,
        usetls: this.usetls,
        useauth: this.useauth,
        username: this.username,
        password: this.password,
        log: RED.log,
        shouldLog: ['debug', 'trace'].includes(RED.settings.logging.console.level),
        // logLevel: RED.settings.logging.console.level,
    };

    if (this.usetls && config.tls) {
        let tlsNode = RED.nodes.getNode(config.tls);
        if (tlsNode) {
            this.options.tls = {};
            tlsNode.addTLSOptions(this.options.tls);
        }
    }

    this.jack = new JACK(this.options);

    this.rootDomains = new Set();

    this.subscriptionId = 0;

    /**
     * Refresh contextStore
     * @returns {void}
     */
    this.refreshContextStore = async () => {
        try {
            // 3. get information about the available domains
            this.debug('Requesting domains');
            const rootDomains = await this.jack.getDomains();

            for (const domain of rootDomains) {
                this.rootDomains.add(domain.identifier);
            }

            // 4. follow the ~links of each domain and gather more data
            this.debug('Requesting resources');
            const [domainChildren, domainResources] = await this.jack.getDomainResources([...this.rootDomains]);

            this.contextStore = {
                ...this.contextStore,
                ...domainResources,
            };

            for (const domain of rootDomains) {
                this.contextStore[domain.identifier]['.'] = {
                    ...domain,
                    ...(domainChildren[domain.identifier] !== undefined && domainChildren[domain.identifier]),
                };
            }

            // 5. follow the ~links of each device and gather channels
            this.debug('Requesting channels');
            const deviceChannels = await this.jack.getDeviceChannels();
            for (const domain of Object.keys(deviceChannels)) {
                for (const device of Object.keys(deviceChannels[domain])) {
                    this.contextStore[domain][device] = {
                        ...this.contextStore[domain][device],
                        ...deviceChannels[domain][device],
                    };
                }
            }

            // 6. follow the ~links of each channel and gather datapoints
            this.debug('Requesting datapoints');
            const channelDatapoints = await this.jack.getChannelDatapoints();
            for (const domain of Object.keys(channelDatapoints)) {
                for (const device of Object.keys(channelDatapoints[domain])) {
                    for (const channel of Object.keys(channelDatapoints[domain][device])) {
                        this.contextStore[domain][device][channel] = {
                            ...this.contextStore[domain][device][channel],
                            ...channelDatapoints[domain][device][channel],
                        };
                    }
                }
            }
        } catch (error) {
            throw `refreshContextStore: ${error}`;
        }
    };

    /**
     * Refresh userStore
     * @param {object} userStore - current userStore
     * @returns {object} new userStore
     */
    this.refreshUserStore = (userStore) => {
        try {
            userStore.ts = Date.now();
            for (const domain of this.rootDomains) {
                if (!hasProperty(this.contextStore, domain)) continue;
                const domainItem = this.contextStore[domain];

                for (const thing in domainItem) {
                    const thingItem = domainItem[thing];

                    if (!hasProperty(userStore, domain) && hasProperty(domainItem, '.')) {
                        const { title, description } = domainItem['.'];

                        RED.util.setObjectProperty(userStore, `${domain}`, { title, description }, true);
                    }

                    if (thing === '.') continue;

                    if ([domainTypes.DEVICE, domainTypes.VIRTDEV].includes(domain)) {
                        for (const channel in thingItem) {
                            const channelItem = thingItem[channel];

                            if (!hasProperty(userStore[domain], thing) && hasProperty(thingItem, '.')) {
                                const { interfaceType, paramsets, title, type } = thingItem['.'];

                                RED.util.setObjectProperty(
                                    userStore[domain],
                                    `${thing}`,
                                    { interfaceType, paramsets, title, type },
                                    true
                                );
                            }

                            if (channel === '.') continue;

                            for (const datapoint in channelItem) {
                                const datapointItem = channelItem[datapoint];

                                if (!hasProperty(userStore[domain][thing], channel) && hasProperty(channelItem, '.')) {
                                    const { direction, flags, paramsets, title, type } = channelItem['.'];

                                    RED.util.setObjectProperty(
                                        userStore[domain][thing],
                                        `${channel}`,
                                        { direction, flags, paramsets, title, type },
                                        true
                                    );
                                }

                                if (datapoint === '.') continue;

                                if (hasProperty(datapointItem, '.')) {
                                    const dp = Object.assign({}, datapointItem['.']);

                                    for (const notRequired of [
                                        'id',
                                        'identifier',
                                        'mqttGetTopic',
                                        'mqttSetTopic',
                                        'mqttStatusTopic',
                                        'tabOrder',
                                        'title',
                                        '~links',
                                        '~path',
                                    ])
                                        delete dp[notRequired];
                                    RED.util.setObjectProperty(
                                        userStore[domain][thing][channel],
                                        `${datapoint}`,
                                        dp,
                                        true
                                    );
                                }
                            }
                        }
                    } else {
                        if (hasProperty(thingItem, '.')) {
                            const { title } = thingItem['.'];

                            RED.util.setObjectProperty(userStore, `${domain}.${thing}`, { title }, true);
                        }
                    }
                }
            }
        } catch (error) {
            throw `refreshUserStore: ${error}`;
        }

        return userStore;
    };

    /**
     * Set contextStore and save updated userStore to global context
     * @param {boolean} active - start update timer on request
     * @returns {void}
     */
    this.setContext = async (active) => {
        const currentTimestamp = Date.now();

        if (this.timerContextStore !== null) clearTimeout(this.timerContextStore);

        if (active && this.contextStore) {
            const contextStoreOutdated = this.contextStore.ts
                ? (currentTimestamp - this.contextStore.ts) / 1000 > 60
                : true;

            if (contextStoreOutdated) {
                let jackOutdated = false;

                // 1. request update
                this.debug('Requesting new configuration');
                try {
                    const [_, vendor] = await this.jack.getConfig();
                    jackOutdated = this.contextStore['.vendor'].refresh.ts - vendor.refresh.ts !== 0;
                } catch {
                    //
                }

                if (jackOutdated) {
                    try {
                        // 3. - 6.
                        await this.refreshContextStore();

                        if (this.status !== statusTypes.CONNECTED) {
                            // 7. ready to re-connect to MQTT broker and receive updates
                            this.log(RED._(i18nCatalog + 'config.state.connected', { jack: this.url }));
                            this.setStatus(statusTypes.CONNECTED);
                        }
                    } catch (error) {
                        this.setStatus(statusTypes.ERROR);
                        this.log(RED._(i18nCatalog + 'config.state.connect-failed', { jack: this.url, error }));
                    } finally {
                        this.contextStore.ts = currentTimestamp;
                    }
                } else this.contextStore.ts = currentTimestamp;
            }

            const userStoreOutdated = this.userStore.ts ? this.contextStore.ts - this.userStore.ts > 0 : true;

            if (this.useContext && userStoreOutdated) {
                try {
                    let userStore = this.globalContext.get(this.userStoreName) || this.userStore;
                    userStore = this.refreshUserStore(userStore);
                    this.userStore = userStore;
                } catch (error) {
                    this.debug(`Updating global context failed - ${error}`);
                } finally {
                    this.globalContext.set(this.userStoreName, this.userStore, (error) => {
                        if (error) this.debug(error);
                    });
                }
            } else {
                this.globalContext.set(this.userStoreName, undefined, (error) => {
                    if (error) this.debug(error);
                });
            }

            if (nodeConfig.development) {
                console.dir(this.contextStore);
            }
        }

        if (active) {
            this.timerContextStore = setTimeout(() => {
                this.setContext(true);
            }, 600 * 1000);
        }
    };

    // Start up prep
    this.start = async (callback) => {
        this.log(RED._(i18nCatalog + 'config.state.connecting', { jack: this.url }));
        this.setStatus(statusTypes.CONNECTING);

        try {
            this.network.discover = await discover();

            // 0. check minimal configuration
            if (!this.host || !this.port) throw 'Invalid host or port';

            // 1. check general connectivity to the VEAP server
            this.debug('Requesting configuration');
            const [root, vendor] = await this.jack.getConfig();

            // 2. initialize contextStore
            this.contextStore = {
                values: {},
                ...this.contextStore,
                '.': root,
                '.vendor': vendor,
                ts: Date.now(),
                status: Object.keys(statusTypes).find((key) => statusTypes[key] === this.status),
            };

            // 3. - 6.
            await this.refreshContextStore();

            // 7. ready to connect to MQTT broker and receive updates
            this.log(RED._(i18nCatalog + 'config.state.connected', { jack: this.url }));
            this.setStatus(statusTypes.CONNECTED);

            this.setContext(true);
        } catch (error) {
            this.setStatus(statusTypes.ERROR);
            this.log(RED._(i18nCatalog + 'config.state.connect-failed', { jack: this.url, error }));
        } finally {
            if (callback) callback();
        }
    };

    this.stop = (callback) => {
        if ([statusTypes.CONNECTED || statusTypes.CONNECTING].includes(this.status)) {
            this.log(RED._(i18nCatalog + 'config.state.disconnected', { jack: this.url }));

            this.setContext(false);
            this.setStatus(statusTypes.NOTCONNECTED);
        }

        if (callback) callback();
    };

    //#region ---- Communication with child nodes ----

    /**
     * Callback to receive global updates from this node
     * @callback registerCallback
     * @param {object} message
     */

    /**
     * Register a child to this node
     * @param childNode
     * @param {registerCallback} callback - handle global updates for child nodes
     * @returns {boolean}
     */
    this.register = (childNode, eventType, callback) => {
        if (!childNode) return false;

        const id = eventType + ':' + this.config.id + '_' + childNode.id;

        this.consumers[childNode.id] = {
            consumer: childNode,
            subscriptions: new Set([id]),
            filter: {},
            whitelistedTopics: new Set(),
            blacklistedTopics: new Set(),
        };

        this.events.on(id, (message) => {
            callback(RED.util.cloneMessage(message));
        });

        // this.setStatus();
        this.events.emit(id, {
            topic: eventTypes.STATUS,
            payload: statusMessages[this.status],
            status: this.status,
            domains: [...this.rootDomains],
            context: this.useContext ? this.userStoreName : undefined,
        });

        return true;
    };

    /**
     * De-Register a child from this node
     * @param childNode
     * @returns {boolean}
     */
    this.deregister = (childNode, callback) => {
        if (this.consumers[childNode.id]) {
            for (const id of this.consumers[childNode.id].subscriptions) this.events.removeAllListeners(id);
            delete this.consumers[childNode.id];
        }

        if (callback) callback();
    };

    /**
     * Callback to receive specific updates from this node
     * @callback subscribeCallback
     * @param {object} message
     */

    /**
     * Subscribe a child to this node
     * @param childNode
     * @param {subscribeCallback} callback - handle specific updates for child nodes
     * @returns {boolean}
     */
    this.subscribe = (childNode, eventType, callback) => {
        if (!childNode) return false;

        if (typeof callback !== 'function') {
            this.debug('subscribe: called without callback');
            return false;
        }

        const filter = childNode.filter || {};

        // if (filter.domain === undefined) return false;

        const validFilterProperties = new Set([
            'domain',
            'change',
            'cache',
            'room',
            'function',
            'rooms',
            'functions',
            'device',
            'deviceName',
            'deviceType',
            'channel',
            'channelName',
            'channelType',
            'channelIndex',
            'datapoint',
            'datapointName',
            'program',
            'programName',
            'sysvar',
            'sysvarName',
        ]);

        const propertiesArray = Object.keys(filter);

        for (let index = 0, { length } = propertiesArray; index < length; index++) {
            if (!validFilterProperties.has(propertiesArray[index])) {
                this.debug('subscribe: called with invalid filter property ' + propertiesArray[index]);
                return false;
            }
        }

        const id = eventType + ':' + this.config.id + '_' + childNode.id;

        if (childNode.id && hasProperty(this.consumers, childNode.id)) {
            this.consumers[childNode.id].subscriptions.add(id);
            this.consumers[childNode.id].filter = filter;
        }

        this.events.on(id, (message) => {
            callback(RED.util.cloneMessage(message));
        });

        return true;
    };

    /**
     * Set node status and emit events
     * @param statusType
     * @returns {void}
     */
    this.setStatus = (statusType) => {
        if (Object.values(statusTypes).includes(statusType)) {
            this.status = statusType;
            this.contextStore.ts = Date.now();
            this.contextStore.status = Object.keys(statusTypes).find((key) => statusTypes[key] === this.status);
        }
        for (const consumer in this.consumers) {
            const id = eventTypes.STATUS + ':' + this.config.id + '_' + consumer;

            if (this.consumers[consumer].subscriptions.has(id))
                this.events.emit(id, {
                    topic: eventTypes.STATUS,
                    payload: statusMessages[this.status],
                    status: this.status,
                    domains: [...this.rootDomains],
                    context: this.useContext ? this.userStoreName : undefined,
                });
        }
    };

    //#endregion ---- Communication with child nodes ----

    //#region ---- Functions for child nodes ----

    this.getAllValues = (flatStructure = true) => {
        const result = {};

        for (const domain in this.contextStore.values) {
            const item = Object.fromEntries(this.contextStore.values[domain]);
            if (flatStructure) result[domain] = Object.fromEntries(this.contextStore.values[domain]);
            else
                for (const topic in item) {
                    RED.util.setObjectProperty(
                        result,
                        topic.replace(`status/`, '').replaceAll('/', '.'),
                        { topic, payload: item[topic] },
                        true
                    );
                }
        }

        return result;
    };

    /**
     * A string in one of these formats:
     * - device/status/\<device-ID\>/\<channel-ID\>/\<parameter-name\>
     * - virtdev/status/\<device-ID\>/\<channel-ID\>/\<parameter-name\>
     * - program/status/\<ISE-ID\>
     * - sysvar/status/\<ISE-ID\>
     * @typedef {string} Topic
     * @see https://github.com/mdzio/ccu-jack/wiki/MQTT-Server
     */

    /**
     * Replace template in topic with actual values from message
     * @param {Topic} topic
     * @param {object} message
     * @returns {string}
     */
    this.topicReplace = (topic, message) => {
        if (!topic || typeof message !== 'object') {
            return topic;
        }

        const messageLower = {};
        for (const k of Object.keys(message)) {
            messageLower[k.toLowerCase()] = message[k];
        }

        const match = topic.match(/\${[^}]+}/g);
        if (match) {
            for (const v of match) {
                const key = v.slice(2, 2 + v.length - 3);
                const rx = new RegExp('\\${' + key + '}', 'g');
                let rkey = key.toLowerCase();

                topic = topic.replace(rx, messageLower[rkey] === undefined ? '' : messageLower[rkey]);
            }
        }

        return topic;
    };

    /**
     * A object with fixed properties
     * @typedef {object} Payload
     * @property {boolean|number|string} v value
     * @property {number} [ts] timestamp
     * @property {number} [s] status
     * @see https://github.com/mdzio/ccu-jack/wiki/MQTT-Server
     * @see https://github.com/mdzio/ccu-jack/wiki/CCU-Datentypen
     * @see https://github.com/mdzio/veap/blob/master/README_de.md#datenpunkt-lesen
     */

    /**
     * Analyze message and return payload
     * @param {buffer|string} message
     * @returns {Payload}
     */
    this.getPayloadFromMessage = (message) => {
        let payload;

        try {
            if (typeof message === 'string') {
                payload = { v: message.toString() };
            } else if (typeof message === 'object') {
                payload = message;
            } else {
                payload = JSON.parse(message.toString());
            }
        } catch (error) {
            this.debug(
                `getMessagePayload: ${RED._('node-red:mqtt.errors.invalid-json-parse')}` +
                    ` - message: { ${message} } - ${error}`
            );
            return {};
        }

        return payload;
    };

    /**
     * Save payload to contextStore
     * @param {string} domain
     * @param {string[]} topicParts
     * @param {Payload} payload
     * @param {object} packet
     * @returns {object} mutated payload in contextStore
     */
    this.savePayload = (domain, topic, payload, packet) => {
        if (!hasProperty(this.contextStore.values, domain)) this.contextStore.values[domain] = new Map();
        const timestamp = Date.now();
        if (!hasProperty(payload, 'ts')) payload.ts = timestamp;
        if (!hasProperty(payload, 's')) payload.s = 200;

        if (this.contextStore.values[domain].has(topic)) {
            const item = this.contextStore.values[domain].get(topic);

            if (item.v === payload.v) {
                // item resent
                payload.cache = false;
                payload.change = false;
            } else {
                // item updated
                payload.vP = item.v;
                payload.tsP = item.ts || timestamp;
                payload.cache = false;
                payload.change = true;
            }
        } else {
            // new item
            payload.vP;
            payload.tsP;
            if (hasProperty(packet, 'retain') && packet.retain === false) {
                payload.cache = false;
                payload.change = true;
            } else {
                payload.cache = true;
                payload.change = false;
            }
        }
        this.contextStore.values[domain].set(topic, payload);

        return payload;
    };

    /**
     * Search contextStore for details on device, sysvar, program, ...
     * @param {string} domain
     * @param {string[]} topicParts
     * @returns {object} data to enrich payload for reply message
     */
    this.prepareReply = (domain, topicParts, payloadValue) => {
        let item = { domain: domain };

        const getValuesByType = (base, value) => {
            switch (value.type) {
                case 'ALARM':
                case 'BOOL': {
                    item[`${base}Enum`] = [value.valueName0 || value.minimum, value.valueName1 || value.maximum];
                    break;
                }
                case 'ENUM': {
                    item[`${base}Enum`] = value.valueList;
                    item[`${base}Value`] = value.valueList[payloadValue];
                    break;
                }
                case 'FLOAT':
                case 'INTEGER': {
                    item[`${base}Min`] = value.minimum;
                    item[`${base}Max`] = value.maximum;
                    break;
                }
                case 'STRING': {
                    //
                    break;
                }
            }
        };

        const getMqttTopics = (value) => {
            item.mqtt = {};
            if (value.mqttGetTopic) item.mqtt.get = value.mqttGetTopic;
            if (value.mqttSetTopic) item.mqtt.set = value.mqttSetTopic;
            if (value.mqttStatusTopic) item.mqtt.status = value.mqttStatusTopic;
        };

        try {
            switch (domain) {
                case domainTypes.DEVICE:
                case domainTypes.VIRTDEV: {
                    if (topicParts.length !== 3) return;
                    const [device, channel, datapoint] = topicParts;
                    if (!hasProperty(this.contextStore[domain], device)) throw `device: ${device}`;
                    if (!hasProperty(this.contextStore[domain][device], channel)) throw `channel: ${channel}`;
                    if (!hasProperty(this.contextStore[domain][device][channel], datapoint))
                        throw `datapoint: ${datapoint}`;
                    try {
                        const storedDevice = this.contextStore[domain][device]['.'] || {};
                        const storedChannel = this.contextStore[domain][device][channel]['.'] || {};
                        const storedDatapoint = this.contextStore[domain][device][channel][datapoint]['.'] || {};
                        item.interfaceType = storedDevice.interfaceType;
                        item.device = storedDevice.address;
                        item.deviceName = storedDevice.title;
                        item.deviceType = storedDevice.type;
                        item.channel = storedChannel.address;
                        item.channelName = storedChannel.title;
                        item.channelType = storedChannel.type;
                        item.channelIndex = storedChannel.index;
                        item.datapoint = storedDatapoint.identifier;
                        item.datapointName = storedDatapoint.title;
                        item.datapointType = storedDatapoint.type;
                        getValuesByType('datapoint', storedDatapoint);
                        if (storedDatapoint.default !== undefined) item.datapointDefault = storedDatapoint.default;
                        if (storedDatapoint.control !== undefined) item.datapointControl = storedDatapoint.control;

                        item.datapoints = {};
                        if (hasProperty(this.contextStore.values, domain)) {
                            for (const child of storedChannel.children) {
                                if (child === datapoint || child === '$MASTER') continue;
                                const statusItem = `${domain}/status/${device}/${channel}/${child}`;
                                if (this.contextStore.values[domain].has(statusItem)) {
                                    const neighbour = this.contextStore.values[domain].get(statusItem);
                                    if (hasProperty(neighbour, 'v')) item.datapoints[child] = neighbour.v;
                                }
                            }
                        }

                        item.rooms = {};
                        for (const id of storedChannel.rooms) {
                            item.rooms[id] = this.contextStore.room[id]['.'].title;
                        }

                        item.functions = {};
                        for (const id of storedChannel.functions) {
                            item.functions[id] = this.contextStore.function[id]['.'].title;
                        }

                        getMqttTopics(storedDatapoint);
                    } catch (error) {
                        throw `domain: ${domain} - ${error}`;
                    }
                    break;
                }
                case domainTypes.PROGRAM:
                case domainTypes.SYSVAR: {
                    if (topicParts.length !== 1) return;
                    const [iseId] = topicParts;
                    if (!hasProperty(this.contextStore[domain], iseId)) return;
                    try {
                        const storedItem = this.contextStore[domain][iseId]['.'] || {};
                        item[domain] = storedItem.identifier;
                        item[`${domain}Name`] = storedItem.title;

                        if (domain === domainTypes.PROGRAM) {
                            item.active = storedItem.active;
                            item.visible = storedItem.visible;
                        } else {
                            item[`${domain}Type`] = storedItem.type;
                            getValuesByType(domain, storedItem);
                        }

                        getMqttTopics(storedItem);
                    } catch (error) {
                        throw `domain: ${domain} - iseId: ${iseId} - ${error}`;
                    }
                    break;
                }
            }
        } catch (error) {
            throw `prepareReply: unable to find ${topicParts} - ${error}`;
        }

        return item;
    };

    /**
     * Apply filter criteria to decide on delivery of any reply
     * @param {*[]} filter
     * @param {Topic} topic
     * @param {Payload} payload
     * @param {object} additions - more data related to payload
     * @returns {boolean}
     */
    this.applyFilter = (filter, topic, payload, additions, whitelistedTopics) => {
        let match = true;
        let matchCache;
        let matchChange;

        if (filter && typeof filter === 'object') {
            const filterKeys = Object.keys(filter);

            for (let index = 0, { length } = filterKeys; match && index < length; index++) {
                const attribute = filterKeys[index];

                if (attribute === 'cache') {
                    // Drop payloads with cache === true
                    if (!filter.cache && payload.cache) return false;

                    matchCache = true;
                    continue;
                }

                if (attribute === 'change') {
                    // Drop payloads with change === false - except cache === true && filter.cache === true
                    if (filter.change && !payload.change && !(filter.cache && payload.cache)) return false;

                    matchChange = true;
                    continue;
                }

                if (whitelistedTopics.has(topic)) {
                    if (matchCache && matchChange) break;
                    continue;
                }

                if (filter[attribute] === '' || filter[attribute] === '*') {
                    // TODO: rethink
                    continue;
                }

                if (attribute === 'channelIndex' && filter[attribute] !== undefined) {
                    filter[attribute] = Number.parseInt(filter[attribute], 10);
                }

                if (Array.isArray(additions[attribute])) {
                    if (filter[attribute] instanceof RegExp) {
                        match = false;
                        for (const item of additions[attribute]) {
                            if (filter[attribute].test(item)) {
                                match = true;
                            }
                        }
                    } else if (!additions[attribute].includes(filter[attribute])) {
                        match = false;
                    }
                } else if (typeof additions[attribute] === 'object') {
                    if (filter[attribute] instanceof RegExp) {
                        match = false;
                        for (const item of Object.keys(additions[attribute])) {
                            if (filter[attribute].test(item) || filter[attribute].test(additions[attribute][item])) {
                                match = true;
                            }
                        }
                    } else if (!hasProperty(additions[attribute], filter[attribute])) {
                        match = false;
                    }
                } else if (filter[attribute] instanceof RegExp) {
                    if (!filter[attribute].test(additions[attribute])) {
                        match = false;
                    }
                } else if (filter[attribute] !== additions[attribute]) {
                    match = false;
                }
            }
        }

        return match;
    };

    /**
     * Handle incomming message for child nodes
     * @param {Topic} topic
     * @param {buffer|string} message
     * @param {object} packet
     * @returns {void}
     */
    this.onMessage = (topic, message, packet, done) => {
        try {
            if (topic && !isValidTopic(topic)) throw `Topic "${topic}" invalid`;

            const topicParts = topic ? topic.split('/') : [];
            if (topic && (topicParts.length === 1 || topicParts[0] === undefined)) return;

            const domain = topicParts.shift();
            if (this.rootDomains && !this.rootDomains.has(domain)) throw `Domain "${domain}" not found`;

            if (topicParts[0] === 'status') topicParts.shift();
            else return;

            /** @type {Payload} */ let payload = this.getPayloadFromMessage(message);
            if (!hasProperty(payload, 'v')) throw `Content of payload invalid`;

            payload = this.savePayload(domain, topic, payload, packet);
            const item = this.prepareReply(domain, topicParts, payload.v);

            const replyMessage = {
                topic,
                payload: payload.v,
                ...item,
                value: payload.v,
                valuePrevious: payload.vP,
                qos: packet.qos || 0,
                retain: packet.retain || false,
                ts: payload.ts || Date.now(),
                tsPrevious: payload.tsP,
                s: payload.s || 0,
                change: payload.change,
                cache: payload.cache,
                source: 'onMessage',
            };

            for (const consumer in this.consumers) {
                const id = eventTypes.EVENT + ':' + this.config.id + '_' + consumer;

                if (this.consumers[consumer].subscriptions.has(id)) {
                    const { filter, whitelistedTopics } = this.consumers[consumer];

                    // if (blacklistedTopics.has(topic)) continue;
                    const match = this.applyFilter(filter, topic, payload, item, whitelistedTopics);

                    // Reply
                    if (match) {
                        whitelistedTopics.add(topic);
                        this.events.emit(id, replyMessage);
                    }
                }
            }
        } catch (error) {
            this.debug(`onMessage: ${error}`);
        } finally {
            if (done) done();
        }
    };

    /**
     * Handle incomming message for child nodes
     * @param {string} childNodeID
     * @param {Topic} topic
     * @param {buffer|string} message
     * @param {object} packet
     * @returns {void}
     */
    this.onInput = (childNodeID, topic, message, packet, done) => {
        try {
            if (topic && !isValidTopic(topic)) throw `Topic "${topic}" invalid`;

            const topicParts = topic ? topic.split('/') : [];
            if (topic && topicParts.length !== 5) throw `Content of topic "${topic}" invalid`;

            const domains = new Set([domainTypes.DEVICE, domainTypes.VIRTDEV]);

            const [topicDomain, _, topicDevice, topicChannelIndex, topicDatapoint] = topicParts;
            const {
                domain: packetDomain,
                device: packetDevice,
                channelIndex: packetChannelIndex,
                datapoint: packetDatapoint,
            } = packet;

            const domain = topicDomain && domains.has(topicDomain) ? topicDomain : packetDomain;

            if (this.rootDomains && !this.rootDomains.has(domain)) throw `Domain "${domain}" not found`;

            const device = topicDevice || packetDevice;
            const channelIndex = topicChannelIndex || packetChannelIndex;
            const datapoint = topicDatapoint || packetDatapoint;

            if (!(device && channelIndex && datapoint))
                throw `Either device "${device}", channelIndex "${channelIndex}" or datapoint "${datapoint}" not found`;

            /** @type {Payload} */ let payload;
            const statusItem = `${domain}/status/${device}/${channelIndex}/${datapoint}`;
            if (this.contextStore.values[domain].has(statusItem)) {
                payload = this.contextStore.values[domain].get(statusItem);

                const item = this.prepareReply(domain, [device, channelIndex, datapoint], payload.v);

                const replyMessage = {
                    topic,
                    payload: message,
                    ...item,
                    value: payload.v,
                    valuePrevious: payload.vP,
                    qos: payload.qos || 0,
                    retain: payload.retain || false,
                    ts: payload.ts || Date.now(),
                    tsPrevious: payload.tsP,
                    s: payload.s || 0,
                    change: payload.change,
                    cache: payload.cache,
                    source: 'onInput',
                };

                const id = eventTypes.VALUE + ':' + this.config.id + '_' + childNodeID;

                if (this.consumers[childNodeID].subscriptions.has(id)) {
                    // Reply
                    this.events.emit(id, replyMessage);
                }
            } else {
                throw `No values found for "${statusItem}" in context store`;
            }
        } catch (error) {
            this.debug(`onInput:  ${error}`);

            const id = eventTypes.ERROR + ':' + this.config.id + '_' + childNodeID;

            if (this.consumers[childNodeID].subscriptions.has(id)) {
                // Reply
                this.events.emit(id, { topic, message, error: `onInput: ${error}` });
            }
        } finally {
            if (done) done();
        }
    };

    //#endregion ---- Functions for child nodes ----

    // START NODE

    // Set initial Context
    this.setContext(false);

    if (this.autoConnect) this.start();
    else this.setStatus(statusTypes.NOTCONNECTED);

    this.on('message', (_message, _send, done) => {
        done();
    });

    this.on('input', (_message, _send, done) => {
        done();
    });

    // CLOSE NODE
    this.on('close', async () => {
        this.stop();
    });

    //#region ---- Communication with editor ----

    RED.httpAdmin.get('/jack', RED.auth.needsPermission('jack.read'), (request, response) => {
        if (request.query.config && request.query.config !== '_ADD_') {
            const config = RED.nodes.getNode(request.query.config);
            if (!config) {
                response.status(500).send(JSON.stringify({}));
                return;
            }

            let item;

            switch (request.query.type) {
                case 'domain': {
                    try {
                        const result = {};

                        for (const domain of [
                            domainTypes.DEVICE,
                            domainTypes.PROGRAM,
                            domainTypes.SYSVAR,
                            domainTypes.VIRTDEV,
                        ]) {
                            item = this.contextStore[domain]['.'];
                            result[domain] = {
                                description: item.description,
                                identifier: item.identifier,
                                title: item.title,
                            };
                        }
                        response.status(200).send(JSON.stringify(result));
                    } catch {
                        response.status(500).send(JSON.stringify({}));
                    }
                    break;
                }

                case 'tree': {
                    const rQ = request.query;
                    try {
                        const rqDomain =
                            rQ.domain && [domainTypes.DEVICE, domainTypes.VIRTDEV].includes(rQ.domain)
                                ? rQ.domain
                                : domainTypes.DEVICE;
                        const rqInterfaceType =
                            rQ.interfaceType && rQ.interfaceTypeT === 'str' ? rQ.interfaceType.split(',') : [];
                        const rqRoom = rQ.room && rQ.roomT === 'str' ? rQ.room.split(',') : [];
                        const rqFunction = rQ.function && rQ.functionT === 'str' ? rQ.function.split(',') : [];
                        const rqDevice = rQ.device && rQ.deviceT === 'str' ? rQ.device.split(',') : [];
                        const rqDeviceType = rQ.deviceType && rQ.deviceTypeT === 'str' ? rQ.deviceType.split(',') : [];
                        const rqChannel = rQ.channel && rQ.channelT === 'str' ? rQ.channel.split(',') : [];
                        const rqChannelType =
                            rQ.channelType && rQ.channelTypeT === 'str' ? rQ.channelType.split(',') : [];
                        const rqChannelIndex =
                            rQ.channelIndex && rQ.channelIndexT === 'str' ? rQ.channelIndex.split(',') : [];
                        const rqDatapoint = rQ.datapoint && rQ.datapointT === 'str' ? rQ.datapoint.split(',') : [];

                        const result = {
                            interfaceType: new Map(),
                            room: new Map(),
                            function: new Map(),
                            device: new Map(),
                            deviceType: new Map(),
                            channel: new Map(),
                            channelType: new Map(),
                            channelIndex: new Map(),
                            datapoint: new Map(),
                        };

                        for (const device of Object.keys(this.contextStore[rqDomain])) {
                            const deviceItem = this.contextStore[rqDomain][device]['.'];
                            if (device === '.') continue;

                            if (
                                (rqDeviceType.length === 0 || rqDeviceType.includes(deviceItem.type)) &&
                                (rqInterfaceType.length === 0 || rqInterfaceType.includes(deviceItem.interfaceType)) &&
                                (rqDevice.length === 0 || rqDevice.includes(device))
                            ) {
                                let matchChannel = false;

                                for (const channel of Object.keys(this.contextStore[rqDomain][device])) {
                                    const channelItem = this.contextStore[rqDomain][device][channel]['.'];
                                    if (channel === '.') continue;

                                    if (rqRoom.length > 0 && !channelItem.rooms.some((r) => rqRoom.includes(r)))
                                        continue;

                                    if (
                                        rqFunction.length > 0 &&
                                        !channelItem.functions.some((f) => rqFunction.includes(f))
                                    )
                                        continue;

                                    if (
                                        (rqChannelType.length === 0 || rqChannelType.includes(channelItem.type)) &&
                                        (rqChannel.length === 0 || rqChannel.includes(device + ':' + channel))
                                    ) {
                                        let matchDatapoint = false;

                                        for (const datapoint of Object.keys(
                                            this.contextStore[rqDomain][device][channel]
                                        )) {
                                            const datapointItem =
                                                this.contextStore[rqDomain][device][channel][datapoint]['.'];
                                            if (datapoint === '.') continue;

                                            if (rqDatapoint.length === 0 || rqDatapoint.includes(datapoint)) {
                                                matchDatapoint = true;

                                                result.datapoint.set(datapointItem.identifier, {
                                                    value: datapointItem.identifier,
                                                    source: [],
                                                });
                                            }
                                        }

                                        if (matchDatapoint) {
                                            matchChannel = true;

                                            for (const room of channelItem.rooms) {
                                                const roomItem = this.contextStore[domainTypes.ROOM][room]['.'];

                                                result.room.set(roomItem.identifier, {
                                                    value: roomItem.identifier,
                                                    source: [roomItem.title],
                                                });
                                            }

                                            for (const function_ of channelItem.functions) {
                                                const functionItem =
                                                    this.contextStore[domainTypes.FUNCTION][function_]['.'];

                                                result.function.set(functionItem.identifier, {
                                                    value: functionItem.identifier,
                                                    source: [functionItem.title],
                                                });
                                            }

                                            result.channel.set(channelItem.address, {
                                                value: channelItem.address,
                                                source: [channelItem.title],
                                            });

                                            result.channelType.set(channelItem.type, {
                                                value: channelItem.type,
                                                source: [],
                                            });

                                            if (
                                                rqChannelIndex.length === 0 ||
                                                rqChannelIndex.includes(channelItem.identifier)
                                            )
                                                result.channelIndex.set(channelItem.identifier, {
                                                    value: channelItem.identifier,
                                                    source: [],
                                                });
                                        }
                                    }
                                }

                                if (matchChannel) {
                                    result.interfaceType.set(deviceItem.interfaceType, {
                                        value: deviceItem.interfaceType,
                                        source: [],
                                    });

                                    result.deviceType.set(deviceItem.type, {
                                        value: deviceItem.type,
                                        source: [],
                                    });

                                    if (rqDevice.length === 0 || rqDevice.includes(device))
                                        result.device.set(deviceItem.identifier, {
                                            value: deviceItem.identifier,
                                            source: [deviceItem.title],
                                        });
                                }
                            }
                        }

                        response
                            .status(200)
                            .send(
                                JSON.stringify(result, (_, v) =>
                                    v instanceof Map
                                        ? [...v.values()].sort((a, b) => a.value.localeCompare(b.value))
                                        : v
                                )
                            );
                    } catch {
                        response.status(500).send(JSON.stringify({}));
                    }
                    break;
                }

                case 'program':
                case 'sysvar': {
                    try {
                        const result = [];
                        const items = this.contextStore[request.query.type];

                        for (const item of Object.keys(items)) {
                            if (item !== '.')
                                result.push({
                                    value: items[item]['.'].identifier,
                                    source: [items[item]['.'].title],
                                });
                        }
                        response.status(200).send(JSON.stringify(result));
                    } catch {
                        response.status(500).send(JSON.stringify({}));
                    }
                    break;
                }

                default: {
                    response.status(200).send(JSON.stringify({}));
                }
            }
        } else {
            response.status(200).send(JSON.stringify(this.network));
        }
    });

    //#endregion ---- Communication with editor ----
}

//#endregion ----- Module-level support functions ----- //

module.exports = (RED) => {
    nodeConfig.RED = RED;

    RED.log.debug('node-red-contrib-ccu-jack version: ' + package_.version);

    if (process.env.NRCCJ_DEV === 'true') {
        RED.log.warn('Development features enabled');
        nodeConfig.development = true;
    }

    RED.nodes.registerType(nodeConfig.nodeName, nodeInstance, {
        credentials: {
            user: { type: 'text' },
            password: { type: 'password' },
        },
    });
};
