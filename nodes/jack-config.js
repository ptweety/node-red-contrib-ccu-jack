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

    this.consumers = {};

    this.globalContext = this.context().global;
    this.contextStore = {};
    this.userStore = {};
    this.timerContextStore;
    this.usecontext = config.usecontext;

    this.isLocal = config.host.startsWith('127.') || config.host === 'localhost' || false;

    this.useauth = config.useauth || false;
    this.usetls = config.usetls || false;

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

    this.rootDomains = [];

    this.subscriptionId = 0;

    /**
     * Save contextStore to global context
     * @param {boolean} active - start update timer on request
     * @returns {void}
     */
    this.setContext = (active) => {
        if (this.contextStore) {
            this.contextStore.ts = Date.now();
            if (nodeConfig.development) {
                console.dir(this.contextStore);
            }
        }

        if (this.userStore && this.usecontext) {
            this.userStore.ts = Date.now();
            this.globalContext.set('jack-config-' + config.id, this.userStore, (error) => {
                if (error) this.error(error);
            });
        } else {
            this.globalContext.set('jack-config-' + config.id, undefined, (error) => {
                if (error) this.error(error);
            });
        }

        if (this.timerContextStore !== null) clearTimeout(this.timerContextStore);

        if (active) {
            this.timerContextStore = setTimeout(() => {
                this.setContext(true);
            }, 10_000);
        }
    };

    // Set initial Context
    this.setContext(false);

    // Start up prep
    this.start = async () => {
        this.log(`Initializing connection to VEAP server (${this.host})`);
        this.setStatus(statusTypes.CONNECTING);

        try {
            this.network.discover = await discover();

            // 0. check minimal configuration
            if (!this.host || !this.port) throw 'Invalid host or port';

            // 1. check general connectivity to the VEAP server
            this.debug('Requesting configuration');
            const [root, vendor] = await this.jack.getConfig();

            this.contextStore = {
                values: {},
                ...this.contextStore,
                '.': root,
                '.vendor': vendor,
                ts: Date.now(),
                status: Object.keys(statusTypes).find((key) => statusTypes[key] === this.status),
            };

            // 2. get information about the available domains
            this.debug('Requesting domains');
            const rootDomains = await this.jack.getDomains();

            for (const domain of rootDomains) {
                this.rootDomains.push(domain.identifier);
            }

            // 3. follow the ~links of each domain and gather more data
            this.debug('Requesting resources');
            const [domainChildren, domainResources] = await this.jack.getDomainResources(this.rootDomains);

            this.contextStore = {
                ...this.contextStore,
                ...domainResources,
            };

            if (this.usecontext)
                for (const domainResource in domainResources)
                    RED.util.setObjectProperty(
                        this.userStore,
                        `${domainResource}`,
                        domainResources[domainResource],
                        true
                    );

            for (const domain of rootDomains) {
                this.contextStore[domain.identifier]['.'] = {
                    ...domain,
                    ...(domainChildren[domain.identifier] !== undefined && domainChildren[domain.identifier]),
                };
            }

            // 4. follow the ~links of each device and gather channels
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

            // 5. follow the ~links of each channel and gather datapoints
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

            // 6. ready to connect to MQTT broker and receive updates
            this.log('Initialized');
            this.setStatus(statusTypes.CONNECTED);

            this.setContext(true);
        } catch (error) {
            this.setStatus(statusTypes.ERROR);
            this.error(error);
        }
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

        this.setStatus();

        return true;
    };

    /**
     * De-Register a child from this node
     * @param childNode
     * @returns {boolean}
     */
    this.deregister = (childNode) => {
        if (this.consumers[childNode.id]) {
            for (const id of this.consumers[childNode.id].subscriptions) this.unsubscribe(id);
            delete this.consumers[childNode.id];
            return true;
        }
        return false;
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
            this.error('subscribe: called without callback');
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
                this.error('subscribe: called with invalid filter property ' + propertiesArray[index]);
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
     * Un-Subscribe a child from this node
     * @param subscriptionId
     * @returns {boolean}
     */
    this.unsubscribe = (subscriptionId) => {
        this.events.removeListener(subscriptionId);
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
                    domains: this.rootDomains,
                });
        }
    };

    //#endregion ---- Communication with child nodes ----

    //#region ---- Functions for child nodes ----

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
            this.error(
                `getMessagePayload: ${RED._('node-red:mqtt.errors.invalid-json-parse')}` +
                    ` - message: { ${message} } - ERROR: ${error}`
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
     * @returns {object} mutated payload in contextStore
     */
    this.savePayload = (domain, topic, payload) => {
        if (!hasProperty(this.contextStore.values, domain)) this.contextStore.values[domain] = new Map();

        if (this.contextStore.values[domain].has(topic)) {
            const item = this.contextStore.values[domain].get(topic);
            if (item.v === payload.v) {
                // item resent
                payload.cache = false;
                payload.change = false;
            } else {
                // item updated
                payload.vP = item.v;
                payload.tsP = item.ts;
                payload.cache = false;
                payload.change = true;
            }
        } else {
            // new item
            payload.vP;
            payload.tsP;
            payload.cache = true;
            payload.change = false;
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
                    if (!hasProperty(this.contextStore[domain], device)) return;
                    if (!hasProperty(this.contextStore[domain][device], channel)) return;
                    if (!hasProperty(this.contextStore[domain][device][channel], datapoint)) return;
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
                        this.error(
                            `onMessage: invalid or not in Cache` +
                                ` - domain: ${domain} - device: ${device} - channel: ${channel} - datapoint: ${datapoint} - ERROR: ${error}`
                        );
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
                        this.error(
                            `onMessage: invalid or not in Cache` +
                                ` - domain: ${domain} - iseId: ${iseId} - ERROR: ${error}`
                        );
                    }
                    break;
                }
            }
        } catch (error) {
            this.error(`onMessage: unable to find ${topicParts} in Cache - ERROR: ${error}`);
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
            if (topic && !isValidTopic(topic)) throw new Error(`Topic "${topic}" invalid`);

            const topicParts = topic ? topic.split('/') : [];
            if (topic && (topicParts.length === 1 || topicParts[0] === undefined)) return;

            const domain = topicParts.shift();
            if (!this.rootDomains.includes(domain)) throw new Error(`Domain "${domain}" not found`);

            if (topicParts[0] === 'status') topicParts.shift();
            else return;

            /** @type {Payload} */ let payload = this.getPayloadFromMessage(message);
            if (!hasProperty(payload, 'v')) throw new Error(`Content of payload invalid`);

            payload = this.savePayload(domain, topic, payload);
            const item = this.prepareReply(domain, topicParts, payload.v);

            if (this.usecontext && [domainTypes.DEVICE, domainTypes.VIRTDEV].includes(domain)) {
                RED.util.setObjectProperty(
                    this.userStore,
                    `${domain}.${item.device}.${item.channelIndex}.${item.datapoint}.payload`,
                    payload,
                    true
                );
            }

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
            this.error(`onMessage: unable to process inputs - ${error}`);
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
            if (topic && !isValidTopic(topic)) throw new Error(`Topic "${topic}" invalid`);

            const topicParts = topic ? topic.split('/') : [];
            if (topic && topicParts.length !== 5) throw new Error(`Content of topic "${topic}" invalid`);

            const domains = new Set([domainTypes.DEVICE, domainTypes.VIRTDEV]);

            const [topicDomain, _, topicDevice, topicChannelIndex, topicDatapoint] = topicParts;
            const {
                domain: packetDomain,
                device: packetDevice,
                channelIndex: packetChannelIndex,
                datapoint: packetDatapoint,
            } = packet;

            const domain = topicDomain && domains.has(topicDomain) ? topicDomain : packetDomain;

            if (!this.rootDomains.includes(domain)) throw new Error(`Domain "${domain}" not found`);

            const device = topicDevice || packetDevice;
            const channelIndex = topicChannelIndex || packetChannelIndex;
            const datapoint = topicDatapoint || packetDatapoint;

            if (!(device && channelIndex && datapoint))
                throw new Error(
                    `Either device "${device}", channelIndex "${channelIndex}" or datapoint "${datapoint}" not found`
                );

            /** @type {Payload} */ let payload;
            const statusItem = `${domain}/status/${device}/${channelIndex}/${datapoint}`;
            if (this.contextStore.values[domain].has(statusItem))
                payload = this.contextStore.values[domain].get(statusItem);

            const item = this.prepareReply(domain, [device, channelIndex, datapoint], payload.v);

            if (!(payload && item)) throw new Error('No values found for "' + statusItem + '" in context store');

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
        } catch (error) {
            // this.error(`onInput: unable to process inputs - ${error}`);
            const id = eventTypes.ERROR + ':' + this.config.id + '_' + childNodeID;

            if (this.consumers[childNodeID].subscriptions.has(id)) {
                // Reply
                this.events.emit(id, { topic, message, error: `onInput: unable to process inputs - ${error}` });
            }
        } finally {
            if (done) done();
        }
    };

    //#endregion ---- Functions for child nodes ----

    // START NODE
    this.start();

    this.on('message', (_message, _send, done) => {
        done();
    });

    this.on('input', (_message, _send, done) => {
        done();
    });

    // CLOSE NODE
    this.on('close', async (_removed, done) => {
        this.log(`Closing connection to VEAP server (${this.host})`);

        this.setContext(false);
        this.setStatus(statusTypes.NOTCONNECTED);

        done();
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
                                                    label: datapointItem.identifier,
                                                });
                                            }
                                        }

                                        if (matchDatapoint) {
                                            matchChannel = true;

                                            for (const room of channelItem.rooms) {
                                                const roomItem = this.contextStore[domainTypes.ROOM][room]['.'];

                                                result.room.set(roomItem.identifier, {
                                                    value: roomItem.identifier,
                                                    label: roomItem.identifier + ' - ' + roomItem.title,
                                                });
                                            }

                                            for (const function_ of channelItem.functions) {
                                                const functionItem =
                                                    this.contextStore[domainTypes.FUNCTION][function_]['.'];

                                                result.function.set(functionItem.identifier, {
                                                    value: functionItem.identifier,
                                                    label: functionItem.identifier + ' - ' + functionItem.title,
                                                });
                                            }

                                            result.channel.set(channelItem.address, {
                                                value: channelItem.address,
                                                label: channelItem.address + ' - ' + channelItem.title,
                                            });

                                            result.channelType.set(channelItem.type, {
                                                value: channelItem.type,
                                                label: channelItem.type,
                                            });

                                            if (
                                                rqChannelIndex.length === 0 ||
                                                rqChannelIndex.includes(channelItem.identifier)
                                            )
                                                result.channelIndex.set(channelItem.identifier, {
                                                    value: channelItem.identifier,
                                                    label: channelItem.identifier,
                                                });
                                        }
                                    }
                                }

                                if (matchChannel) {
                                    result.interfaceType.set(deviceItem.interfaceType, {
                                        value: deviceItem.interfaceType,
                                        label: deviceItem.interfaceType,
                                    });

                                    result.deviceType.set(deviceItem.type, {
                                        value: deviceItem.type,
                                        label: deviceItem.type,
                                    });

                                    if (rqDevice.length === 0 || rqDevice.includes(device))
                                        result.device.set(deviceItem.identifier, {
                                            value: deviceItem.identifier,
                                            label: deviceItem.identifier + ' - ' + deviceItem.title,
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
                                    label: items[item]['.'].identifier + ' - ' + items[item]['.'].title,
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
